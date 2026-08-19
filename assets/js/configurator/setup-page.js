/**
 * /setup/ — browser wizard.
 *
 * Vanilla ESM, no build step. This file is only the shell: step navigation,
 * the heading, the action bar and boot. The answers -> files logic lives in
 * ./core.js, the same module the Node CLI (`npm run setup`) uses, so the
 * terminal and the browser can never drift apart; the wizard's own state,
 * controls, validation and error summary live in ./wizard/, and one module per
 * step lives in ./steps/.
 *
 *   wizard/state.js       answers, field list, persistence, derived config
 *   wizard/controls.js    inputs bound to the answers
 *   wizard/errors.js      the focusable error summary
 *   wizard/validate.js    per-step rules
 *   steps/start.js        1. starting point
 *   steps/basics.js       2. site and organization names, the repository
 *   steps/look.js         3. palette, live preview, type and rounding
 *   steps/words.js        4. home page, submission page and footer copy
 *   steps/modules.js      5. module toggles
 *   steps/entry-model.js  6. the schema's fields
 *   steps/field-rows.js   which field rows are open, and their element ids
 *   steps/add-field.js    the "Add a field" form on step 6
 *   steps/review.js       7. the rendered files
 *
 * The page never writes anything: it renders the files and hands them to the
 * admin to copy, download, or paste into GitHub's web editor.
 */

import { el } from './dom.js';
import { renderBasics } from './steps/basics.js';
import { renderEntryModel } from './steps/entry-model.js';
import { renderLook } from './steps/look.js';
import { renderModules } from './steps/modules.js';
import { renderReview } from './steps/review.js';
import { renderStart } from './steps/start.js';
import { renderWords } from './steps/words.js';
import { announce } from './wizard/errors.js';
import { clearSaved, loadStartingPoint, restore, save, state, STEPS } from './wizard/state.js';
import { stepProblems } from './wizard/validate.js';

/**
 * One entry per id in `STEPS`, in the same order. Short pill labels: seven of
 * them share one row at 1440 and wrap to two at 390.
 */
const STEP_META = [
  {
    label: 'Start',
    title: 'Choose a starting point',
    lead: 'Every field on every later step is pre-filled from this choice.',
    render: renderStart,
  },
  {
    label: 'Basics',
    title: 'Names & contact',
    lead: 'What the site is called, who runs it, and where its code lives.',
    render: renderBasics,
  },
  {
    label: 'Look',
    title: 'Colors & type',
    lead: 'The palette, the fonts and the corner rounding, previewed as you change them.',
    render: renderLook,
  },
  {
    label: 'Words',
    title: 'Home page & footer copy',
    lead: 'The words on the home page, the submission page and the footer.',
    render: renderWords,
  },
  {
    label: 'Modules',
    title: 'Modules',
    lead: 'Which sections of the site exist.',
    render: renderModules,
  },
  {
    label: 'Entry model',
    title: 'Entry model',
    lead: 'The fields every catalog entry has. Open a row to edit it.',
    render: renderEntryModel,
  },
  {
    label: 'Review',
    title: 'Review & publish',
    lead: 'Copy each file into GitHub. Nothing is changed until you commit.',
    render: renderReview,
  },
];

const root = document.querySelector('#wizard');
const stepNav = document.querySelector('#wizard-steps');

/** Render the numbered step pills above the wizard body. */
function renderStepNav() {
  stepNav.replaceChildren(
    ...STEP_META.map((meta, index) =>
      el('button', {
        type: 'button',
        class: `filter-pill${index === state.step ? ' is-active' : ''}`,
        'aria-current': index === state.step ? 'step' : null,
        // The step id, not its position: quality/pa11yci.js drives the wizard
        // through these pills and must not be re-numbered every time a step
        // is added or split.
        'data-step': STEPS[index],
        text: `${index + 1}. ${meta.label}`,
        onclick: () => goTo(index),
      })
    )
  );
}

/**
 * Navigate to a step. A forward move (Continue, or a step pill further on)
 * validates every step it would skip, in order, and stops on the first one
 * with problems: that step is shown, its blamed rows come back open, and
 * focus lands on the error summary.
 *
 * The problems are announced *after* `render()`, never before: the render
 * replaces every control on the step, so a summary painted first would have
 * marked controls that no longer exist.
 * @param {number} index target step index.
 */
function goTo(index) {
  const target = Math.min(Math.max(index, 0), STEPS.length - 1);
  for (let step = state.step; step < target; step += 1) {
    const problems = stepProblems(step);
    if (problems.length === 0) continue;
    state.step = step;
    save();
    render();
    announce(problems);
    return;
  }
  state.step = target;
  save();
  // Every step the move passed through was clean; drop whatever the last
  // failed attempt left in the summary before the new step paints (the review
  // step's own render may put its schema problems back).
  announce([]);
  render();
  document.getElementById('step-heading')?.focus();
}

/**
 * The Back / step actions / Start over / Continue bar under the step body.
 * @param {HTMLElement[]} actions extra buttons contributed by the step.
 * @param {boolean} sticky pin the bar to the bottom of the viewport (long steps).
 * @returns {HTMLElement}
 */
function actionBar(actions, sticky) {
  return el('div', { class: `wizard-actions${sticky ? ' is-sticky' : ''}` }, [
    state.step > 0
      ? el('button', {
          type: 'button',
          class: 'btn-secondary',
          text: 'Back',
          onclick: () => goTo(state.step - 1),
        })
      : el('span'),
    el('div', { class: 'flex flex-wrap gap-3' }, [
      ...actions,
      el('button', {
        type: 'button',
        class: 'btn-secondary',
        text: 'Start over',
        onclick: () => {
          if (!window.confirm('Discard everything you have entered and start again?')) return;
          clearSaved();
          state.step = 0;
          loadStartingPoint('current');
          render();
        },
      }),
      state.step < STEPS.length - 1
        ? el('button', {
            type: 'button',
            class: 'btn-primary',
            text: 'Continue',
            onclick: () => goTo(state.step + 1),
          })
        : null,
    ]),
  ]);
}

/** Repaint the whole wizard shell (step nav, heading, current step body, action bar). */
function render() {
  renderStepNav();
  const meta = STEP_META[state.step];
  const { body, actions = [], sticky = false } = meta.render(render);

  root.replaceChildren(
    el('header', { class: 'mb-6' }, [
      el('p', { class: 'eyebrow', text: `Step ${state.step + 1} of ${STEPS.length}` }),
      // my-1.5: the heading takes focus on every step change and `.focus-target`
      // draws its dashed ring 4px outside the box; without the gap the ring
      // crosses the eyebrow above and the lead below.
      el('h2', {
        id: 'step-heading',
        class: 'section-title focus-target my-1.5 !text-2xl',
        tabindex: '-1',
        text: meta.title,
      }),
      el('p', { class: 'section-lead', text: meta.lead }),
    ]),
    body,
    actionBar(actions, sticky)
  );
}

/** Entry point: restore or initialize `state`, then render. No-ops if `#wizard` isn't on the page. */
function boot() {
  if (!root) return;
  const resumed = restore();
  render();
  if (resumed) {
    const banner = document.querySelector('#resume-banner');
    if (banner) banner.hidden = false;
  }
}

boot();
