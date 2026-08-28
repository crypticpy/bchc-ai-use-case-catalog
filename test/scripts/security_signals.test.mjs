/**
 * The observation sweep (scripts/security_signals.mjs). Everything here runs
 * against an injected fetch — the suite must never reach GitHub or the
 * Scorecard API, and a monthly job whose failure modes are only ever exercised
 * in production is a job nobody can trust to stay green.
 *
 * What is held: which links are looked at at all, that a failed call degrades
 * to "unavailable" instead of failing the run, that a Scorecard 404 means "no
 * public score" and not an error, that the same observations always serialise
 * to the same bytes, and that a schema with no `entry.repo_key` produces
 * nothing rather than a guess.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_BYTES,
  NOTABLE_CHECKS,
  UNAVAILABLE,
  applicableEntries,
  buildDocument,
  capDocument,
  observeRepo,
  repoTarget,
  sameSignals,
  shapeObservation,
  sortKeys,
} from '../../scripts/security_signals.mjs';
import { SAMPLE_DATA_FILES } from '../../scripts/eject_samples.mjs';

/* ------------------------------------------------------------- fake fetch */

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const notOk = (status) => ({ ok: false, status, json: async () => ({}) });

const REPO_BODY = {
  archived: false,
  pushed_at: '2026-07-14T09:31:00Z',
  owner: { type: 'Organization' },
  license: { spdx_id: 'MIT' },
};
const CARD_BODY = {
  date: '2026-08-01T00:00:00Z',
  score: 6.4,
  checks: [
    { name: 'Vulnerabilities', score: 10 },
    { name: 'Code-Review', score: 8 },
    { name: 'Fuzzing', score: 0 },
    { name: 'SAST', score: 5 },
  ],
};

/**
 * A fetch that answers from a route table and records what it was asked.
 * @param {Record<string, object|(() => object)>} routes substring -> response
 * @returns {{impl: typeof fetch, calls: string[]}}
 */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push(String(url));
    for (const [needle, response] of Object.entries(routes)) {
      if (!String(url).includes(needle)) continue;
      const answer = typeof response === 'function' ? response(init) : response;
      if (answer instanceof Error) throw answer;
      return answer;
    }
    return notOk(404);
  };
  return { impl, calls };
}

/* ------------------------------------------------------------- repoTarget */

test('only a plain https GitHub repository URL is ever sent to an API', () => {
  assert.deepEqual(repoTarget('https://github.com/example-org/thing'), {
    owner: 'example-org',
    repo: 'thing',
    slug: 'example-org/thing',
  });
  assert.deepEqual(repoTarget('https://github.com/example-org/thing.git')?.repo, 'thing');
  assert.deepEqual(
    repoTarget('https://github.com/example-org/thing/tree/main/src')?.slug,
    'example-org/thing'
  );
  assert.deepEqual(repoTarget('https://GitHub.com/Example-Org/Thing/')?.slug, 'Example-Org/Thing');

  for (const bad of [
    '',
    null,
    undefined,
    'not a url',
    'https://github.com/example-org', // an owner, not a repository
    'https://github.com/', // nothing at all
    'http://github.com/example-org/thing', // never over http
    'https://gitlab.com/example-org/thing',
    'https://github.com.evil.example/example-org/thing', // look-alike host
    'https://raw.githubusercontent.com/example-org/thing/main/x',
    'https://github.com/-bad/thing', // not a GitHub owner name
    'https://github.com/example-org/..',
  ]) {
    assert.equal(repoTarget(bad), null, `${String(bad)} must not become a request`);
  }
});

/* ------------------------------------------------------- applicableEntries */

test('entries are considered in slug order, sample content is skipped, no link is no record', () => {
  const entries = [
    { slug: 'zebra', data: { repo_url: 'https://github.com/example-org/zebra' } },
    { slug: 'apple', data: { repo_url: 'https://gitlab.com/example-org/apple' } },
    { slug: 'demo', data: { repo_url: 'https://github.com/example-org/demo', sample: true } },
    { slug: 'nolink', data: { summary: 'no repository at all' } },
    { slug: 'blank', data: { repo_url: '   ' } },
  ];
  const found = applicableEntries(entries, 'repo_url');
  assert.deepEqual(
    found.map((item) => item.slug),
    ['apple', 'zebra']
  );
  assert.equal(found[0].target, null, 'a non-GitHub link is still considered, with no target');
  assert.equal(found[1].target.slug, 'example-org/zebra');
});

