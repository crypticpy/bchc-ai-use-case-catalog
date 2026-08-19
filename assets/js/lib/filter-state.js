/**
 * Pure catalog filter logic: URL state, facet matching, live counts and label
 * pluralisation. No DOM, no globals — every function takes plain data, so
 * assets/js/filters.js stays thin and test/scripts/filter_state.test.mjs can
 * exercise the rules directly.
 *
 * Shared shapes:
 *   state   Map<facetKey, Set<slug>> — an empty Set is never stored.
 *   facets  { [facetKey]: Set<slug> } — one per card, in card order.
 */

/**
 * Read catalog state out of a query string.
 * `sort=relevance` without a query is meaningless (there is nothing to rank),
 * so it degrades to the default order.
 * @param {string} search `window.location.search`; a leading "?" is optional.
 * @param {string[]} keys facet keys to look for; `a-b` also accepts `a_b`.
 * @returns {{state: Map<string, Set<string>>, q: string, sort: string,
 *   sortExplicit: boolean, view: string}}
 */
export function parseQuery(search, keys) {
  const params = new URLSearchParams(search || '');
  const state = new Map();
  (keys || []).forEach((key) => {
    const raw = params.get(key) || params.get(key.replace(/-/g, '_'));
    if (!raw) return;
    const set = new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    if (set.size) state.set(key, set);
  });
  const q = params.get('q') || '';
  let sort = params.get('sort') || 'newest';
  let sortExplicit = params.has('sort');
  if (sort === 'relevance' && !q.trim()) {
    sort = 'newest';
    sortExplicit = false;
  }
  return { state, q, sort, sortExplicit, view: params.get('view') === 'list' ? 'list' : 'grid' };
}

/**
 * Serialise catalog state back into a query string. Defaults are omitted so a
 * pristine catalog keeps a clean URL.
 * @param {{state: Map<string, Set<string>>, q?: string, sort?: string, view?: string}} input
 * @returns {string} query string without the leading "?" ('' when everything is default).
 */
export function serializeQuery({ state, q = '', sort = 'newest', view = 'grid' }) {
  const params = new URLSearchParams();
  if (state)
    state.forEach((set, key) => {
      if (set && set.size) params.set(key, Array.from(set).join(','));
    });
  const trimmed = (q || '').trim();
  if (trimmed) params.set('q', trimmed);
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (view && view !== 'grid') params.set('view', view);
  return params.toString();
}

/**
 * Toggle one facet value in `state` (mutated in place).
 * @param {Map<string, Set<string>>} state
 * @param {string} key facet key.
 * @param {string} value facet value (slug).
 * @param {string} [mode] 'single' replaces the group's selection, anything else adds to it.
 * @param {boolean} [forceOff] always remove (the "remove filter" pills).
 * @returns {Map<string, Set<string>>} the same map, for chaining.
 */
export function toggleFacet(state, key, value, mode, forceOff) {
  const set = state.get(key) || new Set();
  if (set.has(value) || forceOff) set.delete(value);
  else {
    if (mode === 'single') set.clear();
    set.add(value);
  }
  if (set.size) state.set(key, set);
  else state.delete(key);
  return state;
}

/**
 * Whether one card satisfies every active filter except `exceptKey`.
 * Excluding one key is how the pill counts are computed: a pill's own count
 * must not be narrowed by its own group's selection.
 * @param {Record<string, Set<string>>} facets the card's facet map.
 * @param {Map<string, Set<string>>} state active filters.
 * @param {string|null} [exceptKey] facet key to ignore, or null to check all.
 * @returns {boolean}
 */
export function facetMatches(facets, state, exceptKey = null) {
  for (const [key, set] of state) {
    if (!set.size || key === exceptKey) continue;
    const have = facets[key];
    if (!have) return false;
    let hit = false;
    set.forEach((v) => {
      if (have.has(v)) hit = true;
    });
    if (!hit) return false;
  }
  return true;
}

/**
 * How many of `indices` carry `value` under `key`.
 * @param {Array<Record<string, Set<string>>>} facetList one facet map per card.
 * @param {number[]} indices candidate card indices (already narrowed by the other facets).
 * @param {string} key facet key.
 * @param {string} value facet value (slug).
 * @returns {number}
 */
export function countValue(facetList, indices, key, value) {
  let n = 0;
  indices.forEach((i) => {
    const have = facetList[i] && facetList[i][key];
    if (have && have.has(value)) n++;
  });
  return n;
}

/**
 * Pick the singular or plural noun for a count.
 * Both labels come from `_data/schema.yml` (`entry.singular` / `entry.plural`)
 * via data attributes — nothing here ever names an entry type.
 * @param {number} n
 * @param {string} singular
 * @param {string} plural
 * @returns {string}
 */
export function pluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

/**
 * The live-region sentence: "3 of 10 use cases. Filters: Triage, “dashboard”."
 * @param {number} shown visible cards.
 * @param {number} total cards on the page.
 * @param {string} singular schema singular noun.
 * @param {string} plural schema plural noun.
 * @param {string[]} [names] active filter labels (and the quoted query, if any).
 * @returns {string}
 */
export function statusText(shown, total, singular, plural, names = []) {
  const nouns = pluralize(shown, singular, plural);
  const suffix = names && names.length ? '. Filters: ' + names.join(', ') + '.' : '.';
  return shown + ' of ' + total + ' ' + nouns + suffix;
}

/**
 * Screen-reader text for a filter pill's count badge. The visible number is
 * `aria-hidden`, otherwise "Topic 12" is announced as one token.
 * @param {number} n
 * @returns {string} e.g. " (1 match)" / " (12 matches)".
 */
export function countLabel(n) {
  return ' (' + n + (n === 1 ? ' match)' : ' matches)');
}

/**
 * The members of `next` that were not in `prev` — the cards that just joined the
 * result set. Everything that survived a filter change is deliberately absent, so
 * the caller can animate the arrivals and leave the survivors untouched.
 * @template T
 * @param {Iterable<T>|null|undefined} prev keys visible before this render.
 * @param {Iterable<T>|null|undefined} next keys visible after it.
 * @returns {Set<T>} the arrivals, in `next` order.
 */
export function enteredKeys(prev, next) {
  const before = prev instanceof Set ? prev : new Set(prev || []);
  const entered = new Set();
  for (const key of next || []) {
    if (!before.has(key)) entered.add(key);
  }
  return entered;
}
