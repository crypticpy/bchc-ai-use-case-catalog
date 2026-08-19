#!/usr/bin/env node
/**
 * Scaffold a cohort event page from an issue form submission.
 *
 * Input (env): ISSUE_BODY, ISSUE_TITLE
 * Output:      cohorts/<year>/events/<event_id>/index.md
 *              $GITHUB_OUTPUT: slug, year, branch (or error, on failure)
 *
 * Anyone can open the issue that starts this job, so nothing here trusts the
 * body: headings are read first-occurrence-wins (scripts/lib/event_issue.mjs),
 * the folder is confined to `cohorts/<year>/events/`, values are serialized by
 * the shared YAML emitter, and every step output is written with a random
 * heredoc delimiter.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { fail, setOutput } from './lib/actions_output.mjs';
import { FIELD, FINAL_LABEL, readEventForm, resolveEventDir } from './lib/event_issue.mjs';
import { slugify } from './lib/issue_body.mjs';
import { frontMatter } from './lib/yaml.mjs';

const ROOT = process.cwd();

const body = String(process.env.ISSUE_BODY ?? '').replace(/\r\n?/g, '\n');
const issueTitle = String(process.env.ISSUE_TITLE ?? '').trim();

if (!body.trim()) fail('The issue body is empty, so there is nothing to scaffold.');

const { value } = readEventForm(body, FINAL_LABEL.newEvent);

const year = value(...FIELD.year);
const title = value(...FIELD.title) || issueTitle;
const details = value(...FIELD.details);

if (!/^\d{4}$/.test(year) || !title) {
  fail('A four-digit cohort year and an event title are both required.');
}

const requestedId = value(...FIELD.eventId);
const eventId = slugify(requestedId || title);
if (!eventId) fail(`Could not derive an event id from ${JSON.stringify(requestedId || title)}.`);

// `slugify` already strips everything outside [a-z0-9-], but this job runs with
// `contents: write` on issue text from anyone, so the folder it is about to
// create is re-checked rather than trusted.
const { dir, relative, error } = resolveEventDir(ROOT, year, eventId);
if (error) fail(error);

// "Title | URL" per line; also tolerates "Title - URL".
const attachments = value(...FIELD.attachments)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const separator = line.includes('|') ? '|' : line.includes(' - ') ? ' - ' : null;
    if (!separator) return null;
    const parts = line.split(separator);
    const attachmentTitle = parts[0].trim();
    const url = parts.slice(1).join(separator).trim();
    return attachmentTitle && url ? { title: attachmentTitle, url } : null;
  })
  .filter(Boolean);

/** @type {Array<[string, unknown]>} */
const entries = [
  ['layout', 'event'],
  ['title', title],
  ['cohort', year],
  ['event_id', eventId],
];

for (const [key, labels] of [
  ['summary', FIELD.summary],
  ['event_date', FIELD.date],
  ['event_time', FIELD.time],
  ['event_location', FIELD.location],
]) {
  const text = value(...labels);
  if (text) entries.push([key, text]);
}

if (attachments.length > 0) entries.push(['attachments', attachments]);

if (fs.existsSync(dir)) {
  fail(`An event already exists at ${relative}. Aborting rather than overwriting it.`);
}

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, 'index.md'),
  `${frontMatter(entries)}\n${details || 'Event details will be added here.'}\n`,
  'utf8'
);

setOutput('slug', eventId);
setOutput('year', year);
setOutput('branch', `event/${year}-${eventId}`);

console.log(`Scaffolded ${relative}/index.md.`);
