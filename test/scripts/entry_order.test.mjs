/**
 * Catalog grid ordering (assets/js/lib/entry-order.js): the five sort modes and
 * the staleness demotion that rides on two of them. Cards are stubbed rather
 * than built with jsdom — `comparatorFor` only ever reads `dataset`,
 * `getAttribute` and `hasAttribute`, so a plain object is a faithful stand-in
 * and the test stays honest about how narrow that contract is.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { comparatorFor } from '../../assets/js/lib/entry-order.js';

/**
 * @param {object} data camelCased data attributes, e.g. {entryId, entryDate, entryStale}
 * @returns {object} a card-shaped stub
 */
const card = (data) => ({
  dataset: data,
  hasAttribute: (name) =>
    (name === 'data-entry-stale' && data.entryStale !== undefined) ||
    (name === 'data-entry-deprecated' && data.entryDeprecated !== undefined),
  getAttribute: (name) => {
    const key = name.replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return key in data ? data[key] : null;
  },
});

/** @param {object[]} cards @param {string} sort @param {string[]} [rel] @returns {string[]} ids in order */
const order = (cards, sort, rel = []) =>
  cards
    .map((_, i) => i)
    .sort(comparatorFor(sort, cards, rel))
    .map((i) => cards[i].dataset.entryId);

/* ---------------------------------------------------------------- newest */

test('newest sorts by published date, most recent first', () => {
  const cards = [
    card({ entryId: 'old', entryDate: '2024-01-01' }),
    card({ entryId: 'new', entryDate: '2026-05-05' }),
    card({ entryId: 'mid', entryDate: '2025-06-06' }),
  ];
  assert.deepEqual(order(cards, 'newest'), ['new', 'mid', 'old']);
});

test('newest demotes stale entries below every fresh one', () => {
  const cards = [
    card({ entryId: 'stale-recent', entryDate: '2025-08-01', entryStale: '380' }),
    card({ entryId: 'fresh-older', entryDate: '2025-09-01' }),
    card({ entryId: 'fresh-newest', entryDate: '2026-02-02' }),
  ];
  assert.deepEqual(order(cards, 'newest'), ['fresh-newest', 'fresh-older', 'stale-recent']);
});

test('newest still dates stale entries against each other', () => {
  const cards = [
    card({ entryId: 'stale-a', entryDate: '2023-01-01', entryStale: '900' }),
    card({ entryId: 'stale-b', entryDate: '2024-01-01', entryStale: '500' }),
  ];
  assert.deepEqual(order(cards, 'newest'), ['stale-b', 'stale-a']);
});

/* ------------------------------------------------------------- relevance */

test('relevance keeps the search order and sinks unranked entries', () => {
  const cards = [card({ entryId: 'c' }), card({ entryId: 'a' }), card({ entryId: 'b' })];
  assert.deepEqual(order(cards, 'relevance', ['a', 'b']), ['a', 'b', 'c']);
});

test('relevance never lets staleness outrank a search hit', () => {
  const cards = [card({ entryId: 'fresh-miss' }), card({ entryId: 'stale-hit', entryStale: '400' })];
  assert.deepEqual(order(cards, 'relevance', ['stale-hit']), ['stale-hit', 'fresh-miss']);
});

test('relevance breaks ties among unranked entries by staleness', () => {
  const cards = [card({ entryId: 'stale', entryStale: '400' }), card({ entryId: 'fresh' })];
  assert.deepEqual(order(cards, 'relevance', []), ['fresh', 'stale']);
});

/* ------------------------------------------- the modes that must not move */

test('az, updated and field sorts ignore staleness', () => {
  const cards = [
    card({ entryId: 'b', entryTitle: 'Beta', entryUpdated: '2026-01-01', sortStage: 'Pilot' }),
    card({
      entryId: 'a',
      entryTitle: 'Alpha',
      entryUpdated: '2026-02-02',
      sortStage: 'Live',
      entryStale: '400',
    }),
  ];
  assert.deepEqual(order(cards, 'az'), ['a', 'b']);
  assert.deepEqual(order(cards, 'updated'), ['a', 'b']);
  assert.deepEqual(order(cards, 'field:stage'), ['a', 'b']);
});

test('updated falls back to the published date when there is no updated date', () => {
  const cards = [
    card({ entryId: 'only-published', entryDate: '2026-03-03' }),
    card({ entryId: 'updated', entryDate: '2020-01-01', entryUpdated: '2026-04-04' }),
  ];
  assert.deepEqual(order(cards, 'updated'), ['updated', 'only-published']);
});

test('missing attributes never throw', () => {
  const cards = [card({ entryId: 'x' }), card({ entryId: 'y' })];
  for (const sort of ['newest', 'az', 'updated', 'relevance', 'field:missing']) {
    assert.doesNotThrow(() => order(cards, sort));
  }
});

/* ------------------------------------------------------------ deprecated */

test('newest sorts deprecated entries after stale ones, whatever their dates', () => {
  const cards = [
    card({ entryId: 'dep-new', entryDate: '2026-08-01', entryDeprecated: '' }),
    card({ entryId: 'stale', entryDate: '2024-01-01', entryStale: '900' }),
    card({ entryId: 'fresh', entryDate: '2025-06-06' }),
    card({ entryId: 'dep-old', entryDate: '2023-01-01', entryDeprecated: '' }),
  ];
  assert.deepEqual(order(cards, 'newest'), ['fresh', 'stale', 'dep-new', 'dep-old']);
});

test('relevance keeps a deprecated match above an unranked fresh entry', () => {
  const cards = [
    card({ entryId: 'fresh-unranked', entryDate: '2026-01-01' }),
    card({ entryId: 'dep-ranked', entryDate: '2026-02-02', entryDeprecated: '' }),
  ];
  assert.deepEqual(order(cards, 'relevance', ['dep-ranked']), ['dep-ranked', 'fresh-unranked']);
});

test('a–z ignores deprecation, like it ignores staleness', () => {
  const cards = [
    card({ entryId: 'b', entryTitle: 'Bravo' }),
    card({ entryId: 'a', entryTitle: 'Alpha', entryDeprecated: '' }),
  ];
  assert.deepEqual(order(cards, 'az'), ['a', 'b']);
});
