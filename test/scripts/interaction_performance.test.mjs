import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  catalogContract,
  interactionBudgetFindings,
  measurableTiers,
  mergeInteractionEvidence,
  mergeProbeFailure,
  percentile,
  probeTimeoutMs,
  tierInteractionBudgets,
  timingSummary,
  withDeadline,
} from '../../scripts/interaction_performance.mjs';

test('nearest-rank timing summaries are deterministic', () => {
  const samples = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.equal(percentile(samples), 19);
  assert.deepEqual(timingSummary(samples), {
    samples: 20,
    values_ms: samples,
    p50_ms: 10,
    p95_ms: 19,
    max_ms: 20,
  });
  assert.throws(() => percentile([]), /at least one sample/);
  assert.throws(() => percentile(samples, 0), /greater than 0/);
  assert.throws(() => percentile([1, Number.NaN]), /finite, non-negative/);
});

test('the browser fixture must match the supported scale and expose its configured route', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-interaction-site-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(site, 'entries.json'),
    JSON.stringify({ entry: { path: '/projects/' }, entries: [{ slug: 'one' }] })
  );
  assert.deepEqual(catalogContract(site, 1), { entryPath: 'projects', entries: 1 });
  assert.throws(() => catalogContract(site, 100), /expected supported ceiling 100/);
});

const scaleConfig = {
  supported_entries: 100,
  interaction_entries: [100, 500],
  interaction_budgets: { filter_response_p95_ms: 100, search_response_p95_ms: 250 },
  scale_budgets: {
    500: { search_json_gzip_bytes: 1, search_response_p95_ms: 400, search_cold_response_ms: 3000 },
  },
};

test('interaction budgets fail only when a measured p95 exceeds its reviewed maximum', () => {
  const config = {
    supported_entries: 100,
    interaction_budgets: { filter_response_p95_ms: 100, search_response_p95_ms: 250 },
  };
  const interaction = { filter: { p95_ms: 100 }, search: { warm: { p95_ms: 251 } } };
  assert.deepEqual(interactionBudgetFindings(interaction, config, 100), [
    { name: 'search_response_p95_ms', actual: 251, maximum: 250 },
  ]);
  assert.throws(
    () => interactionBudgetFindings({ filter: {}, search: { warm: { p95_ms: 1 } } }, config, 100),
    /did not measure filter_response_p95_ms/
  );
  assert.throws(
    () => interactionBudgetFindings(interaction, { supported_entries: 100, interaction_budgets: {} }, 100),
    /budget is missing or invalid: filter_response_p95_ms/
  );
});

test('a tier above the supported ceiling enforces exactly what its scale budget names', () => {
  assert.deepEqual(tierInteractionBudgets(scaleConfig, 500), {
    search_response_p95_ms: 400,
    search_cold_response_ms: 3000,
  });
  // A payload budget is not an interaction budget, and an unbudgeted tier is
  // measured and reported rather than failed.
  assert.deepEqual(tierInteractionBudgets(scaleConfig, 1000), {});

  const interaction = {
    filter: { p95_ms: 900 },
    search: { warm: { p95_ms: 401 }, cold_initialization_ms: 10 },
  };
  assert.deepEqual(interactionBudgetFindings(interaction, scaleConfig, 500), [
    { name: 'search_response_p95_ms', actual: 401, maximum: 400 },
  ]);
  assert.deepEqual(interactionBudgetFindings(interaction, scaleConfig, 1000), []);
});

test('only the retained fixtures are measurable, and the rest are named', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-interaction-tiers-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, '100'));
  fs.writeFileSync(path.join(site, '100', 'entries.json'), '{}');

  assert.deepEqual(measurableTiers(site, scaleConfig), { measurable: [100], missing: [500] });
  assert.deepEqual(measurableTiers(site, { supported_entries: 100 }), { measurable: [100], missing: [] });
});

// A run built only from the larger tiers has measured nothing the release gate
// is written against, and must not be able to report green off them.
test('a missing supported ceiling is an error, not a skipped tier', (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-interaction-ceiling-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  fs.mkdirSync(path.join(site, '500'));
  fs.writeFileSync(path.join(site, '500', 'entries.json'), '{}');

  assert.throws(() => measurableTiers(site, scaleConfig), /supported ceiling of 100 entries/);
});