test('no `entry.repo_key` means nothing is looked at — the sweep never guesses a field', () => {
  const entries = [{ slug: 'a', data: { repo_url: 'https://github.com/example-org/a' } }];
  assert.deepEqual(applicableEntries(entries, ''), []);
  assert.deepEqual(applicableEntries(entries, undefined), []);
  assert.deepEqual(applicableEntries(null, 'repo_url'), []);
});

/* -------------------------------------------------------------- observeRepo */

test('a complete answer is shaped into observations, notable checks only, sorted', async () => {
  const { impl, calls } = fakeFetch({
    'api.github.com/repos/example-org/thing/community/profile': ok({ files: { security: { url: 'x' } } }),
    'api.github.com/repos/example-org/thing': ok(REPO_BODY),
    'api.scorecard.dev': ok(CARD_BODY),
  });
  const observed = await observeRepo(repoTarget('https://github.com/example-org/thing'), { fetchImpl: impl });
  const record = shapeObservation({
    url: 'https://github.com/example-org/thing',
    target: repoTarget('https://github.com/example-org/thing'),
    fetched: '2026-09-03',
    observed,
  });

  assert.deepEqual(record, {
    applicable: true,
    archived: false,
    errors: [],
    exists: true,
    fetched: '2026-09-03',
    license: 'MIT',
    owner_type: 'Organization',
    pushed_at: '2026-07-14',
    repo: 'example-org/thing',
    scorecard: {
      checks: [
        { name: 'Code-Review', score: 8 },
        { name: 'SAST', score: 5 },
        { name: 'Vulnerabilities', score: 10 },
      ],
      date: '2026-08-01',
      score: 6.4,
    },
    security_policy: true,
    url: 'https://github.com/example-org/thing',
  });
  assert.ok(!JSON.stringify(record).includes('Fuzzing'), 'only the notable checks are carried');
  assert.equal(calls.length, 3);
  assert.ok(NOTABLE_CHECKS.includes('Code-Review'));
});

test('a token is sent as a bearer header when there is one, and never invented', async () => {
  let seen;
  const { impl } = fakeFetch({
    'api.github.com': (init) => {
      seen = init.headers;
      return ok(REPO_BODY);
    },
    'api.scorecard.dev': ok(CARD_BODY),
  });
  await observeRepo(repoTarget('https://github.com/o/r'), { fetchImpl: impl, token: 'sekrit' });
  assert.equal(seen.Authorization, 'Bearer sekrit');

  const bare = fakeFetch({
    'api.github.com': (init) => {
      seen = init.headers;
      return ok(REPO_BODY);
    },
    'api.scorecard.dev': ok(CARD_BODY),
  });
  await observeRepo(repoTarget('https://github.com/o/r'), { fetchImpl: bare.impl });
  assert.equal(seen.Authorization, undefined);
});

test('a Scorecard 404 is "no public score", not a failure', async () => {
  const { impl } = fakeFetch({
    'api.github.com/repos/o/r/community/profile': notOk(404),
    'api.github.com/repos/o/r': ok(REPO_BODY),
    'api.scorecard.dev': notOk(404),
  });
  const observed = await observeRepo(repoTarget('https://github.com/o/r'), { fetchImpl: impl });
  assert.equal(observed.scorecard, null);
  assert.equal(observed.security_policy, false, 'no policy file is a finding, not an error');
  assert.deepEqual(observed.errors, []);
});

test('a repository that 404s is a finding; its profile is not then asked for', async () => {
  const { impl, calls } = fakeFetch({
    'api.github.com/repos/o/gone': notOk(404),
    'api.scorecard.dev': notOk(404),
  });
  const observed = await observeRepo(repoTarget('https://github.com/o/gone'), { fetchImpl: impl });
  assert.equal(observed.exists, false);
  assert.equal(observed.security_policy, null);
  assert.deepEqual(observed.errors, []);
  assert.ok(
    !calls.some((url) => url.includes('community/profile')),
    'a repository that is not there has no community profile to ask about'
  );
});

test('every individual failure degrades to "unavailable" and the run survives it', async () => {
  const { impl } = fakeFetch({
    'api.github.com': notOk(403), // rate limited
    'api.scorecard.dev': new Error('socket hang up'),
  });
  const target = repoTarget('https://github.com/o/r');
  const observed = await observeRepo(target, { fetchImpl: impl });
  const record = shapeObservation({ url: 'https://github.com/o/r', target, fetched: '2026-09-03', observed });

  for (const key of [
    'archived',
    'exists',
    'license',
    'owner_type',
    'pushed_at',
    'scorecard',
    'security_policy',
  ])
    assert.equal(record[key], UNAVAILABLE, `${key} should be unavailable`);
  assert.deepEqual(record.errors, ['repository: HTTP 403', 'scorecard: socket hang up']);
  assert.equal(record.applicable, true, 'the entry is still recorded — the link is still a GitHub repo');
});

