/**
 * Submit form — the short form.
 *
 * One button hides every optional question, for anyone daunted by the full
 * form. Required questions always stay, and so does any optional question
 * that already has an answer — a restored draft never hides its own data, and
 * an error is never pointed at a hidden control (a hidden field is always an
 * empty optional one, which no validation rule can fail).
 *
 * Which fields hide is decided when the button is pressed (and again after a
 * draft restore), not on every keystroke: recomputing on input would yank a
 * field away the moment its answer is erased, from under the person erasing
 * it. Hidden fields can only be reached through the review's Change buttons
 * and the error summary, and both go through `reveal`.
 *
 * DOM contract: [data-shortform] bar with [data-shortform-toggle] and
 * [data-shortform-note]; [data-field] wrappers via the field registry.
 *
 * Exposes: window.SubmitForm.initShortForm
 */
(function (ns) {
  'use strict';

  /**
   * Wire the toggle.
   * @param {HTMLFormElement} form
   * @param {object[]} fields descriptors from readFields
   * @param {{onChange?: () => void}} options `onChange` fires whenever field
   *   visibility changes, so the stepper can re-plot its skipped sections.
   * @returns {object|null} the controller, or null when there is nothing to
   *   hide (the bar is then removed rather than revealed as a dead button)
   */
  ns.initShortForm = function initShortForm(form, fields, options) {
    const bar = form.querySelector('[data-shortform]');
    const toggle = bar ? bar.querySelector('[data-shortform-toggle]') : null;
    if (!toggle) return null;
    const optional = fields.filter((field) => !field.required);
    if (optional.length === 0) {
      bar.remove();
      return null;
    }
    const note = bar.querySelector('[data-shortform-note]');
    const opts = options || {};
    let on = false;

    /** Repaint the button label and the hidden-count note. */
    function paint() {
      toggle.textContent = on ? 'Show every question' : 'Hide the optional questions';
      if (note) {
        const found = optional.filter((field) => field.wrap.hidden).length;
        note.textContent =
          found === 1 ? '1 optional question hidden.' : found + ' optional questions hidden.';
        note.hidden = !on;
      }
    }

    /** Re-decide which optional fields hide (toggle press, draft restore). */
    function refresh() {
      optional.forEach((field) => {
        field.wrap.hidden = on && !ns.isAnswered(field);
      });
      paint();
      if (opts.onChange) opts.onChange();
    }

    /**
     * @param {string} key a [data-section] key
     * @returns {boolean} true while the section has anything on screen
     */
    function sectionVisible(key) {
      return fields.some((field) => field.section === key && !field.wrap.hidden);
    }

    /**
     * Un-hide one field, so focus can land on it.
     * @param {object} field
     */
    function reveal(field) {
      if (!field.wrap.hidden) return;
      field.wrap.hidden = false;
      paint();
      if (opts.onChange) opts.onChange();
    }

    toggle.addEventListener('click', () => {
      on = !on;
      refresh();
    });

    return {
      enabled: () => on,
      /** Set the mode outright (restoring a draft's UI state). @param {boolean} value */
      set: (value) => {
        on = value === true;
        refresh();
      },
      refresh,
      sectionVisible,
      reveal,
    };
  };
})((window.SubmitForm = window.SubmitForm || {}));
