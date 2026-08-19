#!/usr/bin/env node
/**
 * Monthly verification sweep: which catalog entries nobody has confirmed lately.
 *
 * Usage:  node scripts/verification_sweep.mjs [--today YYYY-MM-DD] [--json]
 * Outputs (Actions): `count`, `title`, `body` — see .github/workflows/verification-sweep.yml
 *
 * An entry is "confirmed" on the newest of its `verified`, `updated` and
 * `published` dates, the same rule the entry page uses (see the `verification`
 * filter in _plugins/schema_filters.rb). Past `catalog.verify_after_days` in
 * _data/site.yml, both the page and this sweep say so.
 *
 * The sweep produces ONE issue, not one per entry. A catalog that has been
 * running for three years will cross the line in clumps, and thirty notifications
 * on the first of the month is how a maintainer mutes the whole thing; a single
 * checklist that the next month's run rewrites in place is a to-do list instead.
 *
 * Nothing here calls the GitHub API — the workflow does that with the strings
 * this prints, which keeps the interesting half runnable by hand and unit
 * testable, and keeps issue text out of any shell interpolation.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

import { setOutput } from './lib/actions_output.mjs';

const DEFAULT_AFTER_DAYS = 365;
const MS_PER_DAY = 86400000;
/** Front matter keys that count as "someone looked at this", strongest first. */
export const VERIFICATION_KEYS = ['verified', 'updated', 'published'];

/* -------------------------------------------------------------- pure parts */

/**
 * Parse a `YYYY-MM-DD` string (or a Date/Y-M-D value js-yaml already coerced)
 * into a UTC timestamp. Anything unparseable is null rather than NaN, so one
 * typo in one entry cannot poison the whole sweep.
 * @param {unknown} value
 * @returns {number|null} milliseconds since epoch, UTC midnight
 */
export function toDay(value) {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const stamp = Date.UTC(y, m - 1, d);
  const back = new Date(stamp);
  // Rejects 2026-02-31 and friends, which Date.UTC would happily roll forward.
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return stamp;
}

/**
 * The newest of an entry's verification dates, and which key it came from.
 * @param {Record<string, unknown>} data front matter
 * @param {string[]} [keys]
 * @returns {{key: string, day: number}|null} null when the entry has no usable date
 */
export function lastConfirmed(data, keys = VERIFICATION_KEYS) {
  let best = null;
  for (const key of keys) {
    const day = toDay(data?.[key]);
    if (day === null) continue;
    if (!best || day > best.day) best = { key, day };
  }
  return best;
}

/**
 * @param {string} iso a `YYYY-MM-DD` string
 * @returns {string} e.g. "March 2025"
 */
