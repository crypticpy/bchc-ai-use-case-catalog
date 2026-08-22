import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  catalogContract,
  interactionBudgetFindings,
  mergeInteractionEvidence,
  percentile,
  timingSummary,
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

test('interaction budgets fail only when a measured p95 exceeds its reviewed maximum', () => {
  const config = {
    interaction_budgets: { filter_response_p95_ms: 100, search_response_p95_ms: 250 },
  };
  const interaction = { filter: { p95_ms: 100 }, search: { warm: { p95_ms: 251 } } };
  assert.deepEqual(interactionBudgetFindings(interaction, config), [
    { name: 'search_response_p95_ms', actual: 251, maximum: 250 },
  ]);
  assert.throws(
    () => interactionBudgetFindings({ filter: {}, search: { warm: { p95_ms: 1 } } }, config),
    /did not measure filter_response_p95_ms/
  );
  assert.throws(
    () => interactionBudgetFindings(interaction, { interaction_budgets: {} }),
    /budget is missing or invalid: filter_response_p95_ms/
  );
});

test('interaction evidence replaces prior browser findings on the supported run', () => {
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
    ],
  };
  const interaction = { filter: { p95_ms: 20 }, search: { warm: { p95_ms: 120 } } };
  assert.deepEqual(
    mergeInteractionEvidence(report, interaction, {
      interaction_budgets: { filter_response_p95_ms: 100, search_response_p95_ms: 250 },
    }),
    []
  );
  assert.deepEqual(report.runs[0].findings, [{ name: 'build_ms', actual: 1, maximum: 0 }]);
  assert.equal(report.runs[0].interaction, interaction);
});
