#!/usr/bin/env node
/**
 * "Also deployed by": attach one organization to an entry somebody else wrote.
 *
 * Input (env): ISSUE_BODY, ISSUE_NUMBER
 * Output:      rewrites <entry path>/<slug>/index.md, appending (or updating)
 *              one item in the `links` field named by `entry.deployments_key`
 *              $GITHUB_OUTPUT: outcome, and per outcome —
 *                added → slug, file, branch, title, org, entry_url, action
 *                none  → reason (a whole sentence the workflow quotes back)
 *              error, when the slug is not a usable path segment.
 *
 * The form is .github/ISSUE_TEMPLATE/also-deployed-by.yml and the entry page
 * links to it with the slug already filled in (_layouts/entry.html).
 *
 * Why this exists as its own flow rather than as a field on the entry form: the
 * organization that redeployed a use case is not the organization that wrote
 * the entry, and asking them to author a full second entry to say "we run this
 * too" is how the fact never gets recorded. Four boxes is the whole cost.
 *
 * No field key is named here. The target field comes from
 * `_data/schema.yml`'s `entry.deployments_key`, the same pointer idiom as
 * `status_key` and `submitter_key`; a schema without it has not configured the
 * feature, and this script says so rather than inventing a key.
 *
 * Anyone can open the issue that starts this job, so the slug is
 * pattern-checked and the resolved path re-checked against the entry directory
 * before any file is read or written, the issue text reaches the workflow only
 * through outputs written with random heredoc delimiters, and the front matter
 * is spliced line-wise — only the target key's block is re-emitted, everything
 * else passes through verbatim, so comments and key order survive.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import * as yaml from 'js-yaml';

import { fail, setOutput } from './lib/actions_output.mjs';
import { parseIssueForm, rawValue } from './lib/issue_body.mjs';
import { entryPathFrom, readSchema } from './lib/setup-io.mjs';
import { pair } from './lib/yaml.mjs';

const ROOT = process.cwd();

/** A slug is a folder name under the entry path, so keep it to this shape. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The form's field labels, in template order. */
export const FIELD = {
  slug: 'Entry slug',
  org: 'Organization',
  url: 'Link',
  email: 'Contact email',
  note: 'Anything worth knowing?',
};

/** Longest a note may be. Two sentences is what the form asks for; this is the
 * boundary that keeps a pasted essay out of a sidebar card. */
export const NOTE_MAX_CHARS = 400;

/**
 * The five answers, read from an issue-form body.
 * @param {string} body raw issue body
 * @returns {{slug: string, org: string, url: string, email: string, note: string}}
 */
export function readDeploymentForm(body) {
  const { sections } = parseIssueForm(
    String(body ?? '').replace(/\r\n?/g, '\n'),
    Object.values(FIELD),
    FIELD.note
  );
  const value = (label) => rawValue(sections, { label });
  return {
    slug: value(FIELD.slug)
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, ''),
    org: value(FIELD.org).replace(/\s+/g, ' ').trim(),
    url: value(FIELD.url).trim(),
    email: value(FIELD.email)
      .trim()
      .replace(/^mailto:/i, ''),
    // A note is prose, so newlines survive; only the run of blank lines a
    // textarea collects at either end is trimmed.
    note: value(FIELD.note).trim(),
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
  return reject({ file: path.join(dir, 'index.md'), relative });
}

/**
 * What is wrong with the three answers that carry a shape, as a sentence for
 * the submitter — or '' when they are all usable.
 * @param {{org: string, url: string, email: string, note: string}} form
 * @returns {string}
 */
