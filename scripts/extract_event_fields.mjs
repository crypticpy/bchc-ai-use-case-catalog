#!/usr/bin/env node
/**
 * Pull the short routing fields out of an issue form body so a workflow can
 * branch on them before doing any real work.
 *
 * Env: ISSUE_BODY. Outputs: cohort_year, event_id, intro.
 *
 * The body comes from an issue anyone can open: headings are read
 * first-occurrence-wins (scripts/lib/event_issue.mjs) so a `### Event ID`
 * typed inside a free-text answer cannot replace the real one, and each output
 * is written as a heredoc with a random delimiter so a multi-line answer cannot
 * forge a second output.
 */

import process from 'node:process';

import { setOutput } from './lib/actions_output.mjs';
import { FIELD, FINAL_LABEL, readEventForm } from './lib/event_issue.mjs';

const body = String(process.env.ISSUE_BODY ?? '').replace(/\r\n?/g, '\n');

const { value } = readEventForm(body, FINAL_LABEL.newYear);

const year = value(...FIELD.year);
const eventId = value(...FIELD.eventId);
// Collapsed to a single line so it reads well as a one-paragraph intro.
const intro = value(...FIELD.intro).replace(/\s*\n+\s*/g, ' ');

setOutput('cohort_year', year);
setOutput('event_id', eventId);
setOutput('intro', intro);

console.log(`Extracted cohort_year='${year}', event_id='${eventId}'.`);
