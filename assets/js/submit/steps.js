/**
 * Submit form — stepped sections.
 *
 * With scripts on and more than one section, the long form becomes a wizard:
 * one [data-section] visible at a time, Back and Next between them, and the
 * progress rail doubling as step navigation. A forward move validates every
 * step it leaves or skips, in order, and stops on the first one with problems
 * — the same semantics as the setup wizard's goTo. A backward move is free.
 *
 * The section heading takes focus on every step change, so the change itself
 * is the announcement — no live region (see assets/js/configurator/wizard/
 * errors.js for the reasoning). Problems found on a forward move are painted
 * first and announced after: the summary takes focus only once the step that
 * owns the errors is the one on screen.
 *
 * Nothing here runs without scripts, and the form stays one long page — the
 * [data-step-nav] bars ship hidden, and assets/js/submit.js removes them
 * outright when the schema has a single section.
 *
 * DOM contract: [data-section] with a [data-step-nav] holding
 * [data-step-action=back|next]; [data-step-finish] (the closing block, shown
 * on the last step only); [data-progress-link] rail links;
 * [data-progress-section] on the mobile bar.
 *
 * Exposes: window.SubmitForm.initSteps
 */
(function (ns) {
  'use strict';

  /**
   * Wire the stepper.
   * @param {HTMLFormElement} form
   * @param {object[]} fields descriptors from readFields (unused today, kept so
   *   the three submit controllers share one signature)
   * @param {{
   *   isSectionAvailable?: (key: string) => boolean,
   *   validateSection?: (key: string) => Array<{field: object, message: string}>,
   *   onProblems?: (key: string, problems: object[]) => void,
   *   onClean?: (key: string) => void,
   *   onMove?: () => void,
   * }} options `isSectionAvailable` lets the short form skip sections with
   *   nothing to show; `onMove` fires after every landed move (persist state,
   *   hide the summary).
   * @returns {object|null} the controller, or null with fewer than two sections
   */
  ns.initSteps = function initSteps(form, fields, options) {
    const sections = Array.from(form.querySelectorAll('[data-section]'));
    if (sections.length < 2) return null;
    const opts = options || {};
    // The rail sits outside the form, so it is found from the document.
    const links = Array.from(document.querySelectorAll('[data-progress-link]'));
    const finish = form.querySelector('[data-step-finish]');
    const mobileSection = form.querySelector('[data-progress-section]');
    let current = 0;

    // The stylesheet drops the between-section dividers while stepping: with
    // one section on screen there is nothing to divide.
    form.setAttribute('data-stepped', 'true');

    /** @param {number} index @returns {boolean} false when the short form skips it */
    function available(index) {
      return !opts.isSectionAvailable || opts.isSectionAvailable(sections[index].dataset.section);
    }

    /** @returns {number} next available index after `current`, or -1 */
    function nextIndex() {
      for (let i = current + 1; i < sections.length; i += 1) if (available(i)) return i;
      return -1;
    }

    /** @returns {number} previous available index before `current`, or -1 */
    function prevIndex() {
      for (let i = current - 1; i >= 0; i -= 1) if (available(i)) return i;
      return -1;
    }

    /**
     * Paint the current step: one section visible, its Back/Next matching its
     * position, the closing block on the last step only, the rail marking
     * where we are and dimming what the short form skipped.
     * @param {boolean} focus move focus to the section heading
     */
    function apply(focus) {
      // The short form can pull the ground out from under the current step
      // (toggle it on while standing on an all-optional section): step off it.
      if (!available(current)) {
        const fallback = nextIndex() !== -1 ? nextIndex() : prevIndex();
        if (fallback !== -1) current = fallback;
      }
      const section = sections[current];
      sections.forEach((node, index) => {
        node.hidden = index !== current;
      });

      const next = nextIndex();
      const nav = section.querySelector('[data-step-nav]');
      if (nav) {
        const back = nav.querySelector('[data-step-action="back"]');
        const forward = nav.querySelector('[data-step-action="next"]');
        if (back) back.hidden = prevIndex() === -1;
        if (forward) forward.hidden = next === -1;
      }
      if (finish) finish.hidden = next !== -1;

      links.forEach((link) => {
        const index = sections.findIndex((node) => node.dataset.section === link.dataset.progressLink);
        if (index === current) link.setAttribute('aria-current', 'step');
        else link.removeAttribute('aria-current');
        const skipped = index !== -1 && !available(index);
        link.dataset.skipped = String(skipped);
        if (skipped) link.setAttribute('aria-disabled', 'true');
        else link.removeAttribute('aria-disabled');
      });

      // The sticky mobile bar is the only place a small screen shows which
      // section it is in.
      const heading = section.querySelector('h2');
      if (mobileSection && heading) mobileSection.textContent = heading.textContent.trim();

      if (focus && heading) {
        // Focus without the browser's own minimal scroll, then place the
        // section deliberately: its scroll-mt clears the sticky bars.
        try {
          heading.focus({ preventScroll: true });
        } catch (error) {
          heading.focus();
        }
        if (typeof section.scrollIntoView === 'function') {
          section.scrollIntoView({ block: 'start', behavior: ns.scrollBehavior() });
        }
      }
    }

    /**
     * Move to a step by index. Forward moves validate; `check: false` is the
     * free route (Back, error-summary links, review Change buttons).
     * @param {number} target
     * @param {boolean} [check]
     */
    function goTo(target, check) {
      const bounded = Math.min(Math.max(target, 0), sections.length - 1);
      if (check !== false && bounded > current) {
        for (let i = current; i < bounded; i += 1) {
          if (!available(i)) continue;
          const key = sections[i].dataset.section;
          const problems = opts.validateSection ? opts.validateSection(key) : [];
          if (problems.length > 0) {
            current = i;
            apply(false);
            if (opts.onProblems) opts.onProblems(key, problems);
            return;
          }
          if (opts.onClean) opts.onClean(key);
        }
      }
      current = bounded;
      apply(true);
      if (opts.onMove) opts.onMove();
    }

    /**
     * Jump straight to a section by key, no validation — the routes that fix
     * or change an answer must never be blocked by the answer being wrong.
     * @param {string} key
     * @param {boolean} [focus] move focus to the heading (default true)
     */
    function show(key, focus) {
      const index = sections.findIndex((node) => node.dataset.section === key);
      if (index === -1) return;
      current = index;
      apply(focus !== false);
      if (opts.onMove) opts.onMove();
    }

    /** Jump to the last available step without focusing (the fallback routes). */
    function showLast() {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        if (!available(i)) continue;
        current = i;
        apply(false);
        if (opts.onMove) opts.onMove();
        return;
      }
    }

    form.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('[data-step-action]') : null;
      if (!button) return;
      if (button.dataset.stepAction === 'next') {
        const next = nextIndex();
        if (next !== -1) goTo(next);
      } else {
        const prev = prevIndex();
        if (prev !== -1) goTo(prev, false);
      }
    });

    // The rail's anchors are the no-JS route; stepping intercepts them and
    // applies the wizard's jump semantics instead.
    links.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        const index = sections.findIndex((node) => node.dataset.section === link.dataset.progressLink);
        if (index === -1 || !available(index)) return;
        goTo(index);
      });
    });

    return {
      apply,
      goTo,
      show,
      showLast,
      current: () => sections[current].dataset.section,
      isLast: () => nextIndex() === -1,
      next: () => {
        const next = nextIndex();
        if (next !== -1) goTo(next);
      },
    };
  };
})((window.SubmitForm = window.SubmitForm || {}));
