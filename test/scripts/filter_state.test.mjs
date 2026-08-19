/**
 * The pure half of the catalog filter logic (assets/js/lib/filter-state.js):
 * URL round-trips, facet matching, live counts and label pluralisation.
 * The DOM half lives in assets/js/filters.js and is exercised in the browser.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countLabel,
  countValue,
  enteredKeys,
  facetMatches,
  parseQuery,
  pluralize,
  serializeQuery,
  statusText,
  toggleFacet,
} from '../../assets/js/lib/filter-state.js';

const KEYS = ['area', 'stage', 'ai-role'];

/** @param {object} pairs key -> array of values @returns {Map<string, Set<string>>} */
const stateOf = (pairs) => new Map(Object.entries(pairs).map(([k, v]) => [k, new Set(v)]));

/* ------------------------------------------------------------- parseQuery */

test('parseQuery reads facets, query, sort and view', () => {
  const { state, q, sort, sortExplicit, view } = parseQuery(
    '?area=epi,ops&stage=pilot&q=triage&sort=az&view=list',
    KEYS
  );
  assert.deepEqual([...state.get('area')], ['epi', 'ops']);
  assert.deepEqual([...state.get('stage')], ['pilot']);
  assert.equal(q, 'triage');
  assert.equal(sort, 'az');
  assert.equal(sortExplicit, true);
  assert.equal(view, 'list');
});

test('parseQuery defaults everything absent', () => {
  const parsed = parseQuery('', KEYS);
  assert.equal(parsed.state.size, 0);
  assert.equal(parsed.q, '');
  assert.equal(parsed.sort, 'newest');
  assert.equal(parsed.sortExplicit, false);
  assert.equal(parsed.view, 'grid');
});

test('parseQuery accepts the underscore spelling of a hyphenated key', () => {
  const { state } = parseQuery('?ai_role=copilot', KEYS);
  assert.deepEqual([...state.get('ai-role')], ['copilot']);
});

test('parseQuery ignores unknown keys and blank values', () => {
  const { state } = parseQuery('?area=,%20,&nope=x', KEYS);
  assert.equal(state.size, 0);
});

test('parseQuery degrades a relevance sort with no query', () => {
  const bare = parseQuery('?sort=relevance', KEYS);
  assert.equal(bare.sort, 'newest');
  assert.equal(bare.sortExplicit, false);
  const withQuery = parseQuery('?sort=relevance&q=triage', KEYS);
  assert.equal(withQuery.sort, 'relevance');
  assert.equal(withQuery.sortExplicit, true);
});

/* --------------------------------------------------------- serializeQuery */

test('serializeQuery omits every default', () => {
  assert.equal(serializeQuery({ state: new Map(), q: '', sort: 'newest', view: 'grid' }), '');
  assert.equal(serializeQuery({ state: stateOf({ area: [] }) }), '');
});

test('serializeQuery writes facets, trimmed query, sort and view', () => {
  const qs = serializeQuery({
    state: stateOf({ area: ['epi', 'ops'], stage: ['pilot'] }),
    q: '  triage  ',
    sort: 'az',
    view: 'list',
  });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('area'), 'epi,ops');
  assert.equal(params.get('stage'), 'pilot');
  assert.equal(params.get('q'), 'triage');
  assert.equal(params.get('sort'), 'az');
  assert.equal(params.get('view'), 'list');
});

test('parse → serialize → parse round-trips', () => {
  const first = parseQuery('?area=epi,ops&q=triage&sort=az&view=list', KEYS);
  const again = parseQuery('?' + serializeQuery(first), KEYS);
  assert.deepEqual([...again.state.get('area')], ['epi', 'ops']);
  assert.equal(again.q, first.q);
  assert.equal(again.sort, first.sort);
  assert.equal(again.view, first.view);
});

/* ------------------------------------------------------------ toggleFacet */

test('toggleFacet adds, removes and drops the empty key', () => {
  const state = new Map();
  toggleFacet(state, 'area', 'epi', 'multi');
  toggleFacet(state, 'area', 'ops', 'multi');
  assert.deepEqual([...state.get('area')], ['epi', 'ops']);
  toggleFacet(state, 'area', 'epi', 'multi');
  assert.deepEqual([...state.get('area')], ['ops']);
  toggleFacet(state, 'area', 'ops', 'multi');
  assert.equal(state.has('area'), false);
});

