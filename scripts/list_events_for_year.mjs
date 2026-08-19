#!/usr/bin/env node
/**
 * Build a markdown list of the events already scheduled for a cohort year, so
 * automation can comment it back on the issue as a reference.
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

finish(
  events.length
    ? events
        .map(
          (event) =>
            `- \`${event.id || '(no id)'}\` — ${event.name || ''}${event.date ? ` (${event.date})` : ''}`
        )
        .join('\n')
    : 'No events are listed in this cohort schedule yet.'
);
