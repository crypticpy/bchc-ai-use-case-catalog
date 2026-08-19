#!/usr/bin/env node
/**
 * Stamp `updated:` on the entries whose text changed in a push.
 *
 *   node scripts/stamp_updated.mjs <before-sha> <after-sha> [--date YYYY-MM-DD] [--dry-run]
 *
 * `updated` is the date an entry's content last changed — the entry page shows
 * it, "Recently updated" sorts by it, the feed and the staleness notice read it.
 * Edits reach `main` from many directions (Suggest an edit, a reply on the
 * original issue, a maintainer's direct commit) and nobody remembers to bump a
 * date by hand, so the deploy that publishes a change stamps it
 * (.github/workflows/pages.yml, job `stamp`).
 *
 * The rules, so the date keeps meaning "the text changed":
 *   - only files git reports as *modified* between the two commits count — an
 *     added entry has `published`, and that is its date;
 *   - only `<entry.path>/<slug>/index.md`, never screenshots or attachments;
 *   - an entry marked `sample: true` is the template's demo content, not a
 *     resource somebody edited, and is left alone;
 *   - an `updated:` that already says today or later is left alone, which is
 *     what makes the stamp commit itself a no-op if it ever re-triggers a run.
 *
 * The front matter is edited textually — the line is replaced or inserted after
 * `published:` — so comments and key order survive; parsing and re-emitting the
 * YAML would drop every comment. The key is `entry.updated_key` from
 * `_data/schema.yml` when set (the templates read the same pointer), `updated`
 * otherwise.
 *
 * Step outputs (when $GITHUB_OUTPUT is set): `count`, and `stamped` — one
 * repo-relative path per line. Exit 0 in every ordinary case, including
 * "nothing to stamp"; the workflow decides whether to commit.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { setOutput } from './lib/actions_output.mjs';
import { entryPathFrom, frontMatter, readSchema } from './lib/setup-io.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NO_COMMIT = /^0{40}$/;

/**
 * Today as `YYYY-MM-DD` in UTC — the same clock the scaffolder stamps
 * `published` with.
 * @param {Date} [now]
 * @returns {string}
 */
export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * The entry files git reports as modified — not added, not deleted — between
 * two commits, restricted to `<entryPath>/<slug>/index.md`.
 *
 * @param {string} root repository root (a git work tree).
 * @param {string} before the commit the push started from; the all-zeros sha
 *   of a branch creation or a force-push means "no baseline" and yields [].
 * @param {string} after the pushed commit.
 * @param {string} entryPath the schema's `entry.path`.
 * @returns {string[]} repo-relative paths, forward slashes, sorted.
 */
export function changedEntryFiles(root, before, after, entryPath) {
  if (!before || !after || NO_COMMIT.test(before)) return [];
  let out;
  try {
    out = execFileSync(
      'git',
      // --no-renames: an entry moved to a new slug *and* edited would otherwise
      // be reported as R, not M, and never stamped.
      ['diff', '--name-only', '--no-renames', '--diff-filter=M', '-z', before, after, '--', `${entryPath}/`],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    // A shallow clone that does not reach `before` — the caller reports it.
    throw new Error(
      `git diff ${before.slice(0, 7)}..${after.slice(0, 7)} failed: ${error.stderr || error.message}`,
      { cause: error }
    );
  }
  const wanted = new RegExp(`^${entryPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+/index\\.md$`);
  return out
    .split('\0')
    .filter((file) => wanted.test(file))
    .sort();
}

/**
 * The file with `<key>: <date>` set in its front matter, or unchanged.
 *
 * @param {string} text the whole file.
 * @param {string} date `YYYY-MM-DD`.
 * @param {string} [key] the front matter key, `updated` by default.
 * @returns {{text: string, changed: boolean, reason: string}} `reason` says
 *   why nothing changed: `no-front-matter`, `sample`, `current` (already
 *   today or later); `stamped` or `inserted` when it did.
 */
export function stampFrontMatter(text, date, key = 'updated') {
  const source = String(text ?? '');
  const data = frontMatter(source);
  if (!data) return { text: source, changed: false, reason: 'no-front-matter' };
  if (data.sample === true) return { text: source, changed: false, reason: 'sample' };

  // A file that arrived with CRLF line endings (a web upload, the Contents
  // API) keeps them: the line ending is detected once and reused.
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(eol);
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyLine = new RegExp(`^${escapedKey}:[ \\t]*(.*?)[ \\t]*$`);

  for (let index = 1; index < end; index += 1) {
    const match = keyLine.exec(lines[index]);
    if (!match) continue;
    const current = match[1].replace(/^["']|["']$/g, '');
    if (DATE.test(current) && current >= date) return { text: source, changed: false, reason: 'current' };
    lines[index] = `${key}: ${date}`;
    return { text: lines.join(eol), changed: true, reason: 'stamped' };
  }

  // Not there yet: right after `published:` where a reader expects it, else at
  // the end of the front matter.
  const after = lines.findIndex((line, index) => index > 0 && index < end && /^published:/.test(line));
  const at = after === -1 ? end : after + 1;
  lines.splice(at, 0, `${key}: ${date}`);
  return { text: lines.join(eol), changed: true, reason: 'inserted' };
}

/**
 * Stamp every modified entry between two commits.
 *
 * @param {string} root repository root.
 * @param {{before: string, after: string, date?: string, dryRun?: boolean}} options
 * @returns {{stamped: string[], skipped: {file: string, reason: string}[], date: string}}
 */
export function stampUpdated(root, { before, after, date = today(), dryRun = false }) {
  const schema = readSchema(root);
  const key = String(schema?.entry?.updated_key ?? 'updated');
  const result = { stamped: [], skipped: [], date };
  for (const file of changedEntryFiles(root, before, after, entryPathFrom(schema))) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    const { text, changed, reason } = stampFrontMatter(fs.readFileSync(absolute, 'utf8'), date, key);
    if (!changed) {
      result.skipped.push({ file, reason });
      continue;
    }
    result.stamped.push(file);
    if (!dryRun) fs.writeFileSync(absolute, text, 'utf8');
  }
  return result;
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const dateIndex = argv.indexOf('--date');
  const date = dateIndex === -1 ? today() : String(argv[dateIndex + 1] ?? '');
  const positional = argv.filter(
    (arg, index) => !arg.startsWith('--') && (dateIndex === -1 || index !== dateIndex + 1)
  );
  const [before, after] = positional;
  if (!before || !after || !DATE.test(date)) {
    console.error(
      'usage: node scripts/stamp_updated.mjs <before-sha> <after-sha> [--date YYYY-MM-DD] [--dry-run]'
    );
    return 2;
  }
  let result;
  try {
    // The checkout the workflow runs in, like every other scripts/*.mjs.
    result = stampUpdated(process.cwd(), { before, after, date, dryRun });
  } catch (error) {
    // Not a failure of the deploy: say so and stamp nothing.
    console.error(String(error.message ?? error));
    setOutput('count', 0);
    setOutput('stamped', '');
    return 0;
  }
  for (const file of result.stamped)
    console.log(`${dryRun ? 'would stamp' : 'stamped'} ${file} (${result.date})`);
  for (const { file, reason } of result.skipped) console.log(`left ${file} alone (${reason})`);
  if (!result.stamped.length && !result.skipped.length) console.log('No entry text changed in this push.');
  setOutput('count', result.stamped.length);
  setOutput('stamped', result.stamped.join('\n'));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
