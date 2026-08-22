// Lunr search over /search.json, wired as an ARIA combobox.
//
// DATA-ATTRIBUTE CONTRACT (_includes/results-header.html)
//   [data-filter="search"]     role="combobox" input; data-search-index="/search.json"
//                              aria-expanded / aria-controls / aria-activedescendant
//   [data-search-results]      role="listbox" <ul>, `hidden` when closed
//   [data-search-status]       visible status line for a failed index load
//   [data-search-live]         sr-only role="status": how many suggestions are open
//   [data-search-floor]        wrapper for the "show the weaker matches" button
//   [data-search-more]         that button
//   [data-match-slot]          optional, inside an entry card (_includes/entry-card.html):
//                              filled with the section + snippet that matched
//   [data-empty-suggestions]   optional, inside the zero-result panel (_layouts/catalog.html):
//                              filled with "did you mean this tag" chips
//
// PUBLIC CONTRACT consumed by assets/js/filters.js:
//   window.__searchMatches  Set of entry ids that match, or null for "no query"
//   window.__searchOrder    entry ids in relevance order (drives the Relevance sort)
//   "catalog:search"        document event, fired whenever either changes
//
// CONSUMED FROM assets/js/filters.js:
//   window.__catalogFilters.vocabulary()  every facet value with the words a
//                                         reader might type for it
//   window.__catalogFilters.apply(k, v)   turn one of them on
//
// Vocabulary matches lead as filter suggestions; configured synonyms widen
// document recall at lower weight. A relevance floor keeps passing body mentions
// behind an explicit “show more” action without removing typo tolerance.
(function () {
  const input = document.querySelector('[data-filter="search"]');
  if (!input) return;
  const listbox = document.querySelector('[data-search-results]');
  const statusEl = document.querySelector('[data-search-status]');
  const liveEl = document.querySelector('[data-search-live]');
  const floorEl = document.querySelector('[data-search-floor]');
  const moreBtn = document.querySelector('[data-search-more]');
  const indexUrl = input.dataset.searchIndex || '/search.json';

  // Share of the top hit's score a result must reach to make the grid.
  const RELEVANCE_FLOOR = 0.25;
  // Context kept around a matched term. Deliberately lopsided: a suggestion row
  // clamps to two lines, so a centred match is the half that gets cut off — and
  // the whole point of the snippet is that you can see what matched.
  const SNIPPET_LEAD = 12;
  const SNIPPET_TRAIL = 150;
  // A hung connection (captive portal, a proxy that accepts and never answers)
  // must fail loudly rather than leave `loading` pending for ever.
  const FETCH_TIMEOUT = 8000;

  if (typeof lunr === 'undefined') {
    if (statusEl) {
      statusEl.textContent = 'Search is unavailable — try again.';
      statusEl.classList.remove('hidden');
    }
    return;
  }

  const emptySuggestions = document.querySelector('[data-empty-suggestions]');

  // Most rows the listbox will give to filters rather than documents, and the
  // most tags the zero-result panel will offer. Both are small on purpose: a
  // suggestion list that needs scrolling is a second search problem.
  const MAX_VOCAB_ROWS = 3;
  const MAX_EMPTY_CHIPS = 4;
  const MAX_CARD_ANNOTATIONS = 20;
  // Below this the query is a prefix of half the taxonomy and every suggestion
  // is noise.
  const MIN_VOCAB_QUERY = 2;

  let idx = null;
  let docs = [];
  // term -> [term, …] from _data/search.yml, already bidirectional and
  // lowercased by _plugins/search_index.rb.
  let synonyms = {};
  let loading = null;
  let attempts = 0;
  let options = [];
  let activeIndex = -1;
  // Bumped on every keystroke so a slow answer can never overwrite a newer one.
  let runSeq = 0;
  // The query whose relevance floor the reader has lifted, if any.
  let lifted = null;
  let annotationFrame = null;
  let annotationTimer = null;

  // Unhide before writing: a live region that is still `display:none` when its
  // text changes is not announced by every screen reader.
  function setStatus(message) {
    if (!statusEl) return;
    statusEl.classList.toggle('hidden', !message);
    statusEl.textContent = message || '';
  }

  /**
   * Flatten a doc's sections into the single string lunr indexes as `body`,
   * remembering where each section starts so a match position can be traced
   * back to the heading it fell under.
   * @param {object} doc a search.json doc, annotated in place.
   */
  function prepare(doc) {
    const parts = [];
    const spans = [];
    let at = 0;
    (doc.sections || []).forEach((section) => {
      const text = section.t || '';
      if (!text) return;
      if (parts.length) at += 1; // the space join() will insert
      spans.push({ start: at, end: at + text.length, h: section.h, a: section.a });
      parts.push(text);
      at += text.length;
    });
    doc.body = parts.join(' ');
    doc.spans = spans;
    doc.literal = Object.fromEntries(
      ['title', 'summary', 'facets', 'body'].map((field) => [field, String(doc[field] || '').toLowerCase()])
    );
  }

  function literalCount(value, term) {
    const text = String(value || '');
    let count = 0;
    let at = text.indexOf(term);
    while (at >= 0) {
      const before = at > 0 && /[\p{L}\p{N}]/u.test(text[at - 1]);
      const end = at + term.length;
      const after = end < text.length && /[\p{L}\p{N}]/u.test(text[end]);
      if (!before && !after) count += 1;
      at = text.indexOf(term, at + Math.max(1, term.length));
    }
    return count;
  }

  /** Avoid expensive relevance scoring when one literal word matches much of the supported catalog. */
  function commonLiteralQuery(terms, extra) {
    if (terms.length !== 1 || extra.length) return null;
    const term = terms[0];
    const fields = [
      ['title', 10],
      ['summary', 4],
      ['facets', 3],
      ['body', 1],
    ];
    const hits = docs
      .map((doc, index) => {
        let score = 0;
        const metadata = {};
        fields.forEach(([field, boost]) => {
          const count = literalCount(doc.literal[field], term);
          if (!count) return;
          metadata[field] = {};
          score += boost * Math.log1p(count);
        });
        return score ? { doc, score, meta: { [term]: metadata }, index } : null;
      })
      .filter(Boolean);
    if (hits.length < 25) return null;
    return hits
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(({ doc, score, meta }) => ({ doc, score, meta }));
  }

  /**
   * Fetch and index `/search.json`, memoizing the result. A failed load is
   * never memoized (see file header) so the next call retries, up to two
   * attempts before giving up with a visible message.
   * @returns {Promise<boolean>} whether `idx` is now usable.
   */
  function load() {
    if (idx) return Promise.resolve(true);
    if (loading) return loading;
    attempts += 1;
    const init = { priority: 'low' };
    if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      init.signal = AbortSignal.timeout(FETCH_TIMEOUT);
    }
    loading = fetch(indexUrl, init)
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data) => {
        docs = (data && data.docs) || [];
        synonyms = (data && data.synonyms) || {};
        docs.forEach(prepare);
        idx = lunr(function () {
          this.ref('i');
          this.field('title', { boost: 10 });
          this.field('summary', { boost: 4 });
          this.field('facets', { boost: 3 });
          this.field('body');
          this.metadataWhitelist = ['position'];
          docs.forEach((d, i) =>
            this.add({
              i: String(i),
              title: d.title,
              summary: d.summary,
              facets: d.facets,
              body: d.body,
            })
          );
        });
        setStatus('');
        return true;
      })
      .catch(() => {
        // Never memoize a rejection: drop the promise so the next keystroke retries.
        loading = null;
        idx = null;
        setStatus(attempts < 2 ? 'Search is unavailable — retrying…' : 'Search is unavailable — try again.');
        if (attempts < 2) return load();
        return false;
      });
    return loading;
  }

  /**
   * Keep prefix/typo recall for every word in a multi-term query; otherwise an
   * exact hit for one word can hide another word's approximate matches.
   * @param {string} q raw search box value.
   * @returns {{doc: object, score: number, meta: object}[]} ranked hits.
   */
  function query(q) {
    if (!idx) return [];
    const lower = q.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const extra = expand(lower, terms);
    const common = commonLiteralQuery(terms, extra);
    if (common) return common;
    const search = (approximate) =>
      idx.query((qb) => {
        terms.forEach((t) => {
          qb.term(t, { boost: 10 });
          if (approximate) {
            qb.term(t, { wildcard: lunr.Query.wildcard.TRAILING, boost: 3 });
            if (t.length > 3) qb.term(t, { editDistance: 1 });
          }
        });
        // Boost 1 against the literal term's 10: a synonym broadens the recall
        // without ever reordering the hits the reader's own words earned.
        extra.forEach((t) => qb.term(t, { boost: 1 }));
      });
    let hits;
    try {
      hits = search(false);
      if (!hits.length || terms.length > 1) hits = search(true);
    } catch (e) {
      hits = [];
    }
    return hits
      .map((h) => ({ doc: docs[Number(h.ref)], score: h.score, meta: h.matchData.metadata }))
      .filter((h) => h.doc);
  }

  /**
   * The extra lunr terms a query earns from `_data/search.yml`. Both the whole
   * query and each of its words are looked up, so "chat assistant" reaches
   * "chatbot" and "chatbot" reaches "chat" and "assistant" — multi-word
   * synonyms are split, because lunr has no phrase to match against.
   * @param {string} lower the whole query, lowercased.
   * @param {string[]} terms its words.
   * @returns {string[]} extra single-word terms, none of them already typed.
   */
  function expand(lower, terms) {
    const typed = new Set(terms);
    const out = new Set();
    const collect = (phrase) => {
      (synonyms[phrase] || []).forEach((syn) =>
        String(syn)
          .split(/\s+/)
          .filter(Boolean)
          .forEach((word) => {
            if (!typed.has(word)) out.add(word);
          })
      );
    };
    collect(lower);
    terms.forEach(collect);
    return Array.from(out);
  }

  /**
   * Facet values whose vocabulary the query hits, best first.
   *
   * Ranked by how the match was earned rather than by score: an exact word beats
   * a prefix beats a substring, and only then does the bigger tag win. `total`
   * (the count with nothing else applied) is the tiebreaker, not `count` — the
   * live count is zero for everything precisely when the query found nothing,
   * which is when these suggestions matter most.
   *
   * @param {string} q raw search box value.
   * @param {number} limit most rows to return.
   * @returns {Array<object>} vocabulary entries from filters.js, ranked.
   */
  function matchVocabulary(q, limit) {
    const api = window.__catalogFilters;
    const needle = q.trim().toLowerCase();
    if (!api || needle.length < MIN_VOCAB_QUERY) return [];
    const ranked = [];
    api.vocabulary().forEach((v) => {
      if (v.active || !v.total) return;
      let rank = -1;
      v.terms.forEach((term) => {
        let r = -1;
        if (term === needle) r = 0;
        else if (term.split(/\s+/).includes(needle)) r = 1;
        else if (term.startsWith(needle)) r = 2;
        else if (needle.length > 2 && term.indexOf(needle) > -1) r = 3;
        if (r > -1 && (rank === -1 || r < rank)) rank = r;
      });
      if (rank > -1) ranked.push({ rank: rank, v: v });
    });
    return ranked
      .sort((a, b) => a.rank - b.rank || b.v.total - a.v.total || a.v.label.localeCompare(b.v.label))
      .slice(0, limit)
      .map((r) => r.v);
  }

  /**
   * Turn a suggested facet on and hand the page back to the reader: the query
   * that produced the suggestion is cleared first, so the URL filters.js writes
   * is right on the first pass and the tag is not ANDed with the text that
   * failed to find it. Focus goes to the results heading — the listbox the
   * reader was in is about to disappear.
   * @param {{key: string, value: string}} v a vocabulary entry.
   */
  function applyVocabulary(v) {
    const api = window.__catalogFilters;
    if (!api) return;
    close();
    input.value = '';
    api.apply(v.key, v.value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const heading = document.getElementById('results-heading');
    if (heading) heading.focus();
  }

  /**
   * Publish the current result set for filters.js and fire `catalog:search`.
   * @param {Set<string>|null} matches entry ids that match, or null for "no query".
   * @param {string[]} order entry ids in relevance order.
   */
  function announce(matches, order) {
    window.__searchMatches = matches;
    window.__searchOrder = order;
    document.dispatchEvent(new CustomEvent('catalog:search'));
  }

  /* ------------------------------------------------------------- snippets */

  /**
   * The best body match for a hit: where in the write-up it landed, which
   * section that is, and enough surrounding words to read.
   * @param {{doc: object, meta: object}} hit
   * @returns {{before: string, match: string, after: string, section: object|null}|null}
   */
  function snippetFor(hit) {
    const text = hit.doc.body || '';
    if (!text) return null;
    const lower = text.toLowerCase();
    let best = null;
    Object.keys(hit.meta || {}).forEach((term) => {
      if (!hit.meta[term].body) return;
      const position = hit.meta[term].body.position?.[0];
      let start;
      let length;
      if (position) [start, length] = position;
      else {
        const needle = term.toLowerCase();
        start = lower.indexOf(needle);
        while (start > 0 && /[\p{L}\p{N}]/u.test(text[start - 1])) {
          start = lower.indexOf(needle, start + 1);
        }
        if (start < 0) return;
        let end = start + needle.length;
        while (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) end += 1;
        length = end - start;
      }
      if (!best || start < best[0]) best = [start, length];
    });
    if (!best) return null;

    const [start, length] = best;
    let from = Math.max(0, start - SNIPPET_LEAD);
    let to = Math.min(text.length, start + length + SNIPPET_TRAIL);
    // Snap to word boundaries so a snippet never opens mid-word.
    if (from > 0) {
      const space = text.indexOf(' ', from);
      if (space > -1 && space < start) from = space + 1;
    }
    if (to < text.length) {
      const space = text.lastIndexOf(' ', to);
      if (space > start + length) to = space;
    }
    const span = (hit.doc.spans || []).find((s) => start >= s.start && start < s.end);
    return {
      before: (from > 0 ? '…' : '') + text.slice(from, start),
      match: text.slice(start, start + length),
      after: text.slice(start + length, to) + (to < text.length ? '…' : ''),
      section: span || null,
    };
  }

  /**
   * Render a snippet as DOM. Built node by node rather than with innerHTML:
   * the docs are author-controlled but the matched string comes from the query.
   * @param {object} snip a snippetFor() result.
   * @returns {DocumentFragment}
   */
  function snippetNode(snip) {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createTextNode(snip.before));
    const mark = document.createElement('mark');
    mark.textContent = snip.match;
    frag.appendChild(mark);
    frag.appendChild(document.createTextNode(snip.after));
    return frag;
  }

  /* ------------------------------------------------------------- listbox */

  function close() {
    if (!listbox) return;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    if (liveEl) liveEl.textContent = '';
    activeIndex = -1;
  }

  /**
   * Set the active option (keyboard/mouse hover) and mirror it via
   * `aria-selected`/`aria-activedescendant` for the combobox.
   * @param {number} i index into `options`, or -1 to clear.
   */
  function highlight(i) {
    activeIndex = i;
    options.forEach((el, n) => {
      const on = n === i;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', String(on));
    });
    if (i >= 0 && options[i]) {
      input.setAttribute('aria-activedescendant', options[i].id);
      options[i].scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Build one `role="option"` row for the results listbox. A body hit shows the
   * section it matched and deep-links to it, so the reader lands on the
   * paragraph rather than the top of a long page.
   * @param {{doc: object}} hit a ranked hit.
   * @param {number} i index, used for the option's id and hover-highlight wiring.
   * @returns {HTMLLIElement}
   */
  function optionRow(hit, i) {
    const doc = hit.doc;
    const snip = snippetFor(hit);
    const li = document.createElement('li');
    li.className = 'search-option';
    li.id = 'search-option-' + i;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.url = snip && snip.section && snip.section.a ? doc.url + '#' + snip.section.a : doc.url;

    const text = document.createElement('span');
    text.className = 'min-w-0';
    const title = document.createElement('span');
    title.className = 'block truncate font-semibold text-brand-primary-dark';
    title.textContent = doc.title || '';
    const detail = document.createElement('span');
    // `line-clamp-2`, not `truncate`: a one-line row hides the match itself on a
    // narrow screen, which is the one thing the snippet exists to show. No
    // `block` alongside it — that would win the display race and unclamp it.
    detail.className = 'line-clamp-2 text-xs text-brand-muted';
    if (snip) detail.appendChild(snippetNode(snip));
    else detail.textContent = doc.summary || '';
    text.appendChild(title);
    text.appendChild(detail);
    li.appendChild(text);

    // The old "entry" chip said nothing — every row is an entry. The section
    // name says where in the write-up the answer is.
    const label = snip && snip.section && snip.section.h;
    if (label) {
      const chip = document.createElement('span');
      chip.className = 'chip-neutral shrink-0';
      chip.textContent = label;
      li.appendChild(chip);
    }

    // mousedown only preventDefaults, to keep focus in the combobox; the
    // navigation hangs off click, which is what VoiceOver and touch dispatch.
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => go(li));
    li.addEventListener('mouseenter', () => highlight(i));
    return li;
  }

  function go(li) {
    if (!li) return;
    if (li.dataset.facetKey) {
      applyVocabulary({ key: li.dataset.facetKey, value: li.dataset.facetValue });
      return;
    }
    if (li.dataset.url) window.location.href = li.dataset.url;
  }

  /**
   * Build one `role="option"` row that applies a filter instead of navigating.
   * Marked `.search-option-facet` so it does not read as one more document in a
   * list of documents, and captioned with the field it belongs to — the row has
   * to teach "Chat assistant is a Type of AI", not just offer it.
   * @param {object} v a vocabulary entry from filters.js.
   * @param {number} i index, for the option's id and hover-highlight wiring.
   * @returns {HTMLLIElement}
   */
  function vocabRow(v, i) {
    const li = document.createElement('li');
    li.className = 'search-option search-option-facet';
    li.id = 'search-option-' + i;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', 'false');
    li.dataset.facetKey = v.key;
    li.dataset.facetValue = v.value;

    const text = document.createElement('span');
    text.className = 'min-w-0';
    const title = document.createElement('span');
    title.className = 'block truncate font-semibold text-brand-primary-dark';
    title.textContent = v.label;
    const detail = document.createElement('span');
    detail.className = 'block truncate text-xs text-brand-muted';
    // Spelled out rather than "12": the row is read aloud in a list of
    // documents, and "Filter by Types of AI" is what tells them apart.
    detail.textContent =
      'Filter by ' + (v.group || 'tag') + ' · ' + v.total + (v.total === 1 ? ' match' : ' matches');
    text.appendChild(title);
    text.appendChild(detail);
    li.appendChild(text);

    const chip = document.createElement('span');
    chip.className = 'search-facet-chip shrink-0';
    chip.textContent = 'Filter';
    li.appendChild(chip);

    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => go(li));
    li.addEventListener('mouseenter', () => highlight(i));
    return li;
  }

  /**
   * Offer the tags a failed query nearly matched, in the zero-result panel.
   * The listbox closes with the reader's focus; this is where the suggestion
   * has to be waiting when they look at the page instead.
   * @param {object[]} vocab ranked vocabulary entries (may be empty).
   */
  function renderSuggestions(vocab) {
    if (!emptySuggestions) return;
    emptySuggestions.textContent = '';
    emptySuggestions.hidden = vocab.length === 0;
    if (!vocab.length) return;
    const lead = document.createElement('span');
    lead.className = 'text-sm text-brand-muted';
    lead.textContent = vocab.length === 1 ? 'Did you mean' : 'Did you mean one of';
    emptySuggestions.appendChild(lead);
    vocab.forEach((v) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'active-pill';
      btn.setAttribute('aria-label', 'Filter by ' + (v.group || 'tag') + ': ' + v.label);
      const name = document.createElement('span');
      name.textContent = v.label;
      btn.appendChild(name);
      const n = document.createElement('span');
      n.setAttribute('aria-hidden', 'true');
      n.textContent = String(v.total);
      btn.appendChild(n);
      btn.addEventListener('click', () => applyVocabulary(v));
      emptySuggestions.appendChild(btn);
    });
  }

  /**
   * Populate the listbox: matched filters first, then up to 5 non-entry hits
   * (events, cohorts, …), then up to 5 entry hits. Closes the listbox instead
   * when nothing matches at all.
   *
   * Filters lead because they answer the question the text hits only sample —
   * and because a reader who wanted the taxonomy word has, by typing it,
   * already told us so.
   * @param {object[]} results hits from `query()`.
   * @param {object[]} vocab ranked vocabulary entries from `matchVocabulary()`.
   */
  function renderList(results, vocab) {
    if (!listbox) return;
    listbox.textContent = '';
    options = [];
    const others = results.filter((h) => h.doc.kind !== 'entry').slice(0, 5);
    const entries = results.filter((h) => h.doc.kind === 'entry').slice(0, 5);
    const hits = others.concat(entries);
    const count = vocab.length + hits.length;
    if (!count) {
      close();
      return;
    }
    vocab.forEach((v, i) => {
      const li = vocabRow(v, i);
      options.push(li);
      listbox.appendChild(li);
    });
    hits.forEach((hit, i) => {
      const li = optionRow(hit, vocab.length + i);
      options.push(li);
      listbox.appendChild(li);
    });
    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (liveEl) {
      liveEl.textContent =
        count === 1
          ? '1 suggestion. Use the up and down arrow keys to review it.'
          : count + ' suggestions. Use the up and down arrow keys to review them.';
    }
    highlight(-1);
  }

  /* --------------------------------------------------------------- grid */

  /**
   * Fill each visible card's `[data-match-slot]` with the section and snippet
   * that put it there. No-ops when the card markup has no slot.
   * @param {object[]} hits entry hits currently in the grid.
   */
  function annotateCards(hits) {
    const slots = document.querySelectorAll('[data-match-slot]');
    if (!slots.length) return;
    const byId = new Map(hits.map((h) => [h.doc.id, h]));
    slots.forEach((slot) => {
      const card = slot.closest('[data-entry-id]');
      const hit = card && byId.get(card.dataset.entryId);
      const snip = hit && snippetFor(hit);
      slot.textContent = '';
      if (!snip) {
        slot.hidden = true;
        return;
      }
      if (snip.section && snip.section.h) {
        const name = document.createElement('span');
        name.className = 'font-semibold';
        name.textContent = snip.section.h + ' — ';
        slot.appendChild(name);
      }
      slot.appendChild(snippetNode(snip));
      slot.hidden = false;
    });
  }

  /** Clear stale snippets now, then decorate the highest-ranked cards after the filtered grid can paint. */
  function queueCardAnnotations(hits) {
    if (annotationFrame !== null) window.cancelAnimationFrame(annotationFrame);
    if (annotationTimer !== null) clearTimeout(annotationTimer);
    annotationFrame = null;
    annotationTimer = null;
    document.querySelectorAll('[data-match-slot]').forEach((slot) => {
      slot.textContent = '';
      slot.hidden = true;
    });
    if (!hits.length) return;
    annotationFrame = window.requestAnimationFrame(() => {
      annotationFrame = null;
      annotationTimer = setTimeout(() => {
        annotationTimer = null;
        annotateCards(hits.slice(0, MAX_CARD_ANNOTATIONS));
      }, 0);
    });
  }

  /**
   * Publish the entry hits that clear the relevance floor, and offer the rest.
   * @param {object[]} entries entry hits in ranked order.
   * @param {string} q the query they answer.
   */
  function publish(entries, q) {
    const top = entries.length ? entries[0].score : 0;
    const all = lifted === q;
    const strong = all ? entries : entries.filter((h) => h.score >= top * RELEVANCE_FLOOR);
    const weak = entries.length - strong.length;
    const ids = strong.map((h) => h.doc.id);
    announce(new Set(ids), ids);
    queueCardAnnotations(strong);

    if (!floorEl || !moreBtn) return;
    floorEl.hidden = weak === 0;
    moreBtn.textContent =
      weak === 1
        ? 'Show 1 more that mentions “' + q + '”'
        : 'Show ' + weak + ' more that mention “' + q + '”';
    moreBtn.dataset.searchMore = q;
  }

  /* -------------------------------------------------------------- events */

  let timer = null;
  /**
   * Query for the current input value and publish the matches to filters.js.
   * @param {boolean} [showList=true] also open the suggestion listbox — false
   *   when replaying a URL query on load, so a deep link filters the grid
   *   without popping a menu under an unfocused box.
   */
  function run(showList = true) {
    const q = input.value.trim();
    const seq = ++runSeq;
    if (!q) {
      lifted = null;
      if (floorEl) floorEl.hidden = true;
      queueCardAnnotations([]);
      renderSuggestions([]);
      announce(null, []);
      close();
      return;
    }
    // Vocabulary matching needs no index: it reads the pills that are already
    // on the page, so the offer is there on the first keystroke even while
    // /search.json is still in flight.
    const vocab = matchVocabulary(q, MAX_VOCAB_ROWS);
    renderSuggestions(matchVocabulary(q, MAX_EMPTY_CHIPS));
    load().then((ok) => {
      // A newer keystroke has already been answered. This is reachable: the
      // retry path in load() adds a microtask hop, so a query chained on the
      // failed attempt can resolve after one chained on the successful retry.
      if (seq !== runSeq) return;
      if (!ok) {
        announce(null, []);
        // The filter suggestions still stand — they never needed the index.
        if (showList && document.activeElement === input) renderList([], vocab);
        else close();
        return;
      }
      const results = query(q);
      publish(
        results.filter((h) => h.doc.kind === 'entry'),
        q
      );
      // Focus may have left the box while the fetch/debounce was pending
      // (type, then Tab straight away); don't reopen the popup under it.
      if (showList && document.activeElement === input) renderList(results, vocab);
    });
  }

  input.addEventListener('input', () => {
    lifted = null;
    queueCardAnnotations([]);
    clearTimeout(timer);
    timer = setTimeout(run, 50);
  });
  input.addEventListener('focus', () => load());

  if (moreBtn) {
    // Lifting the floor re-renders the current answer; it never re-queries and
    // never touches the URL, so Back still goes back to the previous page.
    moreBtn.addEventListener('click', () => {
      lifted = input.value.trim();
      run(false);
    });
  }

  input.addEventListener('keydown', (e) => {
    const open = listbox && !listbox.hidden;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        run();
        return;
      }
      highlight(activeIndex + 1 >= options.length ? 0 : activeIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return;
      highlight(activeIndex - 1 < 0 ? options.length - 1 : activeIndex - 1);
    } else if (e.key === 'Enter') {
      if (open && activeIndex >= 0) {
        e.preventDefault();
        go(options[activeIndex]);
      } else close();
    } else if (e.key === 'Escape') {
      // First Esc closes the listbox, a second one clears the query.
      if (open) {
        e.preventDefault();
        close();
      }
      // Clearing has to go through the same path a keystroke takes, otherwise
      // filters.js never hears about it and ?q= survives in the URL (and a
      // relevance sort is left selected with no query to rank against).
      else if (input.value) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target === input) return;
    if (listbox && listbox.contains(e.target)) return;
    close();
  });

  // Tab (or any other way focus leaves the box) closes the listbox: an open
  // combobox popup behind the focus ring is a keyboard trap for screen readers.
  // Picking an option cannot trip this — optionRow's mousedown preventDefault
  // keeps focus on the input — but relatedTarget is still checked for safety.
  input.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (to && (to === input || (listbox && listbox.contains(to)))) return;
    close();
  });

  /* ----------------------------------------------------------------- boot */

  // A deep link (`/catalog/?q=…`, e.g. from the home hero's search form) is
  // written into the box by filters.js, which loads before this script and so
  // dispatches its `input` event to nobody. Replay the query here instead —
  // this is the only place that knows the index exists.
  if (input.value.trim()) run(document.activeElement === input);

  // Backstop for the intent-based load above: warm the index when the browser
  // is otherwise idle, so the first keystroke rarely waits on the network.
  // Skipped on a metered or slow connection, where the index is a real cost.
  const conn = navigator.connection || {};
  if (!conn.saveData && !/2g/.test(conn.effectiveType || '')) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    idle(
      () => {
        if (!idx && !loading) load();
      },
      { timeout: 4000 }
    );
  }
})();
