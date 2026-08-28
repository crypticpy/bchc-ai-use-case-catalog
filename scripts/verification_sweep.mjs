#!/usr/bin/env node
/**
 * Monthly refresh sweep: which catalog entries nobody has confirmed lately, and
 * one issue per entry asking the people who can answer.
 *
 * Usage:  node scripts/verification_sweep.mjs [--today YYYY-MM-DD] [--json]
 * Outputs (Actions): `count`, `issues`, `max_new` — see
 * .github/workflows/verification-sweep.yml
 *
 * An entry is "confirmed" on the newest of its `verified`, `updated` and
 * `published` dates, the same rule the entry page uses (see the `verification`
 * filter in _plugins/schema_filters.rb). Past `catalog.verify_after_days` in
 * _data/site.yml, both the page and this sweep say so.
 *
 * One issue per stale entry, not one checklist for all of them: a refresh is a
 * conversation with one submitter about one project, and a shared checklist has
 * nowhere to hold that conversation. Each issue carries a stable marker —
 * `<!-- refresh-entry: <slug> -->` — so the next run finds and rewrites the same
 * thread instead of forking a new one. Deduplication is on the marker and never
 * on the title, because the title carries dates that move.
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
/**
 * How many refresh issues one run may OPEN.
 *
 * A three-year-old catalog crosses the line in clumps, and forty new issues on
 * the first of the month is how a maintainer mutes the label. The oldest
 * entries make the cut; the rest are reported as deferred in the run summary
 * and picked up next month, so nothing is silently dropped. Issues that already
 * exist are always refreshed and never counted against this.
 * `catalog.refresh_max_new_issues` in _data/site.yml overrides it.
 */
export const DEFAULT_MAX_NEW_ISSUES = 20;
/**
 * How many issue bodies one run hands to the workflow.
 *
 * A separate concern from the cap above, and a much larger number: this one is
 * a size guard, not a courtesy. Every body travels through `$GITHUB_OUTPUT`,
 * which is not an unbounded channel, so a catalog with a thousand overdue
 * entries must not turn the monthly job permanently red. The list of stale
 * slugs is emitted in full regardless (it is cheap, and the workflow needs all
 * of it to decide which issues to close), so nothing beyond this is mistaken
 * for fresh — it is only deferred, and the run summary says so.
 */
export const MAX_ISSUE_PAYLOAD = 200;
/** The template of the per-entry dedupe marker; also parsed by the workflow. */
export const MARKER_PREFIX = 'refresh-entry:';

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
 * oldest first — the order a maintainer would work the list in, and the order
 * the per-run cap keeps when it defers the tail.
 * @param {Array<object>} entries from `collectEntries`
 * @param {number} todayDay UTC-midnight timestamp of the reference day
 * @param {number} afterDays
 * @param {string[]} [keys] which front matter keys count as "confirmed";
 *   defaults to the reserved `verified`/`updated`/`published` keys, but a
 *   catalog that renamed `verified` via `entry.verified_key` (or `updated`
 *   via `entry.updated_key`) needs the sweep to read the same key it writes.
 * @returns {Array<object>} the stale subset, each with `days` and `since` added
 */
export function staleEntries(entries, todayDay, afterDays, keys = VERIFICATION_KEYS) {
  const limit = Number(afterDays) > 0 ? Number(afterDays) : DEFAULT_AFTER_DAYS;
  return entries
    .map((entry) => {
      const best = lastConfirmed(entry.data, keys);
      if (!best) return null;
      const days = Math.round((todayDay - best.day) / MS_PER_DAY);
      if (days <= limit) return null;
      return { ...entry, days, key: best.key, since: new Date(best.day).toISOString().slice(0, 10) };
    })
    .filter(Boolean)
    .sort((a, b) => b.days - a.days || a.slug.localeCompare(b.slug));
}

/**
 * A GitHub username as a mention, or '' for anything that is not one.
 *
 * The stored value is whatever a submitter typed into a text box, so a leading
 * `@` is stripped before the single one is put back, and a value that cannot be
 * a GitHub name — an email address, a URL, a sentence — mentions nobody rather
 * than pinging whatever the first word happens to be. `org/team` is allowed:
 * a team mention is a legitimate audience for `catalog.refresh_mentions`.
 * @param {unknown} value
 * @returns {string} e.g. "@jordan-lee", or ''
 */
export function handleMention(value) {
  const text = String(value ?? '')
    .trim()
    .replace(/^@+/, '');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9][A-Za-z0-9-]{0,38})?$/.test(text)) return '';
  return `@${text}`;
}

