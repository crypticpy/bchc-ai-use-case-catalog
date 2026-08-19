#!/usr/bin/env node
/**
 * Replace or extend the `attachments:` list on an existing cohort event page.
 *
 * Input (env): ISSUE_BODY
 * Output:      rewrites cohorts/<year>/events/<event_id>/index.md
 *              $GITHUB_OUTPUT: changed, and (when changed) slug, year, branch;
 *              error, when the year or event id is not a usable path segment.
 *
 * The rest of the front matter is spliced through untouched rather than
 * re-serialized, so hand-written keys, ordering and comments survive.
 *
 * Anyone can open the issue that starts this job. The year and event id come
 * from that issue and are turned into a path, so both are pattern-checked and
 * the resolved folder is re-checked against `cohorts/<year>/events/` before any
 * file is read or written; headings are read first-occurrence-wins
 * (scripts/lib/event_issue.mjs) and outputs use random heredoc delimiters.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

import { fail, setOutput } from './lib/actions_output.mjs';
import { FIELD, FINAL_LABEL, readEventForm, resolveEventDir } from './lib/event_issue.mjs';
import { slugify } from './lib/issue_body.mjs';
import { pair } from './lib/yaml.mjs';

const ROOT = process.cwd();

const body = String(process.env.ISSUE_BODY ?? '').replace(/\r\n?/g, '\n');

/** Report "nothing changed" and exit cleanly — the workflow comments instead of failing. */
function noChange(reason) {
  console.error(reason);
  setOutput('changed', 'false');
  process.exit(0);
}

if (!body.trim()) noChange('The issue body is empty; nothing to update.');

const { value } = readEventForm(body, FINAL_LABEL.attachments);

const year = value(...FIELD.year);
const requestedId = value(...FIELD.eventId);
const mode = (value(...FIELD.mode) || 'REPLACE').toUpperCase().includes('APPEND') ? 'APPEND' : 'REPLACE';

const newItems = value(...FIELD.attachments)
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const separator = line.includes('|') ? '|' : line.includes(' - ') ? ' - ' : null;
    if (!separator) return null;
    const parts = line.split(separator);
    const title = parts[0].trim();
    const url = parts.slice(1).join(separator).trim();
    return title && url ? { title, url } : null;
  })
  .filter(Boolean);

if (!year || !requestedId) noChange('The cohort year and event id are both required.');
if (newItems.length === 0) noChange('No attachments could be parsed. Use one "Title | URL" pair per line.');

// The id is a folder name, so it is normalized the same way new_event_from_issue.mjs
// derives one, then re-checked together with the year before a path is built.
const eventId = slugify(requestedId);
const { dir, relative, error } = resolveEventDir(ROOT, year, eventId);
if (error) fail(error);
if (eventId !== requestedId) {
  console.error(`Read the event id ${JSON.stringify(requestedId)} as ${JSON.stringify(eventId)}.`);
}

const absPath = path.join(dir, 'index.md');
const relPath = `${relative}/index.md`;
if (!fs.existsSync(absPath)) noChange(`No event page at ${relPath}.`);

const content = fs.readFileSync(absPath, 'utf8').replace(/\r\n/g, '\n');
const match = content.match(/^---\n(.*?)\n---\n?(.*)$/s);
if (!match) noChange(`${relPath} has no YAML front matter.`);

const [, frontMatter, pageBody] = match;

let existing = [];
try {
  const parsed = yaml.load(frontMatter) || {};
  existing = Array.isArray(parsed.attachments) ? parsed.attachments.filter((a) => a && a.title && a.url) : [];
} catch (error) {
  noChange(`${relPath} has invalid front matter: ${error.message}`);
}

// Drop the existing `attachments:` block; everything else passes through verbatim.
const kept = [];
const lines = frontMatter.split('\n');
for (let i = 0; i < lines.length; i += 1) {
  if (!/^attachments\s*:/.test(lines[i])) {
    kept.push(lines[i]);
    continue;
  }
  while (i + 1 < lines.length && /^(\s+\S|\s*$)/.test(lines[i + 1])) i += 1;
}

let merged = newItems;
if (mode === 'APPEND') {
  const seen = new Set();
  merged = [];
  for (const item of [...existing, ...newItems]) {
    const key = `${item.title.toLowerCase()}|${item.url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ title: item.title, url: item.url });
  }
}

while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();

const updated = `---\n${[...kept, pair('attachments', merged)].join('\n')}\n---\n\n${pageBody.replace(/^\n+/, '')}`;

if (updated === content) noChange('The attachments already match what was submitted.');

fs.writeFileSync(absPath, updated, 'utf8');

setOutput('changed', 'true');
setOutput('slug', `${year}-${eventId}`);
setOutput('year', year);
setOutput('branch', `event-attachments/${year}-${eventId}-${Date.now()}`);

console.log(`Updated attachments for ${relPath} (${mode.toLowerCase()}, ${merged.length} item(s)).`);
