/**
 * Submit form — per-field validation and the error summary.
 *
 * Validation is format-only on blur and complete on submit; the submit button
 * is never disabled (design brief, "Submit"). Errors are announced two ways:
 * `aria-invalid` on the control that is wrong, and an inline `.field-error`
 * referenced by `aria-describedby`, plus a summary panel that takes focus.
 *
 * Every message names the question the submitter read and the thing to do about
 * it. The words come from the schema — `data-question` on the wrapper, or the
 * field's own `error:` override — so no field key ever appears in this file.
 *
 * DOM contract: [data-error-summary] / [data-error-summary-list] /
 * [data-error-summary-title], and `#<control id>-error` beside every control.
 *
 * Exposes: window.SubmitForm.checkField, .showError, .clearError,
 *          .validateAll, .renderSummary, .hideSummary
 */
(function (ns) {
  'use strict';

  /** Very permissive: catches typos, not deliverability. */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /**
   * @param {string} value
   * @returns {boolean} true when the string parses as an http(s) URL
   */
  function isUrl(value) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  /**
   * The question, as the submitter read it, in quotation marks.
   * @param {object} field
   * @returns {string}
   */
  function named(field) {
    return '“' + (field.question || field.label || '') + '”';
  }

  /** " like https://example.org/app", when the schema gave the control one. */
  function like(field) {
    return field.placeholder ? ', like ' + field.placeholder : '';
  }

  /**
   * The message for an unanswered required field: the schema's own `error:`
   * when it has one, otherwise a verb-plus-the-thing default for the control
   * the submitter is looking at.
   * @param {object} field
   * @returns {string}
   */
  function missingMessage(field) {
    if (field.error) return field.error;
    if (field.type === 'multiselect') return 'Select at least one option for ' + named(field);
    if (field.type === 'select') return 'Select an option for ' + named(field);
    if (field.type === 'links') return 'Add at least one link for ' + named(field);
    if (field.type === 'images') return 'Add at least one image for ' + named(field);
    return 'Enter an answer for ' + named(field);
  }

  /**
   * Problem with a field's current value.
   * @param {object} field a descriptor from readFields
   * @returns {string} the message to show, or '' when the field is fine
   */
  ns.checkField = function checkField(field) {
    const value = ns.readValue(field);
    const empty = Array.isArray(value) ? value.length === 0 : String(value).trim() === '';

    // An untouched skeleton (a pre-filled `markdown` outline) is not an answer.
    if (field.required && !ns.isAnswered(field)) return missingMessage(field);
    if (empty) return '';

    if (field.type === 'url' || field.type === 'image') {
      if (!isUrl(String(value)))
        return 'Enter a web address starting with https:// for ' + named(field) + like(field);
    }
    if (field.type === 'email' && !EMAIL.test(String(value))) {
      return 'Enter an email address for ' + named(field) + like(field);
    }
    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return 'Enter a date as YYYY-MM-DD for ' + named(field);
    }
    if (field.type === 'number' && !Number.isFinite(Number(value))) {
      return 'Enter a number for ' + named(field);
    }
    if (field.type === 'links') {
      const bad = value.find((link) => !isUrl(link.url));
      if (bad) return 'Give every link in ' + named(field) + ' a web address starting with https://';
      const unlabelled = value.find((link) => !link.label);
      if (unlabelled)
        return 'Give every link in ' + named(field) + ' a short label, so readers know where it goes';
    }
    if (field.type === 'images') {
      const bad = value.find((item) => !isUrl(item.url));
      if (bad) return 'Give every line in ' + named(field) + ' an image address starting with https://';
    }
    return '';
  };

  /**
   * `aria-invalid` belongs on the control that is wrong, not on every control
   * in the field: marking all ten tick boxes of a group invalid tells a screen
   * reader user that each one of them is individually at fault.
   * @param {object} field
   * @returns {HTMLElement|null}
   */
  function invalidTarget(field) {
    return field.control || field.wrap.querySelector('input, select, textarea');
  }

  /**
   * Show an inline error under a field.
   * @param {object} field
   * @param {string} message
   */
  ns.showError = function showError(field, message) {
    const box = field.wrap.querySelector('.field-error');
    const text = box ? box.querySelector('[data-error-text]') : null;
    if (text) text.textContent = message;
    if (box) box.hidden = false;
    const control = invalidTarget(field);
    if (control) control.setAttribute('aria-invalid', 'true');
  };

  /**
   * Clear a field's error state.
   * @param {object} field
   */
  ns.clearError = function clearError(field) {
    const box = field.wrap.querySelector('.field-error');
    if (box) box.hidden = true;
    field.wrap.querySelectorAll('[aria-invalid]').forEach((control) => {
      control.removeAttribute('aria-invalid');
    });
  };

  /**
   * Validate every field, painting inline errors as it goes.
   * @param {object[]} fields
   * @returns {Array<{field: object, message: string}>} the problems found
   */
  ns.validateAll = function validateAll(fields) {
    const problems = [];
    fields.forEach((field) => {
      const message = ns.checkField(field);
      if (message) {
        ns.showError(field, message);
        problems.push({ field: field, message: message });
      } else {
        ns.clearError(field);
      }
    });
    return problems;
  };

  /**
   * Fill and reveal the error summary, then move focus to it.
   * @param {HTMLElement} summary the [data-error-summary] element
   * @param {Array<{field: object, message: string}>} problems
   */
  ns.renderSummary = function renderSummary(summary, problems) {
    const list = summary.querySelector('[data-error-summary-list]');
    const title = summary.querySelector('[data-error-summary-title]');
    if (title) {
      title.textContent =
        problems.length === 1
          ? 'One answer still needs attention'
          : problems.length + ' answers still need attention';
    }
    if (list) {
      list.textContent = '';
      problems.forEach((problem) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'error-summary-link';
        // Fall back to the field wrapper for controls without an id of their
        // own (option groups, link rows), so the link is never a bare "#".
        const control = problem.field.control;
        link.href = '#' + (control && control.id ? control.id : problem.field.wrap.id || '');
        link.textContent = problem.message;
        link.addEventListener('click', (event) => {
          event.preventDefault();
          ns.focusField(problem.field);
        });
        item.appendChild(link);
        list.appendChild(item);
      });
    }
    summary.hidden = false;
    summary.focus();
  };

  /** Hide the error summary. @param {HTMLElement} summary */
  ns.hideSummary = function hideSummary(summary) {
    summary.hidden = true;
  };

  /**
   * Move focus to a field's first control and scroll it into view.
   * @param {object} field
   */
  ns.focusField = function focusField(field) {
    const control = field.control || field.wrap.querySelector('input, select, textarea, button');
    if (!control) return;
    if (typeof control.scrollIntoView === 'function') {
      control.scrollIntoView({ block: 'center', behavior: ns.scrollBehavior() });
    }
    control.focus();
  };
})((window.SubmitForm = window.SubmitForm || {}));