test('toggleFacet in single mode replaces the selection', () => {
  const state = stateOf({ stage: ['pilot'] });
  toggleFacet(state, 'stage', 'live', 'single');
  assert.deepEqual([...state.get('stage')], ['live']);
});

test('toggleFacet with forceOff only ever removes', () => {
  const state = stateOf({ area: ['epi'] });
  toggleFacet(state, 'area', 'ops', 'multi', true);
  assert.deepEqual([...state.get('area')], ['epi']);
  toggleFacet(state, 'area', 'epi', 'multi', true);
  assert.equal(state.has('area'), false);
});

/* ----------------------------------------------------------- facetMatches */

const CARDS = [
  { area: new Set(['epi']), stage: new Set(['pilot']) },
  { area: new Set(['epi', 'ops']), stage: new Set(['live']) },
  { area: new Set(['ops']), stage: new Set(['pilot']) },
];

test('facetMatches is OR within a facet and AND across facets', () => {
  const state = stateOf({ area: ['epi', 'ops'], stage: ['pilot'] });
  assert.deepEqual(
    CARDS.map((c) => facetMatches(c, state)),
    [true, false, true]
  );
});

test('facetMatches with no filters matches everything', () => {
  assert.deepEqual(
    CARDS.map((c) => facetMatches(c, new Map())),
    [true, true, true]
  );
});

test('facetMatches ignores exceptKey, so a facet never narrows its own counts', () => {
  const state = stateOf({ area: ['epi'], stage: ['pilot'] });
  assert.deepEqual(
    CARDS.map((c) => facetMatches(c, state, 'area')),
    [true, false, true]
  );
});

test('facetMatches rejects a card missing the facet entirely', () => {
  assert.equal(facetMatches({}, stateOf({ area: ['epi'] })), false);
});

/* ------------------------------------------------------------- countValue */

test('countValue counts only the given indices', () => {
  assert.equal(countValue(CARDS, [0, 1, 2], 'area', 'epi'), 2);
  assert.equal(countValue(CARDS, [2], 'area', 'epi'), 0);
  assert.equal(countValue(CARDS, [0, 1, 2], 'area', 'nope'), 0);
  assert.equal(countValue(CARDS, [], 'area', 'epi'), 0);
});

/* ---------------------------------------------------------------- labels */

test('pluralize uses the singular only for exactly one', () => {
  assert.equal(pluralize(1, 'use case', 'use cases'), 'use case');
  assert.equal(pluralize(0, 'use case', 'use cases'), 'use cases');
  assert.equal(pluralize(12, 'use case', 'use cases'), 'use cases');
});

test('statusText pluralises and appends the active filters', () => {
  assert.equal(statusText(1, 10, 'use case', 'use cases'), '1 of 10 use case.');
  assert.equal(statusText(0, 10, 'use case', 'use cases'), '0 of 10 use cases.');
  assert.equal(
    statusText(3, 10, 'use case', 'use cases', ['Epidemiology', '“triage”']),
    '3 of 10 use cases. Filters: Epidemiology, “triage”.'
  );
});

test('countLabel gives the pill count a readable screen-reader form', () => {
  assert.equal(countLabel(0), ' (0 matches)');
  assert.equal(countLabel(1), ' (1 match)');
  assert.equal(countLabel(12), ' (12 matches)');
});

/* --------------------------------------------------------------- entering */

test('enteredKeys returns only the arrivals, never the survivors', () => {
  assert.deepEqual([...enteredKeys(new Set([0, 1, 2]), new Set([1, 2, 3]))], [3]);
  assert.deepEqual([...enteredKeys(new Set([0, 1]), new Set([0, 1]))], []);
  assert.deepEqual([...enteredKeys(new Set([0, 1, 2]), new Set([1]))], []);
});

test('enteredKeys treats a missing or empty previous set as "everything is new"', () => {
  assert.deepEqual([...enteredKeys(null, new Set([2, 0]))], [2, 0]);
  assert.deepEqual([...enteredKeys(new Set(), [5])], [5]);
  assert.deepEqual([...enteredKeys(new Set([1]), null)], []);
});

test('enteredKeys accepts any iterable and keeps the next order', () => {
  assert.deepEqual([...enteredKeys([1, 2], [3, 1, 4])], [3, 4]);
});