/**
 * The mention line, or '' when nobody is named.
 * @param {object} options
 * @param {unknown} options.submitter the entry's stored handle
 * @param {Array<unknown>} [options.mentions] `catalog.refresh_mentions`
 * @returns {string}
 */
export function mentionLine({ submitter, mentions = [] }) {
  const submitterMention = handleMention(submitter);
  const rest = mentions.map(handleMention).filter((mention) => mention && mention !== submitterMention);
  const all = [submitterMention, ...new Set(rest)].filter(Boolean);
  if (all.length === 0) return '';
  return submitterMention
    ? `${all.join(' ')} — you submitted this entry, so you are the first person asked.`
    : `${all.join(' ')} — nobody is named on this entry, so this one is the maintainers' to chase.`;
}

/**
 * Strip every `<` and `>` character out of `text`.
 *
 * Earlier versions of this function tried to recognize and remove HTML
 * *comments* (`/<!--[\s\S]*?-->/`), even looped to a fixed point. That is a
 * multi-character pattern-matching approach, and those can always be
 * defeated by reassembly: removing one recognized token can expose the
 * characters of another. `<!<!---->--` is the canonical example — deleting
 * the inner `<!---->` leaves the outer `<` and `!--` adjacent, which reads
 * as a fresh `<!--`. HTML also treats `--!>` as a comment close, which a
 * pattern tuned only for `-->` would miss entirely.
 *
 * Dropping every `<` and `>` character, in one single-character pass, sits
 * outside that whole class of bug: there is no token to reconstruct because
 * there is no multi-character token being matched in the first place — no
 * `<` survives into the output, so no comment opener (`<!--`, `<!`) can
 * exist in it regardless of how the input is shaped. This is title text
 * rendered into a GitHub issue body that also carries the
 * `<!-- refresh-entry: <slug> -->` dedupe marker the workflow reads back
 * with a first-match regex, and it must never be able to forge one. Losing
 * literal angle brackets from an issue-heading title is an acceptable cost
 * for that guarantee.
 * @param {string} text
 * @returns {string}
 */
export function plainTitle(text) {
  return String(text ?? '').replace(/[<>]/g, '');
}

/**
 * The HTML comment that ties an issue to an entry across runs.
 * @param {string} slug
 * @returns {string}
 */
export function issueMarker(slug) {
  return `<!-- ${MARKER_PREFIX} ${slug} -->`;
}

/**
 * The one issue for one stale entry: what is being asked, of whom, and the two
 * links that answer it in a click.
 *
 * @param {object} options
 * @param {object} options.entry one item from `staleEntries`
 * @param {string} options.repo "owner/name"
 * @param {string} options.branch default branch, for the edit link
 * @param {string} options.siteUrl site root with no trailing slash ('' when unknown)
 * @param {number} options.afterDays
 * @param {Array<unknown>} [options.mentions] `catalog.refresh_mentions`
 * @returns {{slug: string, title: string, marker: string, body: string}}
 */