test('a non-GitHub link is recorded as not applicable, with a reason and no observations', () => {
  const record = shapeObservation({
    url: 'https://gitlab.example.gov/team/thing',
    target: null,
    fetched: '2026-09-03',
  });
  assert.equal(record.applicable, false);
  assert.equal(record.repo, null);
  assert.match(record.reason, /not a GitHub repository/);
  assert.equal(record.scorecard, undefined, 'nothing is claimed about a repository nobody looked at');
});

/* ------------------------------------------------------------ determinism */

test('the same observations always produce the same bytes', () => {
  const record = (repo) => ({
    slug: repo,
    record: shapeObservation({
      url: `https://github.com/o/${repo}`,
      target: repoTarget(`https://github.com/o/${repo}`),
      fetched: '2026-09-03',
      observed: { exists: true, archived: false, license: 'MIT', errors: ['b: x', 'a: y'] },
    }),
  });
  const first = buildDocument({ today: '2026-09-03', records: [record('zebra'), record('apple')] });
  const second = buildDocument({ today: '2026-09-03', records: [record('apple'), record('zebra')] });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(Object.keys(first.entries), ['apple', 'zebra']);
  assert.deepEqual(first.entries.apple.errors, ['a: y', 'b: x'], 'errors are sorted too');
  assert.deepEqual(Object.keys(first.entries.apple), Object.keys(first.entries.apple).slice().sort());
});

test('sortKeys is recursive and leaves arrays in their order', () => {
  assert.deepEqual(
    JSON.stringify(sortKeys({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } })),
    JSON.stringify({ a: { c: 3, d: [{ y: 2, z: 1 }] }, b: 1 })
  );
});

test('a run that observed the same things again does not rewrite the file for a date', () => {
  const doc = buildDocument({
    today: '2026-09-03',
    records: [
      {
        slug: 'a',
        record: shapeObservation({
          url: 'https://github.com/o/a',
          target: repoTarget('https://github.com/o/a'),
          fetched: '2026-09-03',
          observed: { exists: true, archived: false, license: 'MIT', errors: [] },
        }),
      },
    ],
  });
  const older = JSON.stringify({
    generated_at: '2026-08-03',
    entries: { a: { ...doc.entries.a, fetched: '2026-08-03' } },
  });
  assert.equal(sameSignals(older, doc), true, 'only the dates moved');

  const moved = JSON.parse(older);
  moved.entries.a.archived = true;
  assert.equal(sameSignals(JSON.stringify(moved), doc), false);
  assert.equal(sameSignals('not json', doc), false);
  assert.equal(sameSignals('', doc), false);
});

/* -------------------------------------------------------------------- cap */

test('over the ceiling, detail is shed before repositories are', () => {
  const many = Array.from({ length: 450 }, (_, i) => {
    const slug = `entry-${String(i).padStart(4, '0')}`;
    return {
      slug,
      record: shapeObservation({
        url: `https://github.com/o/${slug}`,
        target: repoTarget(`https://github.com/o/${slug}`),
        fetched: '2026-09-03',
        observed: {
          exists: true,
          archived: false,
          license: 'Apache-2.0',
          owner_type: 'Organization',
          pushed_at: '2026-07-14',
          security_policy: true,
          scorecard: {
            score: 6.4,
            date: '2026-08-01',
            checks: NOTABLE_CHECKS.map((name) => ({ name, score: 7 })),
          },
          errors: [],
        },
      }),
    };
  });
  const doc = buildDocument({ today: '2026-09-03', records: many });
  assert.ok(Buffer.byteLength(JSON.stringify(doc, null, 2)) > MAX_BYTES, 'the fixture has to be too big');

  const capped = capDocument(doc);
  assert.ok(Buffer.byteLength(capped.text) <= MAX_BYTES);
  assert.equal(capped.detail, false);
  assert.equal(capped.dropped.length, 0, 'no repository is dropped while detail is still available');
  assert.equal(Object.keys(capped.doc.entries).length, 450);

  const tiny = capDocument(doc, 8000);
  assert.ok(Buffer.byteLength(tiny.text) <= 8000);
  assert.ok(tiny.dropped.length > 0);
  assert.equal(tiny.doc.truncated, tiny.dropped.length, 'the file says how many it could not hold');
  assert.ok(
    Object.keys(tiny.doc.entries).every((slug) => !tiny.dropped.includes(slug)),
    'the dropped slugs are the ones that are gone'
  );
});