export function monthName(iso) {
  const day = toDay(iso);
  if (day === null) return iso;
  return new Date(day).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Split the entries that have gone unconfirmed for longer than `afterDays`,
 * oldest first — the order a maintainer would work the list in.
 * @param {Array<object>} entries from `collectEntries`
 * @param {number} todayDay UTC-midnight timestamp of the reference day
 * @param {number} afterDays
 * @returns {Array<object>} the stale subset, each with `days` and `since` added
 */
export function staleEntries(entries, todayDay, afterDays) {
  const limit = Number(afterDays) > 0 ? Number(afterDays) : DEFAULT_AFTER_DAYS;
  return entries
    .map((entry) => {
      const best = lastConfirmed(entry.data);
      if (!best) return null;
      const days = Math.round((todayDay - best.day) / MS_PER_DAY);
      if (days <= limit) return null;
      return { ...entry, days, key: best.key, since: new Date(best.day).toISOString().slice(0, 10) };
    })
    .filter(Boolean)
    .sort((a, b) => b.days - a.days || a.slug.localeCompare(b.slug));
}

/**
 * The issue body: a checklist a maintainer can work through and tick off.
 * @param {object} options
 * @param {Array<object>} options.stale from `staleEntries`
 * @param {string} options.repo "owner/name"
 * @param {string} options.branch default branch, for the edit links
 * @param {string} options.siteUrl site root with no trailing slash ('' when unknown)
 * @param {number} options.afterDays
 * @param {string} options.today `YYYY-MM-DD`, the date to suggest for `verified:`
 * @returns {string} markdown
 */
export function issueBody({ stale, repo, branch, siteUrl, afterDays, today }) {
  const lines = [
    `${stale.length === 1 ? 'One entry has' : `${stale.length} entries have`} gone more than ` +
      `${afterDays} days without anyone confirming the details are still true. Until they are ` +
      `confirmed, each one shows a "last confirmed" note to readers.`,
    '',
    `**To clear an item:** ask the contact whether anything has changed, then open a pull request ` +
      `setting \`verified: ${today}\` (today's date) in that entry's front matter — correcting anything ` +
      `that moved while you are there.`,
    '',
  ];
  for (const entry of stale) {
    const link = siteUrl ? `[${entry.title}](${siteUrl}${entry.url})` : `**${entry.title}**`;
    const edit = repo
      ? ` · [edit front matter](https://github.com/${repo}/edit/${branch}/${entry.file})`
      : '';
    const contact = entry.contact ? ` · ${entry.contact}` : ' · _no contact on file_';
    lines.push(
      `- [ ] ${link} — last confirmed ${monthName(entry.since)} (\`${entry.key}\`)${contact}${edit}`
    );
  }
  lines.push(
    '',
    '<sub>Opened by `.github/workflows/verification-sweep.yml`. This issue is rewritten in place each ' +
      'month; close it when the list is empty and the next sweep will open a fresh one.</sub>'
  );
  return lines.join('\n');
}

/* --------------------------------------------------------------- file side */

/**
 * Split a `---` front matter document. Returns `{}` for anything that has none.
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return {};
  try {
    const data = yaml.load(match[1]);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/**
 * Read every entry folder under the schema's `entry.path`.
 * @param {string} root repository root
 * @returns {{entries: Array<object>, afterDays: number, repo: string, branch: string, siteUrl: string}}
 */
export function collectEntries(root) {
  const read = (rel) => {
    try {
      return yaml.load(fs.readFileSync(path.join(root, rel), 'utf8')) || {};
    } catch {
      return {};
    }
  };
  const schema = read(path.join('_data', 'schema.yml'));
  const site = read(path.join('_data', 'site.yml'));
  const config = read('_config.yml');

  const entryPath = schema.entry?.path || 'catalog';
  // Schema-driven, never a hardcoded key: the contact is whichever field the
  // site declared as an email.
  const emailKeys = (Array.isArray(schema.fields) ? schema.fields : [])
    .filter((field) => field.type === 'email')
    .map((field) => field.key);

  const dir = path.join(root, entryPath);
  const entries = [];
  if (fs.existsSync(dir)) {
    for (const dirent of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      if (!dirent.isDirectory()) continue;
      const file = path.join(entryPath, dirent.name, 'index.md');
      const full = path.join(root, file);
      if (!fs.existsSync(full)) continue;
      const data = parseFrontMatter(fs.readFileSync(full, 'utf8'));
      const contact = emailKeys.map((key) => data[key]).find((value) => value && String(value).trim() !== '');
      entries.push({
        slug: dirent.name,
        file,
        title: String(data.title || dirent.name),
        url: `/${entryPath}/${dirent.name}/`,
        contact: contact ? String(contact) : '',
        data,
      });
    }
  }

  const baseUrl = String(config.baseurl || '').replace(/\/$/, '');
  const siteUrl = config.url ? `${String(config.url).replace(/\/$/, '')}${baseUrl}` : '';

  return {
    entries,
    afterDays:
      Number(site.catalog?.verify_after_days) > 0
        ? Number(site.catalog.verify_after_days)
        : DEFAULT_AFTER_DAYS,
    repo: String(site.github?.repository || ''),
    branch: String(site.github?.branch || 'main'),
    siteUrl,
  };
}

/* -------------------------------------------------------------------- main */

/** @returns {void} */
function main() {
  const args = process.argv.slice(2);
  const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : '';
  const todayDay = toDay(todayArg) ?? toDay(new Date().toISOString().slice(0, 10));
  const today = new Date(todayDay).toISOString().slice(0, 10);

  const { entries, afterDays, repo, branch, siteUrl } = collectEntries(process.cwd());
  const stale = staleEntries(entries, todayDay, afterDays);
  const title = `Verification sweep — ${today.slice(0, 7)}`;
  const body = stale.length === 0 ? '' : issueBody({ stale, repo, branch, siteUrl, afterDays, today });

  if (args.includes('--json')) {
    console.log(JSON.stringify({ count: stale.length, title, stale: stale.map((e) => e.slug) }, null, 2));
  } else {
    console.log(`${stale.length} of ${entries.length} entries unconfirmed for more than ${afterDays} days.`);
    for (const entry of stale) console.log(`  ${entry.slug} — ${entry.since} (${entry.days} days)`);
  }

  setOutput('count', String(stale.length));
  setOutput('title', title);
  setOutput('body', body);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
