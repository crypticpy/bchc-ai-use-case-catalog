/**
 * The wizard's single error summary.
 *
 * `#wizard-errors` (declared in setup/index.md) is the one place validation
 * problems appear. The panel inside it takes focus when it fills, so a
 * keyboard or screen-reader user is taken to the problems instead of being
 * told about them somewhere off screen, and each problem that knows which
 * control it belongs to links straight to it. Focus alone is the announcement:
 * a `role="alert"` around a container that also takes focus is read twice
 * (GOV.UK Frontend dropped it from their error summary in v5.0 for that
 * reason), so the container carries no live-region role.
 *
 * `announce()` paints the panel *and* marks the controls, so it must be called
 * after the step body it is talking about has been rendered — see `goTo()` in
 * setup-page.js.
 */

import { scrollBehavior } from '../../lib/motion.js';
import { el } from '../dom.js';

/**
 * @typedef {string|{message: string, target?: string}} Problem
 *   `target` is the id of the control the problem belongs to.
 */

let region = null;

function errorRegion() {
  if (!region) region = document.getElementById('wizard-errors');
  return region;
}

/** @param {Problem} problem @returns {{message: string, target: string|null}} */
function normalize(problem) {
  if (typeof problem === 'string') return { message: problem, target: null };
  return { message: String(problem?.message ?? ''), target: problem?.target || null };
}

/** Move the page to a control and focus it, if it is still on the page. */
function jumpTo(id) {
  const node = document.getElementById(id);
  if (!node) return;
  node.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  node.focus({ preventScroll: true });
}

/** The id of the inline message belonging to a control. */
const errorId = (target) => `${target}-error`;

/** Add an id to a space-separated attribute, keeping the existing ones. */
function describedBy(control, id) {
  const current = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  if (!current.includes(id)) current.push(id);
  control.setAttribute('aria-describedby', current.join(' '));
}

/** Take one control out of its error state. */
function unmark(control) {
  control.removeAttribute('aria-invalid');
  const id = errorId(control.id);
  const message = document.getElementById(id);
  if (message) message.remove();
  const rest = (control.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((token) => token && token !== id);
  if (rest.length > 0) control.setAttribute('aria-describedby', rest.join(' '));
  else control.removeAttribute('aria-describedby');
}

/**
 * Put the problems back on the controls that caused them.
 *
 * The summary panel alone leaves the step looking untouched — a long step can
 * be 6,000px tall, and by the time the reader has scrolled to a control there
 * is nothing on screen saying it is the wrong one. Cleared on the control's
 * next `input`, the same moment the reader has done something about it.
 *
 * @param {Problem[]} [problems] the same list handed to `announce()`.
 */
export function mark(problems) {
  document.querySelectorAll('#wizard [aria-invalid="true"]').forEach(unmark);
  for (const item of (problems || []).map(normalize)) {
    if (!item.target || !item.message) continue;
    const control = document.getElementById(item.target);
    // Schema problems point at a row's disclosure button, not at a control:
    // there is nothing to mark invalid and nowhere sensible to put the text.
    if (!control || !('value' in control)) continue;
    control.setAttribute('aria-invalid', 'true');
    const id = errorId(item.target);
    if (!document.getElementById(id)) {
      control.after(el('p', { id, class: 'field-error', text: item.message }));
      describedBy(control, id);
      control.addEventListener('input', () => unmark(control), { once: true });
    }
  }
}

/**
 * Render the shared validation-error panel above the step body.
 *
 * @param {Problem[]} [problems] problems to show; clears the panel when empty.
 * @param {{focus?: boolean}} [options] `focus: false` leaves focus alone (used
 *   when the panel is painted as part of a step render that focuses elsewhere).
 */
export function announce(problems, { focus = true } = {}) {
  const target = errorRegion();
  if (!target) return;
  target.replaceChildren();
  if (!problems || problems.length === 0) return;

  const items = problems.map(normalize).filter((item) => item.message !== '');
  if (items.length === 0) return;

  const panel = el('div', { id: 'wizard-error-summary', class: 'card border-brand-accent', tabindex: '-1' }, [
    el('div', { class: 'card-header bg-brand-accent/10' }, [
      el('p', {
        class: 'card-title',
        text: items.length === 1 ? 'One problem to fix' : `${items.length} problems to fix`,
      }),
    ]),
    el(
      'ul',
      { class: 'list-disc space-y-1 px-10 py-4 text-sm text-brand-ink' },
      items.map((item) =>
        el('li', {}, [
          item.target
            ? el('a', {
                class: 'font-medium underline decoration-brand-accent underline-offset-2',
                href: `#${item.target}`,
                text: item.message,
                onclick: (event) => {
                  event.preventDefault();
                  jumpTo(item.target);
                },
              })
            : el('span', { text: item.message }),
        ])
      )
    ),
  ]);

  target.append(panel);
  if (focus) panel.focus();
  mark(items);
}
