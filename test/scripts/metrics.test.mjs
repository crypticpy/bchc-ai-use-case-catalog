/**
 * The catalog metrics (scripts/metrics.mjs) are published on the governance
 * page, so they had better mean what the labels say: a submission is an
 * entry-form issue and nothing else, a publication is a merged entry pull
 * request, turnaround only counts pairs the PR body actually links, sample
 * content never counts as a contributor, and the window is the last N
 * calendar quarters — with the API's pagination followed to the end.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMetrics,
  fetchGitHub,
  percentile,
  quarterOf,
  quarterStart,
  recentQuarters,
  sameFigures,
} from '../../scripts/metrics.mjs';

const ISSUES = [
  { number: 1, created_at: '2025-11-03T10:00:00Z', labels: [{ name: 'content:new-entry' }] },
  { number: 2, created_at: '2026-02-10T10:00:00Z', labels: [{ name: 'content:new-entry' }] },
  { number: 3, created_at: '2026-02-20T10:00:00Z', labels: ['content:new-entry', 'review:intake'] },
  { number: 4, created_at: '2026-08-01T10:00:00Z', labels: [{ name: 'content:new-entry' }] },
  { number: 5, created_at: '2026-08-02T10:00:00Z', labels: [{ name: 'bug' }] },
  {
    number: 6,
    created_at: '2026-08-03T10:00:00Z',
    labels: [{ name: 'content:new-entry' }],
    pull_request: {},
  },
  { number: 7, created_at: '2024-01-03T10:00:00Z', labels: [{ name: 'content:new-entry' }] },
];
const PULLS = [
  {
    number: 10,
    merged_at: '2025-11-10T10:00:00Z',
    head: { ref: 'entry/first-1' },
    body: 'Closes #1\n\nBody',
  },
  { number: 11, merged_at: '2026-02-24T10:00:00Z', head: { ref: 'entry/second-2' }, body: 'Closes #2' },
  { number: 12, merged_at: '2026-03-31T10:00:00Z', head: { ref: 'entry/third-3' }, body: 'Fixes #3' },
  { number: 13, merged_at: null, head: { ref: 'entry/fourth-4' }, body: 'Closes #4' },
  { number: 14, merged_at: '2026-08-05T10:00:00Z', head: { ref: 'dependabot/npm/x' }, body: 'Closes #5' },
  { number: 15, merged_at: '2026-08-06T10:00:00Z', head: { ref: 'entry/hand-made' }, body: 'no issue link' },
];
const ENTRIES = [
  { data: { published: '2025-11-10', organization: 'Austin Public Health' } },
  { data: { published: '2026-02-24', organization: 'Austin Public Health' } },
  { data: { published: '2026-03-31', organization: 'Chicago DPH' } },
  { data: { published: '2026-08-06', organization: 'Denver DPHE ' } },
  { data: { published: '2026-08-07', organization: 'Sample City', sample: true } },
  { data: { published: '2026-08-08', organization: '' } },
];

test('quarters: membership, the last N in order, and each one’s first day', () => {
  assert.equal(quarterOf('2026-08-18'), '2026-Q3');
  assert.equal(quarterOf('2026-08-18T23:59:59Z'), '2026-Q3');
  assert.equal(quarterOf(new Date('2026-01-01T00:00:00Z')), '2026-Q1');
  assert.equal(quarterOf('12/31/2026'), null);
  assert.equal(quarterOf(undefined), null);
  assert.deepEqual(recentQuarters(Date.UTC(2026, 7, 18), 4), ['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3']);
  assert.deepEqual(recentQuarters(Date.UTC(2026, 0, 2), 2), ['2025-Q4', '2026-Q1']);
  assert.equal(quarterStart('2025-Q4'), '2025-10-01');
  assert.equal(quarterStart('2026-Q1'), '2026-01-01');
});

test('percentile is nearest-rank and null on nothing', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([7], 90), 7);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([10, 1, 5], 90), 10);
});

test('computeMetrics counts what the labels say, over the window, oldest quarter first', () => {
  const m = computeMetrics({
    issues: ISSUES,
    pulls: PULLS,
    entries: ENTRIES,
    today: '2026-08-18',
    contributorKey: 'organization',
  });
  assert.equal(m.generated, '2026-08-18');
  assert.deepEqual(m.window, { from: '2025-10-01', to: '2026-08-18', quarters: 4 });
  assert.deepEqual(
    m.quarters.map((q) => [q.quarter, q.submissions, q.published, q.organizations]),
    [
      ['2025-Q4', 1, 1, 1],
      ['2026-Q1', 2, 2, 2],
      ['2026-Q2', 0, 0, 0],
      ['2026-Q3', 1, 1, 1],
    ]
  );
  assert.equal(m.quarters[0].from, '2025-10-01');
  // #5 has the wrong label, #6 is a pull request, #7 is outside the window.
  assert.equal(m.totals.submissions, 4);
  // #13 never merged, #14 is not an entry branch; #15 counts though unlinked.
  assert.equal(m.totals.published, 4);
  // Distinct, trimmed, blank skipped, sample content ignored — across all entries.
  assert.equal(m.totals.organizations, 3);
  assert.equal(m.totals.entries, 5, 'live entries, sample excluded');
  // Turnaround: #1→#10 = 7 d, #2→#11 = 14 d, #3→#12 = 39 d; #15 has no link.
  assert.deepEqual(m.totals.turnaround_days, { count: 3, median: 14, p90: 39 });
});

test('computeMetrics without a contributor key publishes no organization figure, and copes with junk', () => {
  const m = computeMetrics({ issues: ISSUES, pulls: PULLS, entries: ENTRIES, today: '2026-08-18' });
  assert.equal(m.totals.organizations, null);
  assert.ok(m.quarters.every((q) => q.organizations === null));

  const empty = computeMetrics({
    issues: undefined,
    pulls: null,
    entries: [],
    today: '2026-08-18',
    quarters: 1,
  });
  assert.deepEqual(
    empty.quarters.map((q) => q.quarter),
    ['2026-Q3']
  );
  assert.deepEqual(empty.totals.turnaround_days, { count: 0, median: null, p90: null });
  assert.throws(() => computeMetrics({ issues: [], pulls: [], entries: [], today: 'soon' }), /YYYY-MM-DD/);
});

test('sameFigures ignores the generated date and the window’s end, nothing else', () => {
  const base = computeMetrics({ issues: ISSUES, pulls: PULLS, entries: ENTRIES, today: '2026-08-18' });
  const later = computeMetrics({ issues: ISSUES, pulls: PULLS, entries: ENTRIES, today: '2026-09-01' });
  assert.equal(sameFigures(JSON.stringify(base), later), true);
  const more = computeMetrics({
    issues: [...ISSUES, { number: 8, created_at: '2026-08-20T00:00:00Z', labels: ['content:new-entry'] }],
    pulls: PULLS,
    entries: ENTRIES,
    today: '2026-09-01',
  });
  assert.equal(sameFigures(JSON.stringify(base), more), false);
  const shifted = computeMetrics({ issues: ISSUES, pulls: PULLS, entries: ENTRIES, today: '2026-10-01' });
  assert.equal(sameFigures(JSON.stringify(base), shifted), false, 'a new quarter opens the window');
  assert.equal(sameFigures('not json', base), false);
});

test('fetchGitHub follows Link: rel="next" to the end and sends the token only when given', async () => {
  const calls = [];
  const fetchImpl = async (url, { headers }) => {
    calls.push({ url, auth: headers.Authorization ?? null });
    const page = url.includes('page=2') ? 2 : 1;
    return {
      ok: true,
      headers: {
        get: (name) =>
          name === 'link' && page === 1
            ? '<https://api.github.com/x?per_page=100&page=2>; rel="next", <https://api.github.com/x?page=2>; rel="last"'
            : null,
      },
      json: async () => (page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }]),
    };
  };
  const items = await fetchGitHub('https://api.github.com/x?per_page=100', { token: 't0k', fetchImpl });
  assert.deepEqual(
    items.map((i) => i.id),
    [1, 2, 3]
  );
  assert.deepEqual(
    calls.map((c) => c.auth),
    ['Bearer t0k', 'Bearer t0k']
  );
  await fetchGitHub('https://api.github.com/y', { fetchImpl });
  assert.equal(calls.at(-1).auth, null, 'no token, no Authorization header');

  // stopAt: the page whose last item is out of range is the last page fetched.
  calls.length = 0;
  const stopped = await fetchGitHub('https://api.github.com/x?per_page=100', {
    fetchImpl,
    stopAt: (item) => item.id >= 2,
  });
  assert.deepEqual(
    stopped.map((i) => i.id),
    [1, 2],
    'the stopping page is kept whole; later pages are not fetched'
  );
  assert.equal(calls.length, 1);

  await assert.rejects(
    fetchGitHub('https://api.github.com/z', {
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        json: async () => ({}),
      }),
    }),
    /GitHub API 403/
  );
});
