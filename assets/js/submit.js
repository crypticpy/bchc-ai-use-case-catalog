/**
 * Submit form — entry point. Wires the pieces in assets/js/submit/*.js:
 * fields (registry) → validate → repeatable → preview → draft → handoff →
 * review.
 *
 * Loaded last by the `scripts:` list in submit/index.md front matter, so every
 * window.SubmitForm helper it calls is already defined.
 *
 * DOM contract: see the comment block at the top of submit/index.md.
 */
(function (ns) {
  'use strict';

  /**
   * GitHub rejects very long URLs; well below that we switch to copy-paste.
   * Keep this in step with `prefillNoticeIfTooLong` in
   * assets/js/configurator/strings.js, which warns at the same length for the
   * configurator's prefilled "new file" links.
   */
  const MAX_URL = 7000;

  /** Warn the submitter once the prefilled URL is this close to the ceiling. */
  const URL_WARN_AT = Math.round(MAX_URL * 0.85);

  /**
   * Show a message in the status region under the buttons.
   * @param {HTMLElement|null} box
   * @param {string} message
   */
  function say(box, message) {
    if (!box) return;
    box.textContent = message;
    box.hidden = message === '';
  }

  /** Screen-reader suffix for each section state. */
  const PROGRESS_LABELS = { complete: ' — complete', partial: ' — in progress', empty: ' — not started' };

  /**
   * Section progress: `complete` once every required field in the section has
   * an answer (or, with no required fields, once anything is answered),
   * `partial` when something is answered but a required field is still blank,
   * `empty` otherwise.
   * @param {object[]} fields
   * @param {string} sectionKey
   * @returns {'complete'|'partial'|'empty'}
   */
  function sectionState(fields, sectionKey) {
    const inSection = fields.filter((field) => field.section === sectionKey);
    if (inSection.length === 0) return 'empty';
    const answered = inSection.filter((field) => ns.isAnswered(field));
    if (answered.length === 0) return 'empty';
    const required = inSection.filter((field) => field.required);
    if (required.every((field) => ns.isAnswered(field))) return 'complete';
    return 'partial';
  }

  /**
   * Keep the sticky rail and the mobile counter in step with the answers.
   * @param {HTMLElement} root
   * @param {HTMLFormElement} form
   * @param {object[]} fields
   * @returns {{update: () => void, errors: (problems: object[]) => void}}
   */
  function initProgress(root, form, fields) {
    const links = Array.from(root.querySelectorAll('[data-progress-link]'));
    const count = root.querySelector('[data-progress-count]');
    const lineText = form.querySelector('[data-progress-line]');
    const lineSection = form.querySelector('[data-progress-section]');
    const total = links.length;

    const sections = Array.from(form.querySelectorAll('[data-section]'));
    if (typeof IntersectionObserver === 'function' && sections.length > 0) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const key = entry.target.dataset.section;
            links.forEach((link) => {
              link.setAttribute('aria-current', String(link.dataset.progressLink === key));
            });
            // The sticky mobile bar is the only place a small screen shows which
            // section it is in, so it tracks the same observer as the rail.
            const heading = entry.target.querySelector('h2');
            if (lineSection && heading) lineSection.textContent = heading.textContent.trim();
          });
        },
        { rootMargin: '-20% 0px -70% 0px' }
      );
      sections.forEach((section) => observer.observe(section));
    }

    /**
     * Put the number of problems found in each section on its rail link. The
     * rail is the only map of a form this long; after a failed submit it should
     * say where the work is, not just how much of it is done.
     * @param {Array<{field: object, message: string}>} problems
     */
    function paintErrors(problems) {
      links.forEach((link) => {
        const badge = link.querySelector('[data-progress-errors]');
        if (!badge) return;
        const found = problems.filter(
          (problem) => problem.field.section === link.dataset.progressLink
        ).length;
        badge.textContent = found > 0 ? found + ' to fix' : '';
        badge.hidden = found === 0;
      });
    }

    return {
      update: function update() {
        let done = 0;
        links.forEach((link) => {
          const progress = sectionState(fields, link.dataset.progressLink);
          if (progress === 'complete') done += 1;
          link.dataset.done = progress === 'complete' ? 'true' : progress === 'partial' ? 'partial' : 'false';
          const state = link.querySelector('[data-progress-state]');
          if (state) state.textContent = PROGRESS_LABELS[progress];
        });
        const message = done + ' of ' + total + ' sections complete';
        if (count) count.textContent = message;
        if (lineText) lineText.textContent = message;
      },
      errors: paintErrors,
    };
  }

  /**
   * Boot the page.
   * @param {Document|HTMLElement} root
   */
  function init(root) {
    const form = root.querySelector('[data-submit-form]');
    if (!form) return;

    const fields = ns.readFields(form);
    const summary = form.querySelector('[data-error-summary]');
    const status = form.querySelector('[data-submit-status]');
    const fallback = form.querySelector('[data-fallback]');
    const fallbackBody = form.querySelector('[data-fallback-body]');
    const fallbackLink = form.querySelector('[data-fallback-link]');
    const lengthNote = form.querySelector('[data-length-note]');

    // The browser's own required-field messages are the no-JS fallback, so
    // `novalidate` is set here rather than in the markup: with scripts running,
    // this page's messages are the better ones.
    form.setAttribute('novalidate', 'novalidate');

    const paintPreview = ns.initPreview(root.documentElement || root, fields);
    const progress = initProgress(root.documentElement || root, form, fields);
    const paintProgress = progress.update;
    const titleField = fields.find((field) => field.wrap.dataset.role === 'title');

    /** @returns {string} the entry title, for issue titles and filenames */
    function entryTitle() {
      return titleField ? String(ns.readValue(titleField)) : '';
    }

    let draft = { save: function () {}, clear: function () {}, flush: function () {} };

    /**
     * Warn while there is still time to do something about it: once the
     * prefilled link is near the ceiling, say so instead of waiting for the
     * submitter to press the button and be handed a copy-paste box.
     */
    function paintLength() {
      if (!lengthNote) return;
      const length = ns.issueUrl(form, fields, entryTitle()).length;
      const near = length >= URL_WARN_AT;
      if (near) {
        lengthNote.textContent =
          length > MAX_URL
            ? 'Your answers are now too long to carry in a link. Pressing the button below will hand you the text to paste into a blank issue instead.'
            : 'Your answers are getting long. A little more and they will not fit in a link — you will be given text to paste into a blank issue instead.';
      }
      lengthNote.hidden = !near;
    }

    /** Repaint everything that mirrors the answers. */
    function refresh() {
      paintPreview();
      paintProgress();
      paintLength();
      draft.save();
    }

    draft = ns.initDraft(form, fields, function afterRestore() {
      fields.filter((field) => field.type === 'images').forEach(ns.renderImagePreviews);
      paintPreview();
      paintProgress();
      paintLength();
    });

    ns.initRepeatables(fields, refresh);

    form.addEventListener('input', (event) => {
      const wrap = event.target.closest ? event.target.closest('[data-field]') : null;
      const field = wrap ? fields.find((candidate) => candidate.wrap === wrap) : null;
      if (field && field.type === 'images') ns.renderImagePreviews(field);
      if (field && !ns.checkField(field)) ns.clearError(field);
      refresh();
    });
    form.addEventListener('change', refresh);

    form.addEventListener(
      'blur',
      (event) => {
        const wrap = event.target.closest ? event.target.closest('[data-field]') : null;
        if (!wrap) return;
        const field = fields.find((candidate) => candidate.wrap === wrap);
        if (!field) return;
        const message = ns.checkField(field);
        if (message) ns.showError(field, message);
        else ns.clearError(field);
      },
      true
    );

    /**
     * Hand the answers to GitHub, from the review panel.
     *
     * The draft is deliberately *not* cleared here. Opening a tab is not
     * submitting: the issue is still a draft until "Submit new issue" is
     * pressed on GitHub, and a submitter who loses that tab needs their answers
     * to still be here. The confirmation panel offers to delete it instead.
     */
    function send() {
      // No repository, no issue to open — `https://github.com//issues/new` is a
      // dead link, so the copy-out route is the whole of it. The markup already
      // says so; this is the button honouring it.
      if (!form.dataset.repo) {
        ns.exitReview(form);
        showFallback(
          'This site has no catalog repository behind it, so there is no issue to open. Your answers are in the box below — copy them wherever they need to go.',
          ''
        );
        return;
      }

      const url = ns.issueUrl(form, fields, entryTitle());
      if (url.length > MAX_URL) {
        ns.exitReview(form);
        showFallback(
          'Your answers are too long to carry in a link. Copy the text below into a blank issue instead — the box is right under these buttons.',
          ''
        );
        return;
      }

      // Not `window.open(url, '_blank', 'noopener')`: with `noopener` in the
      // features string the call returns null even when the tab opened, which
      // made every successful submit look blocked. Sever the opener afterwards.
      const opened = window.open(url, '_blank');
      if (opened) opened.opener = null;
      if (!opened) {
        ns.exitReview(form);
        showFallback(
          'Your browser blocked the new tab. Use the link below to open the prefilled issue, or copy the text and paste it into a blank issue.',
          url
        );
        return;
      }
      say(status, '');
      ns.renderConfirmation(form, fields, {
        url: url,
        email: form.dataset.fallbackEmail || '',
        subject: (form.dataset.titlePrefix || '') + (entryTitle() || 'New entry'),
        onDelete: function () {
          draft.clear();
          ns.exitReview(form);
          say(status, 'Saved draft deleted. Thanks for sending it in.');
          refresh();
        },
      });
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const problems = ns.validateAll(fields);
      progress.errors(problems);
      if (problems.length > 0) {
        ns.renderSummary(summary, problems);
        say(status, '');
        return;
      }
      ns.hideSummary(summary);
      say(status, '');
      ns.renderReview(form, fields, {
        onSend: send,
        onBack: refresh,
        sendLabel: form.dataset.repo ? '' : 'Copy your answers',
      });
    });

    /**
     * Reveal the copy-paste route, optionally with a direct link to the
     * prefilled issue (present when a popup was blocked, absent when the URL
     * was too long to exist).
     * @param {string} message
     * @param {string} url
     */
    function showFallback(message, url) {
      if (fallbackBody) fallbackBody.value = ns.markdownBody(fields);
      if (fallbackLink) {
        if (url) fallbackLink.href = url;
        fallbackLink.hidden = !url;
      }
      if (fallback) fallback.hidden = false;
      say(status, message);
      if (fallbackBody) fallbackBody.focus();
    }

    form.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('[data-action]') : null;
      if (!button) return;
      const action = button.dataset.action;

      if (action === 'email') {
        const email = form.dataset.fallbackEmail || '';
        if (!email) {
          say(status, 'No email address is configured for this catalog. Use the GitHub button instead.');
          return;
        }
        const subject = (form.dataset.titlePrefix || '') + (entryTitle() || 'New entry');
        window.location.href = ns.mailtoUrl(email, subject, ns.markdownBody(fields));
        return;
      }

      const text =
        action === 'copy-yaml'
          ? ns.yamlFrontMatter(fields)
          : action === 'copy-markdown'
            ? ns.markdownBody(fields)
            : action === 'copy-fallback' && fallbackBody
              ? fallbackBody.value
              : null;
      if (text === null) return;
      if (!text.trim()) {
        say(status, 'There is nothing to copy yet.');
        return;
      }
      ns.copyText(text).then((ok) => {
        say(
          status,
          ok ? 'Copied to your clipboard.' : 'Copying failed — select the text and copy it by hand.'
        );
      });
    });

    // Copying, emailing and saving a draft all need scripting, so the markup
    // ships them hidden rather than leaving dead buttons on a page without JS.
    root.querySelectorAll('[data-js-only]').forEach((node) => {
      node.hidden = false;
    });

    // The preview is a scripting feature: reveal it only now, and start it
    // collapsed on narrow screens so it doesn't push the form down.
    const panel = root.querySelector('[data-preview-panel]');
    if (panel) {
      panel.hidden = false;
      panel.open = !window.matchMedia || window.matchMedia('(min-width: 1024px)').matches;
    }

    fields.filter((field) => field.type === 'images').forEach(ns.renderImagePreviews);
    paintPreview();
    paintProgress();
    paintLength();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document));
  } else {
    init(document);
  }

  ns.init = init;
})((window.SubmitForm = window.SubmitForm || {}));
