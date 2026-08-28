#!/usr/bin/env node
/**
 * Answer a refresh reminder: stamp `verified:` on an entry, or route what
 * changed to the maintainers.
 *
 * Input (env): ISSUE_BODY, ISSUE_NUMBER
 * Output:      rewrites <entry path>/<slug>/index.md on the "still accurate" path
 *              $GITHUB_OUTPUT: outcome, and per outcome —
 *                confirmed → slug, file, branch, title, date
 *                changes   → slug, changes, branch — the same branch name a
 *                            prior "yes" answer on this same issue would have
 *                            used, so the workflow can find and close it
 *                none      → reason (a whole sentence the workflow quotes back)
 *              error, when the slug is not a usable path segment.
 *
 * The form is .github/ISSUE_TEMPLATE/refresh-entry.yml and the reminders that
 * link to it come from .github/workflows/verification-sweep.yml.
 *
 * Two answers, two different shapes of work:
 *   - "Yes, still accurate" is a fact about the entry that only needs a date,
 *     so it becomes a one-line pull request the maintainer merges.
 *   - "No, something changed" is prose about an entry, which nobody can apply
 *     mechanically. Guessing at the edit would produce a pull request whose
 *     diff nobody wrote; the notes go to the maintainers' queue instead and the
 *     issue stays open until a person has dealt with it.
 *
 * Anyone can open the issue that starts this job, so the slug is
 * pattern-checked and the resolved path re-checked against the entry directory
 * before any file is read or written, the issue text reaches the workflow only
 * through outputs written with random heredoc delimiters, and the front matter
 * is edited line-surgically (scripts/stamp_updated.mjs) so comments and key
 * order survive.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { fail, setOutput } from './lib/actions_output.mjs';
import { parseIssueForm, rawValue } from './lib/issue_body.mjs';
import { entryPathFrom, readSchema } from './lib/setup-io.mjs';
import { stampFrontMatter, today } from './stamp_updated.mjs';

const ROOT = process.cwd();

/** A slug is a folder name under the entry path, so keep it to this shape. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The form's field labels, in template order. */
export const FIELD = {
  slug: 'Entry slug',
  accurate: 'Is the entry still accurate as published?',
  changes: 'What changed?',
};

/**
 * The three answers, read from an issue-form body.
 * @param {string} body raw issue body
 * @returns {{slug: string, accurate: boolean|null, changes: string}} `accurate`
 *   is null when the dropdown was not answered in a way we recognise.
 */
export function readRefreshForm(body) {
  const { sections } = parseIssueForm(
    String(body ?? '').replace(/\r\n?/g, '\n'),
    Object.values(FIELD),
    FIELD.changes
  );
  const value = (label) => rawValue(sections, { label });
  const answer = value(FIELD.accurate).trim().toLowerCase();
  return {
    slug: value(FIELD.slug)
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, ''),
    // The dropdown options both open with the word, and a hand-written issue
    // says "yes" or "no" on its own; anything else is an unanswered question.
    accurate: /^yes\b/.test(answer) ? true : /^no\b/.test(answer) ? false : null,
    changes: value(FIELD.changes).trim(),
  };
}

/**
 * The entry file for a slug, or the sentence explaining why there isn't one.
 * @param {string} root repository root
 * @param {string} slug
 * @param {string} entryPath the schema's `entry.path`
 * @returns {{file: string, relative: string, error: string, reason: string}}
 */
export function resolveEntryFile(root, slug, entryPath) {
  const reject = (over) => ({ file: '', relative: '', error: '', reason: '', ...over });
  if (!slug) {
    return reject({
      reason:
        'The **Entry slug** box is empty, so there is no way to tell which entry this is about. ' +
        "The slug is the last part of the entry's web address — for `/" +
        `${entryPath}/automated-311-triage/\` it is \`automated-311-triage\`. Edit this issue to add it.`,
    });
  }
  if (!SLUG_PATTERN.test(slug)) {
    return reject({
      error: `Refusing to use ${JSON.stringify(slug)} as an entry slug; expected lowercase letters, numbers and hyphens.`,
    });
  }
  const base = path.resolve(root, entryPath);
  const dir = path.resolve(base, slug);
  if (!dir.startsWith(`${base}${path.sep}`)) {
    return reject({ error: `Refusing to read outside ${entryPath}/ (${dir}).` });
  }
  const relative = `${entryPath}/${slug}/index.md`;
  if (!fs.existsSync(path.join(dir, 'index.md'))) {
    return reject({
      reason:
        `There is no entry at \`${relative}\`, so nothing was changed. Open the entry on the site and ` +
        `copy the last part of its address — for \`/${entryPath}/automated-311-triage/\` the slug is ` +
        '`automated-311-triage` — then edit this issue to correct the **Entry slug** box.',
    });
  }
  return reject({ file: path.join(dir, 'index.md'), relative });
}