// Puppeteer's 15s default was measured on a laptop; a thousand entries under a
// 4x throttle on a CI runner needs longer just to reach the load event.
test('the probe deadline grows with the fixture it is driving', () => {
  assert.equal(probeTimeoutMs(100), 45000);
  assert.equal(probeTimeoutMs(500), 45000);
  assert.equal(probeTimeoutMs(1000), 90000);
  assert.equal(probeTimeoutMs(0), 45000);
});

// A deadline under the budget it is meant to enforce turns a slow answer into
// no answer: the tier reports a stuck probe instead of a number to act on.
test('every tier can measure the budget it is held to', () => {
  const config = JSON.parse(
    fs.readFileSync(new URL('../../quality/performance-budgets.json', import.meta.url))
  );
  for (const entries of config.interaction_entries) {
    for (const [name, maximum] of Object.entries(tierInteractionBudgets(config, entries))) {
      assert.ok(
        probeTimeoutMs(entries) >= maximum * 3,
        `${entries}-entry deadline ${probeTimeoutMs(entries)}ms cannot measure ${name} of ${maximum}ms`
      );
    }
  }
});

test('a step that never finishes fails at its own deadline, under its own name', async () => {
  assert.equal(await withDeadline(Promise.resolve(7), 1000, 'a step'), 7);
  await assert.rejects(
    withDeadline(Promise.reject(new Error('page said no')), 1000, 'a step'),
    /page said no/
  );
  await assert.rejects(
    withDeadline(new Promise(() => {}), 5, 'cold search'),
    /cold search did not finish within 5ms/
  );

  // Losing the race must not leave an unhandled rejection behind it.
  let refuse;
  const stuck = new Promise((resolve, reject) => {
    refuse = reject;
  });
  await assert.rejects(withDeadline(stuck, 5, 'sort 1'), /did not finish/);
  refuse(new Error('too late'));
  await new Promise((resolve) => setTimeout(resolve, 10));
});

test('a tier whose probe never finished is a finding, not a lost run', () => {
  const report = {
    supported_entries: 100,
    runs: [
      {
        entries: 1000,
        findings: [
          { name: 'build_ms', actual: 1, maximum: 0 },
          { name: 'search_response_p95_ms', actual: 9, maximum: 8 },
        ],
      },
    ],
  };
  const finding = mergeProbeFailure(report, 1000, new Error('Navigation timeout of 60000 ms exceeded'));

  assert.deepEqual(finding, {
    name: 'interaction_probe',
    actual: 'Navigation timeout of 60000 ms exceeded',
    maximum: 'a completed probe',
  });
  assert.deepEqual(report.runs[0].interaction, {
    status: 'error',
    error: 'Navigation timeout of 60000 ms exceeded',
  });
  // The payload finding survives; the stale browser one is replaced.
  assert.deepEqual(report.runs[0].findings, [{ name: 'build_ms', actual: 1, maximum: 0 }, finding]);
  assert.throws(() => mergeProbeFailure(report, 500, new Error('nope')), /has no 500-entry run/);
});

test('a later measurement clears the failure that came before it', () => {
  const report = { supported_entries: 100, runs: [{ entries: 100, findings: [] }] };
  mergeProbeFailure(report, 100, new Error('browser would not launch'));
  mergeInteractionEvidence(
    report,
    { filter: { p95_ms: 10 }, search: { warm: { p95_ms: 20 }, cold_initialization_ms: 30 } },
    scaleConfig,
    100
  );

  assert.deepEqual(report.runs[0].findings, []);
});

test('interaction evidence replaces prior browser findings on the run it measured', () => {
  const report = {
    supported_entries: 100,
    runs: [
      {
        entries: 100,
        findings: [
          { name: 'build_ms', actual: 1, maximum: 0 },
          { name: 'filter_response_p95_ms', actual: 200, maximum: 100 },
        ],
      },
      { entries: 500, findings: [{ name: 'search_cold_response_ms', actual: 9, maximum: 1 }] },
    ],
  };
  const interaction = {
    filter: { p95_ms: 20 },
    search: { warm: { p95_ms: 120 }, cold_initialization_ms: 30 },
  };
  assert.deepEqual(mergeInteractionEvidence(report, interaction, scaleConfig), []);
  assert.deepEqual(report.runs[0].findings, [{ name: 'build_ms', actual: 1, maximum: 0 }]);
  assert.equal(report.runs[0].interaction, interaction);

  assert.deepEqual(mergeInteractionEvidence(report, interaction, scaleConfig, 500), []);
  assert.deepEqual(report.runs[1].findings, []);
  assert.throws(() => mergeInteractionEvidence(report, interaction, scaleConfig, 1000), /no 1000-entry run/);
});
