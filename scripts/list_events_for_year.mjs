#!/usr/bin/env node
/**
 * Build a markdown list of the events already scheduled for a cohort year, so
 * automation can comment it back on the issue as a reference. Each line says
 * whether that event has a page on disk, because only those can take
 * attachments (see `hasPage` below).
 *
 * Env: ISSUE_BODY. Outputs: year, events_md.
 *
 * Read-only. The year comes from an issue anyone can open, so it is checked
 * against `^\d{4}$` before it reaches a path, headings are read
 * first-occurrence-wins (scripts/lib/event_issue.mjs), and both outputs are
 * written as heredocs with a random delimiter — the markdown carries event
 * names from the data file and must not be able to close its own block.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

import { setOutput } from './lib/actions_output.mjs';
import { FIELD, FINAL_LABEL, readEventForm, YEAR_PATTERN } from './lib/event_issue.mjs';
import { slugify } from './lib/issue_body.mjs';

const body = String(process.env.ISSUE_BODY ?? '').replace(/\r\n?/g, '\n');

const { value } = readEventForm(body, FINAL_LABEL.attachments);
const year = value(...FIELD.year);

function finish(md) {
  setOutput('year', YEAR_PATTERN.test(year) ? year : '');
  setOutput('events_md', md);
  console.log(md);
  process.exit(0);
}

if (!year) finish('No cohort year was provided in the issue.');
if (!YEAR_PATTERN.test(year)) finish('The cohort year must be four digits, e.g. `2026`.');

const dataPath = path.join(process.cwd(), '_data', 'cohorts', `${year}.yml`);
if (!fs.existsSync(dataPath)) finish(`No schedule exists yet at \`_data/cohorts/${year}.yml\`.`);

let events = [];
try {
  const data = yaml.load(fs.readFileSync(dataPath, 'utf8')) || {};
  events = Array.isArray(data.events) ? data.events : [];
} catch (error) {
  finish(`Could not parse \`_data/cohorts/${year}.yml\`: ${error.message}`);
}

/**
 * Whether this event has a real page on disk.
 *
 * _plugins/events.rb generates a detail page for every event in the schedule
 * data, so an id being listed here says nothing about there being a file. Only
 * the ones with a file can take attachments — update_event_attachments_from_issue.mjs
 * edits `cohorts/<year>/events/<id>/index.md` and does nothing when it is
 * missing — so the list marks which is which rather than recommending ids that
 * quietly cannot be used.
 * @param {unknown} id
 * @returns {boolean}
 */
function hasPage(id) {
  const eventId = slugify(String(id ?? ''));
  if (!eventId) return false;
  return fs.existsSync(path.join(process.cwd(), 'cohorts', year, 'events', eventId, 'index.md'));
}

finish(
  events.length
    ? events
        .map((event) => {
          const id = event.id || '(no id)';
          const date = event.date ? ` (${event.date})` : '';
          const page = event.id && hasPage(event.id) ? 'has a details page' : 'no details page yet';
          return `- \`${id}\` — ${event.name || ''}${date} — ${page}`;
        })
        .join('\n')
    : 'No events are listed in this cohort schedule yet.'
);