export function checkAnswers(form) {
  if (!form.org) {
    return (
      'The **Organization** box is empty, so there is no name to list. Edit this issue and put in the ' +
      'city, county, agency or health department that deployed it.'
    );
  }
  if (!form.url) {
    return (
      'The **Link** box is empty. It is what makes the listing useful to a reader — your deployment, ' +
      "your repository, your fork, or just your organization's page. Edit this issue and add one."
    );
  }
  if (!/^https?:\/\/\S+$/i.test(form.url)) {
    return (
      `The **Link** box says \`${form.url}\`, which is not a web address this can publish. It has to start ` +
      'with `http://` or `https://` and have no spaces in it. Edit this issue to correct it.'
    );
  }
  // The same test an `email` field gets in check_front_matter.rb: an address is
  // published as a mailto link, and "@" is what separates one from a name.
  if (form.email && (!form.email.includes('@') || /\s/.test(form.email))) {
    return (
      `The **Contact email** box says \`${form.email}\`, which is not an email address. Leave it empty if ` +
      'you would rather not publish one — it is optional — or edit this issue to correct it.'
    );
  }
  if (form.note.length > NOTE_MAX_CHARS) {
    return (
      `The note is ${form.note.length} characters and the entry page has room for about ${NOTE_MAX_CHARS}. ` +
      'Edit this issue and shorten it to the one or two sentences the next team most needs, or leave it ' +
      'empty — the listing works without it.'
    );
  }
  return '';
}

/**
 * Append one organization to a list of `links` items, or update the item that
 * is already this organization.
 *
 * Identity is the organization's name OR its link, both lowercased — either
 * half is enough to recognise a resubmission. Requiring both would mean that
 * correcting a typo in the link adds a second row for the same organization,
 * which is precisely the duplicate the dedupe exists to prevent.
 *
 * @param {unknown} existing the current value of the field (anything; a
 *   non-list is treated as no list at all).
 * @param {{label: string, url: string, email?: string, note?: string}} item
 * @returns {{items: Array<object>, action: 'added'|'updated'}}
 */
export function mergeDeployment(existing, item) {
  // A string item is the shorthand `check_front_matter.rb` and `field-value.html`
  // both already accept (a bare URL, used as both label and href) — normalize it
  // to the same shape a maintainer-written `{label, url}` row has, rather than
  // filtering it out and silently deleting it.
  const list = Array.isArray(existing)
    ? existing
        .map((entry) => (typeof entry === 'string' ? { label: entry, url: entry } : entry))
        .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    : [];
  const key = (value) =>
    String(value ?? '')
      .trim()
      .toLowerCase();
  const index = list.findIndex(
    (entry) =>
      (key(entry.label) !== '' && key(entry.label) === key(item.label)) ||
      (key(entry.url) !== '' && key(entry.url) === key(item.url))
  );

  // `pair()` drops an undefined or empty value, so an item that arrives without
  // an email or a note simply has neither key — and a resubmission that clears
  // one clears it on the page too, which is the only way to take an address
  // back down.
  const clean = { label: item.label, url: item.url };
  if (item.email) clean.email = item.email;
  if (item.note) clean.note = item.note;

  if (index === -1) return { items: [...list, clean], action: 'added' };
  const items = list.slice();
  items[index] = clean;
  return { items, action: 'updated' };
}

/**
 * Replace one top-level key's block in a front matter body, in place, or
 * append it when the key was not there to begin with.
 *
 * Line-wise on purpose: parsing the whole block and re-emitting it would drop
 * every comment and reorder every key. Only the target key's lines are
 * dropped and rebuilt; everything else is passed through exactly as written,
 * at the position it already occupied — so a one-item addition reads as a
 * small diff at the key's existing spot, not a delete-and-append at the end.
 *
 * @param {string} frontMatter the text between the `---` fences
 * @param {string} key the top-level key to re-emit
 * @param {unknown} value the value to emit for it
 * @returns {string}
 */
