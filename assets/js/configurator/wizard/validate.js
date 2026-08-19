/**
 * Per-step validation.
 *
 * Every problem carries the id of the control it belongs to where one exists,
 * so the error summary can link straight to it. Schema problems also open the
 * field row they blame, so following the link lands on an expanded row.
 */

import { COLOR_QUESTIONS, isHexColor, motionProblems, validateSchema } from '../core.js';
import { expandField, fieldToggleId } from '../steps/field-rows.js';
import { answerFieldId } from './controls.js';
import { enabledFields, schemaFields, state, STEPS } from './state.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

/**
 * A link the browser will follow. `new URL()` accepts `mailto:` and `data:`
 * too, so the scheme is checked as well.
 */
function isHttpUrl(value) {
  try {
    const { protocol } = new URL(String(value));
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A problem for an answer that is used as a link but is not one.
 * @param {string} key key into `state.answers`.
 * @param {string} label how to name the answer in the message.
 * @returns {import('./errors.js').Problem[]} empty when the answer is blank or valid.
 */
function urlProblem(key, label) {
  if (!state.answers[key] || isHttpUrl(state.answers[key])) return [];
  return [
    {
      message: `${label} must start with https:// — it is used as a link.`,
      target: answerFieldId(key),
    },
  ];
}

/** @returns {import('./errors.js').Problem[]} step 2: names, contact and the repository. */
function basicsProblems() {
  const problems = [];
  const answers = state.answers;
  if (!String(answers.siteName || '').trim())
    problems.push({ message: 'Site name is required.', target: answerFieldId('siteName') });
  if (!String(answers.orgName || '').trim())
    problems.push({ message: 'Organization name is required.', target: answerFieldId('orgName') });
  if (answers.contactEmail && !EMAIL.test(answers.contactEmail)) {
    problems.push({
      message: 'Contact email does not look like an email address.',
      target: answerFieldId('contactEmail'),
    });
  }
  if (answers.repository && !REPOSITORY.test(answers.repository)) {
    problems.push({
      message: 'GitHub repository must be in the form owner/repo.',
      target: answerFieldId('repository'),
    });
  }
  problems.push(...urlProblem('orgUrl', 'The organization website'));
  return problems;
}

/** @returns {import('./errors.js').Problem[]} step 3: the palette and the font URL. */
function lookProblems() {
  const problems = [];
  for (const { key, label } of COLOR_QUESTIONS) {
    if (!isHexColor(state.answers[key])) {
      problems.push({
        message: `${label} must be a 6-digit hex value like #1D4E89.`,
        target: answerFieldId(key),
      });
    }
  }
  problems.push(...urlProblem('googleFontsUrl', 'The Google Fonts URL'));
  // A hand-written `motion:` block reaches the wizard as an answer nobody
  // typed, so it is checked here rather than trusted.
  for (const message of motionProblems(state.answers.motion)) {
    problems.push({ message, target: answerFieldId('motion') });
  }
  return problems;
}

/**
 * Schema errors, mapped back onto the field row that caused them. Errors are
 * reported against the *enabled* fields, in the same order `schemaFields()`
 * emits them, so the index in `fields[N]` indexes that list.
 * @returns {import('./errors.js').Problem[]}
 */
function schemaProblems() {
  const fields = enabledFields();
  return validateSchema({ fields: schemaFields() }).map((message) => {
    const index = /^fields\[(\d+)\]/.exec(message);
    const field = index ? fields[Number(index[1])] : null;
    if (!field || !field.key) return message;
    expandField(field.key);
    return { message, target: fieldToggleId(field.key) };
  });
}

/** @returns {import('./errors.js').Problem[]} */
function entryModelProblems() {
  const problems = [];
  if (!String(state.answers.entrySingular || '').trim()) {
    problems.push({
      message: 'The singular entry name is required.',
      target: answerFieldId('entrySingular'),
    });
  }
  if (!String(state.answers.entryPlural || '').trim()) {
    problems.push({ message: 'The plural entry name is required.', target: answerFieldId('entryPlural') });
  }
  problems.push(...schemaProblems());
  return problems;
}

/**
 * What is wrong with one step's answers.
 *
 * This only *finds* the problems; showing them is the caller's job, and has to
 * happen after the step has been rendered — `announce()` marks the controls
 * the problems belong to, and a render replaces them.
 * @param {number} index step index (`STEPS[index]` selects the rule set).
 * @returns {import('./errors.js').Problem[]} empty when the step may be left.
 */
export function stepProblems(index) {
  if (STEPS[index] === 'basics') return basicsProblems();
  if (STEPS[index] === 'look') return lookProblems();
  if (STEPS[index] === 'fields') return entryModelProblems();
  return [];
}
