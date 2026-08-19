/**
 * Submit form — draft autosave.
 *
 * The form is long, so answers are saved to localStorage as they're typed and
 * offered back on the next visit. Nothing leaves the browser, and the copy says
 * so: a draft saved here is on one device, in one browser, and a colleague
 * opening the same link sees an empty form.
 *
 * DOM contract: [data-draft-key] on the form (a site slug, so two catalogs on
 * the same origin don't collide), [data-draft-restore] bar with
 * [data-draft-saved] / [data-draft-count] and
 * [data-draft-action=restore|discard|save|clear], [data-draft-status], and
 * [data-draft-unavailable] for the "this browser will not save" case.
 *
 * Exposes: window.SubmitForm.initDraft
 */
(function (ns) {
  'use strict';

  /** Bump the version segment when the stored shape changes. */
  const KEY_PREFIX = 'catalog-template:submit-draft:v2';
  const DEBOUNCE_MS = 500;

  /** How often "saved just now" is re-read, so it ages while the page is open. */
  const CLOCK_MS = 30000;

  /**
   * @param {HTMLFormElement} form
   * @returns {string} the localStorage key for this site's draft
   */
  function storageKey(form) {
    return KEY_PREFIX + ':' + (form.dataset.draftKey || 'catalog');
  }

  /**
   * localStorage, or null when the browser refuses it (private mode, quota).
   * @returns {Storage|null}
   */
  function store() {
    try {
      const probe = window.localStorage;
      probe.setItem(KEY_PREFIX + ':probe', '1');
      probe.removeItem(KEY_PREFIX + ':probe');
      return probe;
    } catch (error) {
      return null;
    }
  }

  /**
   * How long ago, in words. Under an hour it counts up in minutes, because that
   * is the span where "is this the thing I was just typing?" is the question.
   * Older than that, a date answers it better than an elapsed time.
   * @param {string} iso an ISO timestamp
   * @returns {string} e.g. "just now", "12 minutes ago", "on 3 June"
   */
  function relative(iso) {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return minutes + ' minutes ago';
    const date = new Date(then);
    const hours = Math.floor(minutes / 60);
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (hours < 24) return 'at ' + time;
    return 'on ' + date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }

  /**
   * Wire autosave, the restore bar and the draft buttons.
   * @param {HTMLFormElement} form
   * @param {object[]} fields descriptors from readFields
   * @param {() => void} onRestore called after a draft is written into the form
   * @returns {{save: Function, clear: Function, flush: Function}}
   */
  ns.initDraft = function initDraft(form, fields, onRestore) {
    const key = storageKey(form);
    const memory = store();
    const status = form.querySelector('[data-draft-status]');
    const bar = form.querySelector('[data-draft-restore]');
    const barSaved = form.querySelector('[data-draft-saved]');
    const barCount = form.querySelector('[data-draft-count]');
    const unavailable = form.querySelector('[data-draft-unavailable]');
    let timer = null;
    let savedAt = '';
    // True between "you have an unfinished draft" appearing and the submitter
    // answering it. Autosaving while the bar is up would overwrite the very
    // draft the bar is offering — one keystroke and it is gone.
    let pending = false;

    /** @returns {object} the current answers, keyed by schema key */
    function snapshot() {
      const data = {};
      fields.forEach((field) => {
        if (ns.isAnswered(field)) data[field.key] = ns.readValue(field);
      });
      return data;
    }

    /**
     * Update the live status only when its text changes, so a screen reader
     * hears "Draft saved" once, not on every autosave while typing.
     * @param {string} text
     */
    function setStatus(text) {
      if (status && status.textContent !== text) status.textContent = text;
    }

    /** Repaint the saved-a-moment-ago line from the stored timestamp. */
    function paintStatus() {
      if (!savedAt) return;
      setStatus('Saved ' + relative(savedAt) + ' — on this device only.');
    }

    /** Write the current answers to storage and announce it. */
    function write() {
      if (!memory || pending) return;
      const data = snapshot();
      if (Object.keys(data).length === 0) {
        memory.removeItem(key);
        savedAt = '';
        setStatus('');
        return;
      }
      const stamp = new Date().toISOString();
      try {
        memory.setItem(key, JSON.stringify({ saved: stamp, fields: data }));
      } catch (error) {
        savedAt = '';
        setStatus('This browser would not save a draft. Copy your answers before leaving.');
        return;
      }
      savedAt = stamp;
      paintStatus();
    }

    /** Debounced autosave. Inert while a restore decision is outstanding. */
    function save() {
      if (pending) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(write, DEBOUNCE_MS);
    }

    /** Drop the saved draft. */
    function clear() {
      if (timer) window.clearTimeout(timer);
      pending = false;
      savedAt = '';
      if (memory) memory.removeItem(key);
      if (status) status.textContent = '';
      if (bar) bar.hidden = true;
    }

    /** @returns {{saved: string, fields: object}|null} the stored draft, if any */
    function read() {
      if (!memory) return null;
      try {
        const parsed = JSON.parse(memory.getItem(key) || 'null');
        if (!parsed || !parsed.fields) return null;
        return { saved: String(parsed.saved || ''), fields: parsed.fields };
      } catch (error) {
        return null;
      }
    }

    /**
     * Write the stored answers back into the form.
     *
     * A draft can outlive the schema that produced it — a maintainer removes a
     * question, and the answer to it has nowhere to go. Those keys are dropped
     * rather than silently kept, and the submitter is told how many, so a
     * shorter form than they remember has an explanation.
     */
    function restore() {
      const draft = read();
      pending = false;
      if (!draft) return;
      const known = new Set(fields.map((field) => field.key));
      const stored = Object.keys(draft.fields);
      const dropped = stored.filter((stored_key) => !known.has(stored_key)).length;
      fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(draft.fields, field.key)) {
          ns.setValue(field, draft.fields[field.key]);
        }
      });
      if (bar) bar.hidden = true;
      const restored = stored.length - dropped;
      setStatus(
        'Restored ' +
          restored +
          (restored === 1 ? ' answer.' : ' answers.') +
          (dropped > 0
            ? ' ' +
              dropped +
              (dropped === 1 ? ' answer was' : ' answers were') +
              ' saved for questions this form no longer asks, so it was left behind.'
            : '')
      );
      onRestore();
      savedAt = '';
      save();
    }

    /** Fill the restore bar with what is in storage, and show it. */
    function offerRestore(draft) {
      if (!bar) return;
      if (barSaved) {
        const when = relative(draft.saved);
        barSaved.textContent = when ? 'saved ' + when + ' on this device' : 'saved on this device';
      }
      if (barCount) {
        const answered = Object.keys(draft.fields).length;
        barCount.textContent = answered + ' of ' + fields.length + ' answers.';
      }
      bar.hidden = false;
      pending = true;
    }

    if (!memory) {
      if (unavailable) unavailable.hidden = false;
    } else {
      const existing = read();
      if (existing) offerRestore(existing);
    }

    // The status line ages in place: a form open for half an hour should not
    // still claim the draft was saved "just now".
    if (memory) window.setInterval(paintStatus, CLOCK_MS);

    form.addEventListener('click', (event) => {
      const button = event.target.closest ? event.target.closest('[data-draft-action]') : null;
      if (!button) return;
      const action = button.dataset.draftAction;
      if (action === 'restore') restore();
      if (action === 'save') {
        if (!memory) {
          setStatus('This browser will not save a draft. Copy your answers before leaving.');
          return;
        }
        if (timer) window.clearTimeout(timer);
        write();
        if (!savedAt) return;
        setStatus('Saved. Come back to this page in this browser and your answers will be waiting.');
      }
      if (action === 'discard' || action === 'clear') {
        clear();
        if (action === 'clear' && status) status.textContent = 'Saved draft deleted.';
      }
    });

    return { save: save, clear: clear, flush: write };
  };
})((window.SubmitForm = window.SubmitForm || {}));
