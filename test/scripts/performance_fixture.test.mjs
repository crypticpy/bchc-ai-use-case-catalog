import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import {
  assetTransferBytes,
  budgetFindings,
  configuredEntryPath,
  javascriptBytes,
  normalizedBaseurl,
  pageMetrics,
  parseArgs,
  scaleBudgetFindings,
} from '../../scripts/performance_fixture.mjs';

const config = { supported_entries: 100, budgets: { build_ms: 1000, css_gzip_bytes: 100 } };
const metrics = {
  entries: 100,
  build_ms: 900,
  artifact: { bytes: 1, files: 1 },
  catalog: { gzip_bytes: 1, dom_nodes: 1 },
  css_gzip_bytes: 90,
  javascript_gzip_bytes: 1,
  search_json_gzip_bytes: 1,
  entries_json_gzip_bytes: 1,
};

test('budgets report the measured value and maximum', () => {
  assert.deepEqual(budgetFindings({ ...metrics, build_ms: 1001 }, config), [
    { name: 'build_ms', actual: 1001, maximum: 1000 },
  ]);
});

test('font and image transfer totals use compressed SVG and raw pre-compressed assets', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  fs.writeFileSync(path.join(root, 'pixel.png'), Buffer.from([1, 2, 3]));
  fs.writeFileSync(path.join(root, 'nested', 'ignored.txt'), 'ignored');
  fs.writeFileSync(path.join(root, 'nested', 'icon.svg'), '<svg><path d="M0 0h1v1z"/></svg>');

  assert.equal(assetTransferBytes(root, ['.png']), 3);
  assert.ok(assetTransferBytes(root, ['.svg']) > 0);
  assert.equal(assetTransferBytes(root, ['.woff2']), 0);
});

test('a probe above supported scale records evidence without failing release budgets', () => {
  assert.deepEqual(budgetFindings({ ...metrics, entries: 500, build_ms: 999999 }, config), []);
});

test('a scale-specific search payload cap is enforced at its configured fixture size', () => {
  const scaleConfig = { scale_budgets: { 500: { search_json_gzip_bytes: 100 } } };
  assert.deepEqual(
    scaleBudgetFindings({ ...metrics, entries: 100, search_json_gzip_bytes: 101 }, scaleConfig),
    []
  );
  assert.deepEqual(
    scaleBudgetFindings({ ...metrics, entries: 500, search_json_gzip_bytes: 101 }, scaleConfig),
    [{ name: 'search_json_gzip_bytes', actual: 101, maximum: 100 }]
  );
});

test('the performance probe derives a customized entry path from the fixture schema', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-path-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '_data'));
  fs.writeFileSync(path.join(root, '_data', 'schema.yml'), 'entry:\n  path: /projects/\n');
  assert.equal(configuredEntryPath(root), 'projects');
});

test('missing catalog output cannot silently produce zero-valued metrics', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-site-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  assert.throws(
    () => pageMetrics(siteDir, path.join('projects', 'index.html')),
    /required performance page was not built: projects\/index\.html/
  );
});

test('catalog JavaScript resolves below a downstream Pages base URL and fails when absent', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-js-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(siteDir, 'catalog'));
  fs.mkdirSync(path.join(siteDir, 'assets'));
  const catalog = path.join(siteDir, 'catalog', 'index.html');
  fs.writeFileSync(
    catalog,
    '<script src="/bchc/assets/catalog.js"></script><script src="https://plausible.io/js/script.js"></script>'
  );
  fs.writeFileSync(path.join(siteDir, 'assets', 'catalog.js'), 'console.log("catalog");');

  assert.ok(javascriptBytes(siteDir, catalog, '/bchc') > 0);
  fs.rmSync(path.join(siteDir, 'assets', 'catalog.js'));
  assert.throws(() => javascriptBytes(siteDir, catalog, '/bchc'), /missing local script/);
});

test('catalog JavaScript includes transitive module imports exactly once', (t) => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-modules-'));
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(siteDir, 'catalog'));
  fs.mkdirSync(path.join(siteDir, 'assets', 'lib'), { recursive: true });
  const catalog = path.join(siteDir, 'catalog', 'index.html');
  const main = "import { value } from './lib/value.js';\nconsole.log(value);\n";
  const dependency = 'export const value = 1;\n';
  fs.writeFileSync(catalog, '<script type="module" src="/assets/main.js"></script>');
  fs.writeFileSync(path.join(siteDir, 'assets', 'main.js'), main);
  fs.writeFileSync(path.join(siteDir, 'assets', 'lib', 'value.js'), dependency);

  const expected =
    zlib.gzipSync(Buffer.from(main), { level: 9 }).byteLength +
    zlib.gzipSync(Buffer.from(dependency), { level: 9 }).byteLength;
  assert.equal(javascriptBytes(siteDir, catalog), expected);
  fs.rmSync(path.join(siteDir, 'assets', 'lib', 'value.js'));
  assert.throws(() => javascriptBytes(siteDir, catalog), /missing local script/);
});

test('the performance probe accepts a retained browser fixture destination', () => {
  assert.deepEqual(
    parseArgs(['--counts', '100,100', '--output', 'report.json', '--site-output', '/tmp/site']),
    {
      counts: [100],
      output: 'report.json',
      siteOutput: '/tmp/site',
      baseurl: '/phct-performance',
    }
  );
  assert.equal(normalizedBaseurl(' /project/demo '), '/project/demo');
  assert.equal(normalizedBaseurl(''), '');
  assert.throws(() => normalizedBaseurl('/project/../private'), /safe site-absolute path/);
});