/**
 * Why a stamp changed nothing, as a sentence for the submitter.
 * @param {string} reason from `stampFrontMatter`
 * @param {string} relative repo-relative path of the entry
 * @param {string} date the date that would have been written
 * @returns {string}
 */
export function noChangeReason(reason, relative, date) {
  switch (reason) {
    case 'current':
      return (
        `\`${relative}\` already carries a confirmation date of ${date} or later, so there was nothing ` +
        'to stamp — somebody has confirmed this entry today. Nothing is wrong; you can close this issue.'
      );
    case 'sample':
      return (
        `\`${relative}\` is sample content that ships with the template rather than a real entry, so it ` +
        'is left alone. Nothing needs confirming here.'
      );
    case 'no-front-matter':
      return (
        `\`${relative}\` has no settings block at the top of the file, so it cannot be edited safely. ` +
        'A maintainer needs to look at that file.'
      );
    default:
      return `\`${relative}\` was left unchanged (${reason}).`;
  }
}

/* -------------------------------------------------------------------- main */

/** Report "nothing changed" with the sentence that says why, and exit cleanly. */
function noChange(reason) {
  console.error(reason);
  setOutput('outcome', 'none');
  setOutput('reason', reason);
  process.exit(0);
}

function main() {
  const body = String(process.env.ISSUE_BODY ?? '').replace(/\r\n?/g, '\n');
  const issueNumber = String(process.env.ISSUE_NUMBER ?? '').trim();
  const suffix = /^\d+$/.test(issueNumber) ? issueNumber : Date.now().toString(36);

  if (!body.trim()) {
    noChange(
      'The issue is empty, so there is nothing to act on. Fill the form in and the automation will try again.'
    );
  }

  const schema = readSchema(ROOT);
  const entryPath = entryPathFrom(schema);
  const verifiedKey = String(schema?.entry?.verified_key ?? 'verified');

  const form = readRefreshForm(body);
  if (form.accurate === null) {
    noChange(
      'The question **Is the entry still accurate as published?** has no answer the automation ' +
        'recognises, so nothing was changed. Edit this issue and pick one of the two options.'
    );
  }

  const { file, relative, error, reason } = resolveEntryFile(ROOT, form.slug, entryPath);
  if (error) fail(error);
  if (reason) noChange(reason);

  // "Something changed" is prose, and prose is a maintainer's job to apply.
  if (form.accurate === false) {
    if (!form.changes) {
      noChange(
        `Thanks — noted that \`${relative}\` needs updating. The **What changed?** box is empty, though, ` +
          'so there is nothing for a maintainer to act on yet. Edit this issue and describe what moved, ' +
          'in whatever words come naturally.'
      );
    }
    setOutput('outcome', 'changes');
    setOutput('slug', form.slug);
    setOutput('file', relative);
    setOutput('changes', form.changes);
    // The guidance comment names the date field to stamp, which a catalog can
    // rename via entry.verified_key — hand the resolved name to the workflow.
    setOutput('verified_key', verifiedKey);
    // Same branch name a "yes" answer on this issue would have used, so a
    // submitter who answers "yes" and then edits the issue to "no" leaves the
    // workflow a name to find and close that stale confirmation with.
    setOutput('branch', `refresh/${form.slug}-${suffix}`);
    console.log(`Routing described changes for ${relative} to the maintainers.`);
    return;
  }

  const date = today();
  const original = fs.readFileSync(file, 'utf8');
  const stamped = stampFrontMatter(original, date, verifiedKey);
  if (!stamped.changed) noChange(noChangeReason(stamped.reason, relative, date));

  fs.writeFileSync(file, stamped.text, 'utf8');
  setOutput('outcome', 'confirmed');
  setOutput('slug', form.slug);
  setOutput('file', relative);
  setOutput('date', date);
  setOutput('title', `Confirm entry ${form.slug} as still accurate`);
  setOutput('branch', `refresh/${form.slug}-${suffix}`);
  console.log(`Stamped ${verifiedKey}: ${date} on ${relative} (${stamped.reason}).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