export function spliceKey(frontMatter, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const keyLine = new RegExp(`^${escaped}\\s*:`);
  const lines = frontMatter.split('\n');
  const kept = [];
  let insertAt = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (!keyLine.test(lines[i])) {
      kept.push(lines[i]);
      continue;
    }
    // The block's new text lands where its first line used to be.
    if (insertAt === -1) insertAt = kept.length;
    // Everything indented under the key (and any blank line inside the block)
    // belongs to it.
    while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) i += 1;
  }
  const rebuilt = pair(key, value);
  if (insertAt === -1) {
    while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
    return [...kept, rebuilt].join('\n');
  }
  kept.splice(insertAt, 0, rebuilt);
  return kept.join('\n');
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
  const deploymentsKey = String(schema?.entry?.deployments_key ?? '').trim();
  if (!deploymentsKey) {
    noChange(
      'This catalog has not been set up to list who else deployed an entry, so there is nowhere to put ' +
        'this. A maintainer needs to add `entry.deployments_key` to `_data/schema.yml`, pointing at a ' +
        '`links` field — the content model documentation has the shape. Nothing you wrote is lost.'
    );
  }
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const target = fields.find((field) => field?.key === deploymentsKey);
  if (!target || target.type !== 'links') {
    noChange(
      `\`entry.deployments_key\` in \`_data/schema.yml\` names \`${deploymentsKey}\`, but that is not a ` +
        '`links` field in the same file, so this could not be applied. A maintainer needs to correct the ' +
        'pointer. Nothing you wrote is lost.'
    );
  }

  const form = readDeploymentForm(body);
  const complaint = checkAnswers(form);
  if (complaint) noChange(complaint);

  const { file, relative, error, reason } = resolveEntryFile(ROOT, form.slug, entryPath);
  if (error) fail(error);
  if (reason) noChange(reason);

  // Read-then-catch rather than exists-then-read, so there is no window between
  // the check and the use.
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (readError) {
    if (readError.code !== 'ENOENT') throw readError;
    noChange(
      `There is no entry at \`${relative}\`, so there is nothing to add your organization to. Open the ` +
        `entry on the site and copy the last part of its address — for \`/${entryPath}/automated-311-triage/\` ` +
        'the slug is `automated-311-triage` — then edit this issue to correct the **Entry slug** box.'
    );
  }

  const content = raw.replace(/\r\n?/g, '\n');
  const match = content.match(/^---\n(.*?)\n---\n?(.*)$/s);
  if (!match) {
    noChange(
      `\`${relative}\` has no settings block at the top of the file, so it cannot be edited safely. A ` +
        'maintainer needs to look at that file.'
    );
  }
  const [, frontMatter, pageBody] = match;

  let parsed;
  try {
    parsed = yaml.load(frontMatter) || {};
  } catch (parseError) {
    noChange(
      `The settings block in \`${relative}\` could not be read, so it was left alone. A maintainer needs ` +
        `to look at that file: ${parseError.message}`
    );
  }
  if (parsed.sample === true) {
    noChange(
      `\`${relative}\` is sample content that ships with the template rather than a real entry, so it is ` +
        'left alone. Find the entry you actually deployed and use its slug instead.'
    );
  }

  const { items, action } = mergeDeployment(parsed[deploymentsKey], {
    label: form.org,
    url: form.url,
    email: form.email,
    note: form.note,
  });

  const updated = `---\n${spliceKey(frontMatter, deploymentsKey, items)}\n---\n\n${pageBody.replace(/^\n+/, '')}`;
  if (updated === content) {
    noChange(
      `\`${relative}\` already lists **${form.org}** with exactly these details, so there was nothing to ` +
        'change. Nothing is wrong; you can close this issue.'
    );
  }

  fs.writeFileSync(file, updated, 'utf8');

  setOutput('outcome', 'added');
  setOutput('action', action);
  setOutput('slug', form.slug);
  setOutput('file', relative);
  setOutput('org', form.org);
  setOutput('entry_url', `/${entryPath}/${form.slug}/`);
  setOutput('title', `Add ${form.org} to ${form.slug} as another deployment`);
  setOutput('branch', `also-deployed/${form.slug}-${suffix}`);
  console.log(`${action === 'added' ? 'Added' : 'Updated'} ${form.org} in ${deploymentsKey} on ${relative}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