test('a catalog big enough to be capped still reports "unchanged" when nothing moved', () => {
  // Below the ceiling, `doc` and `capDocument(doc).doc` are identical, so
  // comparing against either one agrees. Above it they diverge — the file on
  // disk is the CAPPED shape, so `sameSignals` must be compared against that,
  // not the uncapped `doc`, or a big catalog can never report "unchanged"
  // again even when every observation this run made matches last month's.
  const many = Array.from({ length: 450 }, (_, i) => {
    const slug = `entry-${String(i).padStart(4, '0')}`;
    return {
      slug,
      record: shapeObservation({
        url: `https://github.com/o/${slug}`,
        target: repoTarget(`https://github.com/o/${slug}`),
        fetched: '2026-09-03',
        observed: {
          exists: true,
          archived: false,
          license: 'Apache-2.0',
          owner_type: 'Organization',
          pushed_at: '2026-07-14',
          security_policy: true,
          scorecard: {
            score: 6.4,
            date: '2026-08-01',
            checks: NOTABLE_CHECKS.map((name) => ({ name, score: 7 })),
          },
          errors: [],
        },
      }),
    };
  });
  const doc = buildDocument({ today: '2026-09-03', records: many });
  const { doc: cappedDoc } = capDocument(doc);
  assert.equal(
    cappedDoc.entries['entry-0000'].scorecard.checks,
    undefined,
    'the fixture must actually be capped'
  );

  // The file written a month ago, with only the dates different.
  const previousDoc = buildDocument({ today: '2026-08-03', records: many });
  const { text: previousText } = capDocument(previousDoc);

  assert.equal(
    sameSignals(previousText, cappedDoc),
    true,
    'comparing against the capped shape sees no change'
  );
  assert.equal(
    sameSignals(previousText, doc),
    false,
    'comparing against the UNCAPPED shape wrongly reports a change — this is the bug the fix avoids'
  );
});

test('sameSignals catches a truncation count changing even when every retained entry is identical', () => {
  // A catalog big enough for capDocument to shed records: a slug added or
  // removed at the trimmed end can leave every RETAINED entry byte-for-byte
  // identical while only the top-level `truncated` count moves. That must
  // still count as a change, or a shift in what got shed never reaches the
  // committed file.
  const doc = buildDocument({
    today: '2026-09-03',
    records: [
      {
        slug: 'a',
        record: shapeObservation({
          url: 'https://github.com/o/a',
          target: repoTarget('https://github.com/o/a'),
          fetched: '2026-09-03',
          observed: { exists: true, archived: false, license: 'MIT', errors: [] },
        }),
      },
    ],
  });
  doc.truncated = 3;

  const previousText = JSON.stringify({
    generated_at: '2026-08-03',
    entries: { a: { ...doc.entries.a, fetched: '2026-08-03' } },
    truncated: 2,
  });

  assert.equal(
    sameSignals(previousText, doc),
    false,
    'the retained entry is identical but the shed count changed, so this must count as a change'
  );

  const sameTruncation = JSON.stringify({
    generated_at: '2026-08-03',
    entries: { a: { ...doc.entries.a, fetched: '2026-08-03' } },
    truncated: 3,
  });
  assert.equal(
    sameSignals(sameTruncation, doc),
    true,
    'same retained entry and same shed count is genuinely unchanged'
  );
});

/* --------------------------------------------------- shipped sample data */

test('the shipped sample observations leave with the rest of the demo content', () => {
  // They describe the ten sample entries and would be untrue of a fork's own,
  // so a fork that ejects the samples and keeps this file would be publishing
  // observations about repositories none of its entries link to.
  assert.ok(
    SAMPLE_DATA_FILES.includes('_data/security_signals.json'),
    'npm run eject:samples must delete the sample security signals'
  );
});

test('a document that fits is written whole, keys and all', () => {
  const doc = buildDocument({ today: '2026-09-03', records: [] });
  const capped = capDocument(doc);
  assert.equal(capped.detail, true);
  assert.deepEqual(capped.dropped, []);
  assert.equal(capped.text, `${JSON.stringify({ entries: {}, generated_at: '2026-09-03' }, null, 2)}\n`);
});