export function refreshIssue({ entry, repo, branch, siteUrl, afterDays, mentions = [] }) {
  const link = siteUrl ? `[${entry.title}](${siteUrl}${entry.url})` : `**${entry.title}**`;
  const confirmUrl = repo
    ? `https://github.com/${repo}/issues/new?template=refresh-entry.yml&slug=${encodeURIComponent(entry.slug)}`
    : '';
  const editUrl = repo ? `https://github.com/${repo}/edit/${branch}/${entry.file}` : '';
  const lines = [
    `${link} was last confirmed **${monthName(entry.since)}** — ${entry.days} days ago, past the ` +
      `${afterDays}-day window this catalog keeps. Until someone confirms it, the entry page tells ` +
      `readers so.`,
    '',
    `Last confirmed from its \`${entry.key}\` date (\`${entry.since}\`).`,
  ];

  const mention = mentionLine({ submitter: entry.submitter, mentions });
  if (mention) lines.push('', mention);

  lines.push('', '**Two ways to answer, both about a minute:**', '');
  if (confirmUrl) {
    lines.push(
      `- **[Confirm it is still accurate](${confirmUrl})** — a short form. Choosing *Yes* opens a ` +
        "pull request that stamps today's date on the entry and closes this issue.",
      `- **[Say what changed](${confirmUrl})** — the same form. Choose *No*, describe what moved, and ` +
        'a maintainer picks it up from there.'
    );
    if (editUrl) {
      lines.push(`- Or [edit the entry directly](${editUrl}) if you would rather fix the text yourself.`);
    }
  } else {
    lines.push(
      '- Reply here to say it is still accurate, and a maintainer will stamp the entry.',
      '- Or reply with what changed, and a maintainer will update it.'
    );
  }

  lines.push(
    '',
    issueMarker(entry.slug),
    '<sub>Opened by `.github/workflows/verification-sweep.yml`. This issue is rewritten in place each ' +
      'month while the entry is unconfirmed, and closed automatically once it is. The comment line ' +
      'above is how the sweep finds this thread again — leave it in place.</sub>'
  );
  return {
    slug: entry.slug,
    title: `Still accurate? ${entry.title}`,
    marker: issueMarker(entry.slug),
    body: lines.join('\n'),
  };
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
 * @returns {{entries: Array<object>, afterDays: number, maxNew: number, mentions: string[],
 *   repo: string, branch: string, siteUrl: string, verificationKeys: string[]}}
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
  // site declared as an email, and the handle is whichever field the schema's
  // `entry.submitter_key` points at.
  const emailKeys = (Array.isArray(schema.fields) ? schema.fields : [])
    .filter((field) => field.type === 'email')
    .map((field) => field.key);
  const submitterKey = String(schema.entry?.submitter_key || '');
  // `refresh_entry_from_issue.mjs` stamps `schema.entry.verified_key` (default
  // `verified`) and `stamp_updated.mjs` stamps `schema.entry.updated_key`
  // (default `updated`) — a catalog that renamed either would otherwise have
  // its confirmations stamped in a key this sweep never reads, so the
  // reminder never closes.
  const verifiedKey = String(schema.entry?.verified_key ?? 'verified');
  const updatedKey = String(schema.entry?.updated_key ?? 'updated');
  const verificationKeys = [verifiedKey, updatedKey, 'published'];

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
        // The title is display text rendered straight into the issue body,
        // which also carries the `<!-- refresh-entry: <slug> -->` dedupe
        // marker; a title containing its own `<` and `>` could otherwise be
        // read back as (or ahead of) that marker by the workflow's regex.
        title: plainTitle(String(data.title || dirent.name)).trim() || dirent.name,
        url: `/${entryPath}/${dirent.name}/`,
        contact: contact ? String(contact) : '',
        submitter: submitterKey ? String(data[submitterKey] ?? '') : '',
        data,
      });
    }
  }

  const baseUrl = String(config.baseurl || '').replace(/\/$/, '');
  const siteUrl = config.url ? `${String(config.url).replace(/\/$/, '')}${baseUrl}` : '';
  const configuredMax = Number(site.catalog?.refresh_max_new_issues);

  return {
    entries,
    afterDays:
      Number(site.catalog?.verify_after_days) > 0
        ? Number(site.catalog.verify_after_days)
        : DEFAULT_AFTER_DAYS,
    maxNew: Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : DEFAULT_MAX_NEW_ISSUES,
    mentions: Array.isArray(site.catalog?.refresh_mentions) ? site.catalog.refresh_mentions : [],
    repo: String(site.github?.repository || ''),
    branch: String(site.github?.branch || 'main'),
    siteUrl,
    verificationKeys,
  };
}

/* -------------------------------------------------------------------- main */

/** @returns {void} */
function main() {
  const args = process.argv.slice(2);
  const todayArg = args.includes('--today') ? args[args.indexOf('--today') + 1] : '';
  const todayDay = toDay(todayArg) ?? toDay(new Date().toISOString().slice(0, 10));

  const { entries, afterDays, maxNew, mentions, repo, branch, siteUrl, verificationKeys } = collectEntries(
    process.cwd()
  );
  const stale = staleEntries(entries, todayDay, afterDays, verificationKeys);
  const issues = stale
    .slice(0, MAX_ISSUE_PAYLOAD)
    .map((entry) => refreshIssue({ entry, repo, branch, siteUrl, afterDays, mentions }));

  if (args.includes('--json')) {
    console.log(JSON.stringify({ count: stale.length, maxNew, issues }, null, 2));
  } else {
    console.log(`${stale.length} of ${entries.length} entries unconfirmed for more than ${afterDays} days.`);
    for (const entry of stale) console.log(`  ${entry.slug} — ${entry.since} (${entry.days} days)`);
  }

  setOutput('count', String(stale.length));
  setOutput('issues', JSON.stringify(issues));
  setOutput('slugs', stale.map((entry) => entry.slug).join('\n'));
  setOutput('max_new', String(maxNew));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
