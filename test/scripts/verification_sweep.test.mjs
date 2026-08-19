/**
 * The pure half of the monthly verification sweep (scripts/verification_sweep.mjs):
 * date coercion, which entries count as unconfirmed, and the issue body. The
 * GitHub side lives in .github/workflows/verification-sweep.yml and only ever
 * sees the strings these functions produce.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  issueBody,
  lastConfirmed,
  monthName,
  parseFrontMatter,
  staleEntries,
  toDay,
} from '../../scripts/verification_sweep.mjs';

const day = (iso) => toDay(iso);

/** @param {object} over @returns {object} an entry as collectEntries would build it */
const entry = (over = {}) => ({
  slug: 'thing',
  file: 'catalog/thing/index.md',
  title: 'A thing',
  url: '/catalog/thing/',
  contact: 'a@example.gov',
  data: { published: '2020-01-01' },
  ...over,
});

/* ------------------------------------------------------------------ toDay */

test('toDay parses ISO dates and rejects everything else', () => {
  assert.equal(toDay('2026-03-04'), Date.UTC(2026, 2, 4));
  assert.equal(toDay(new Date(Date.UTC(2026, 2, 4, 22))), Date.UTC(2026, 2, 4));
  for (const bad of ['', null, undefined, 'soon', '2026-3-4', '04/03/2026', 42]) {
    assert.equal(toDay(bad), null, `${String(bad)} should not parse`);
  }
});

test('toDay rejects a date that does not exist', () => {
  assert.equal(toDay('2026-02-31'), null);
  assert.equal(toDay('2026-13-01'), null);
});

/* ---------------------------------------------------------- lastConfirmed */

test('lastConfirmed takes the newest of the three keys, not the strongest', () => {
  const best = lastConfirmed({ published: '2024-01-01', updated: '2026-05-05', verified: '2025-02-02' });
  assert.deepEqual(best, { key: 'updated', day: day('2026-05-05') });
});

test('lastConfirmed prefers verified when it is the newest', () => {
  const best = lastConfirmed({ published: '2024-01-01', updated: '2025-01-01', verified: '2026-01-01' });
  assert.equal(best.key, 'verified');
});

test('lastConfirmed ignores a malformed date rather than throwing', () => {
  const best = lastConfirmed({ published: '2024-01-01', verified: 'last spring' });
  assert.equal(best.key, 'published');
});

test('lastConfirmed is null when the entry has no usable date at all', () => {
  assert.equal(lastConfirmed({ title: 'x' }), null);
});

/* ---------------------------------------------------------- staleEntries */

test('staleEntries returns only entries past the window, oldest first', () => {
  const entries = [
    entry({ slug: 'fresh', data: { published: '2026-06-01' } }),
    entry({ slug: 'ancient', data: { published: '2022-01-01' } }),
    entry({ slug: 'just-over', data: { published: '2025-08-16' } }),
  ];
  const stale = staleEntries(entries, day('2026-08-17'), 365);
  assert.deepEqual(
    stale.map((e) => e.slug),
    ['ancient', 'just-over']
  );
  assert.equal(stale[1].days, 366);
  assert.equal(stale[1].since, '2025-08-16');
  assert.equal(stale[1].key, 'published');
});

test('staleEntries treats exactly the window as still fresh', () => {
  const entries = [entry({ data: { published: '2025-08-17' } })];
  assert.deepEqual(staleEntries(entries, day('2026-08-17'), 365), []);
});

test('a recent verified date rescues an old entry', () => {
  const entries = [entry({ data: { published: '2019-01-01', verified: '2026-07-01' } })];
  assert.deepEqual(staleEntries(entries, day('2026-08-17'), 365), []);
});

test('staleEntries skips entries with no date instead of counting them stale', () => {
  const entries = [entry({ slug: 'undated', data: {} })];
  assert.deepEqual(staleEntries(entries, day('2026-08-17'), 365), []);
});

test('staleEntries honours a custom window', () => {
  const entries = [entry({ data: { published: '2026-01-01' } })];
  assert.equal(staleEntries(entries, day('2026-08-17'), 30).length, 1);
  assert.equal(staleEntries(entries, day('2026-08-17'), 3650).length, 0);
});

test('staleEntries falls back to a year for a nonsense window', () => {
  const entries = [entry({ data: { published: '2024-01-01' } })];
  for (const bad of [0, -5, NaN, undefined]) {
    assert.equal(staleEntries(entries, day('2026-08-17'), bad).length, 1);
  }
});

/* -------------------------------------------------------------- issueBody */

test('issueBody lists every stale entry with its contact and an edit link', () => {
  const stale = staleEntries([entry({ data: { published: '2024-01-01' } })], day('2026-08-17'), 365);
  const body = issueBody({
    stale,
    repo: 'org/catalog',
    branch: 'main',
    siteUrl: 'https://example.org/catalog',
    afterDays: 365,
    today: '2026-08-17',
  });
  assert.match(body, /\[A thing\]\(https:\/\/example\.org\/catalog\/catalog\/thing\/\)/);
  assert.match(body, /last confirmed January 2024/);
  assert.match(body, /a@example\.gov/);
  assert.match(body, /https:\/\/github\.com\/org\/catalog\/edit\/main\/catalog\/thing\/index\.md/);
  assert.match(body, /`verified: 2026-08-17`/);
  assert.match(body, /^- \[ \] /m);
});

test('issueBody degrades to plain text when the site or repo is unknown', () => {
  const stale = staleEntries(
    [entry({ contact: '', data: { published: '2024-01-01' } })],
    day('2026-08-17'),
    365
  );
  const body = issueBody({
    stale,
    repo: '',
    branch: 'main',
    siteUrl: '',
    afterDays: 365,
    today: '2026-08-17',
  });
  assert.match(body, /\*\*A thing\*\*/);
  assert.match(body, /no contact on file/);
  assert.doesNotMatch(body, /github\.com/);
});

test('issueBody counts in the singular and the plural', () => {
  const one = staleEntries([entry({ data: { published: '2024-01-01' } })], day('2026-08-17'), 365);
  const two = staleEntries(
    [
      entry({ data: { published: '2024-01-01' } }),
      entry({ slug: 'other', data: { published: '2023-01-01' } }),
    ],
    day('2026-08-17'),
    365
  );
  const render = (stale) =>
    issueBody({ stale, repo: '', branch: 'main', siteUrl: '', afterDays: 365, today: '2026-08-17' });
  assert.match(render(one), /^One entry has gone more than 365 days/);
  assert.match(render(two), /^2 entries have gone more than 365 days/);
});

/* ------------------------------------------------------- parseFrontMatter */

test('parseFrontMatter reads the fenced block and nothing else', () => {
  const data = parseFrontMatter('---\ntitle: X\nverified: 2026-01-02\n---\n\nBody text with --- in it.\n');
  assert.equal(data.title, 'X');
  assert.equal(toDay(data.verified), day('2026-01-02'));
});

test('parseFrontMatter returns an empty object for a document with none or a broken one', () => {
  assert.deepEqual(parseFrontMatter('Just a body.\n'), {});
  assert.deepEqual(parseFrontMatter('---\ntitle: [unclosed\n---\n'), {});
});

/* -------------------------------------------------------------- monthName */

test('monthName formats in UTC and passes through what it cannot parse', () => {
  assert.equal(monthName('2026-01-31'), 'January 2026');
  assert.equal(monthName('whenever'), 'whenever');
});
