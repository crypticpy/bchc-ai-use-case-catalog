#!/usr/bin/env node
/** Build deterministic catalog sizes and enforce the checked-in payload budgets. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

import { copyTree, readYaml, removeEntries, run } from './lib/build-tree.mjs';
import { seedFixtureEntries } from './seed_fixture_entries.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_COUNTS = [0, 1, 10, 100, 500, 1000];

export function normalizedBaseurl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (!/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(value) || value.split('/').includes('..')) {
    throw new Error('--baseurl must be empty or a safe site-absolute path such as /phct-performance');
  }
  return value;
}

export function parseArgs(argv) {
  const value = (name, fallback) => {
    const at = argv.indexOf(name);
    return at === -1 ? fallback : argv[at + 1];
  };
  const counts = String(value('--counts', ALLOWED_COUNTS.join(',')))
    .split(',')
    .map(Number);
  if (counts.some((count) => !ALLOWED_COUNTS.includes(count))) {
    throw new Error(`--counts must use only ${ALLOWED_COUNTS.join(', ')}`);
  }
  return {
    counts: [...new Set(counts)],
    output: value('--output', 'performance-report.json'),
    siteOutput: value('--site-output', ''),
    baseurl: normalizedBaseurl(value('--baseurl', '/phct-performance')),
  };
}

function treeStats(root) {
  let files = 0;
  let bytes = 0;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, item.name);
    if (item.isDirectory()) {
      const child = treeStats(target);
      files += child.files;
      bytes += child.bytes;
    } else if (item.isFile()) {
      files += 1;
      bytes += fs.statSync(target).size;
    }
  }
  return { files, bytes };
}

function gzipBytes(file) {
  return fs.existsSync(file) ? zlib.gzipSync(fs.readFileSync(file), { level: 9 }).byteLength : 0;
}

export function assetTransferBytes(root, extensions) {
  const wanted = new Set(extensions.map((extension) => extension.toLowerCase()));
  let bytes = 0;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, item.name);
    if (item.isDirectory()) bytes += assetTransferBytes(target, extensions);
    else if (item.isFile() && wanted.has(path.extname(item.name).toLowerCase())) {
      bytes +=
        path.extname(item.name).toLowerCase() === '.svg' ? gzipBytes(target) : fs.statSync(target).size;
    }
  }
  return bytes;
}

export function pageMetrics(siteDir, relative) {
  const file = path.join(siteDir, relative);
  if (!fs.existsSync(file)) {
    throw new Error(`required performance page was not built: ${relative.split(path.sep).join('/')}`);
  }
  const content = fs.readFileSync(file);
  return {
    raw_bytes: content.byteLength,
    gzip_bytes: zlib.gzipSync(content, { level: 9 }).byteLength,
    dom_nodes: new JSDOM(content.toString('utf8')).window.document.querySelectorAll('*').length,
  };
}

export function configuredEntryPath(root) {
  const schema = readYaml(path.join(root, '_data', 'schema.yml'));
  return String(schema.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '') || 'catalog';
}

export function javascriptBytes(siteDir, catalogFile, baseurl = '') {
  if (!fs.existsSync(catalogFile)) return 0;
  const document = new JSDOM(fs.readFileSync(catalogFile, 'utf8')).window.document;
  const mount = `/${String(baseurl).replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const paths = [...document.querySelectorAll('script[src]')]
    .map((script) => new URL(script.getAttribute('src'), 'https://fixture.test/'))
    .filter((src) => src.origin === 'https://fixture.test')
    .map((src) => src.pathname)
    .map((src) => (mount && src.startsWith(`${mount}/`) ? src.slice(mount.length) : src))
    .map((src) => src.replace(/^\//, ''));
  const measured = new Set();
  const visit = (relative) => {
    const normalized = path.posix.normalize(relative);
    if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
      throw new Error(`catalog script import escapes the built site: ${relative}`);
    }
    if (measured.has(normalized)) return;
    const file = path.join(siteDir, ...normalized.split('/'));
    if (!fs.existsSync(file)) throw new Error(`catalog references missing local script: /${normalized}`);
    measured.add(normalized);
    const source = fs.readFileSync(file, 'utf8');
    const imports = /^\s*import\s+(?:(?:[\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]\s*;/gmu;
    for (const match of source.matchAll(imports)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) {
        throw new Error(`catalog script uses an unmeasurable bare import: ${specifier}`);
      }
      visit(path.posix.join(path.posix.dirname(normalized), specifier));
    }
  };
  [...new Set(paths)].forEach(visit);
  return [...measured].reduce((total, relative) => {
    const file = path.join(siteDir, relative);
    return total + gzipBytes(file);
  }, 0);
}

export function budgetFindings(metrics, config) {
  if (metrics.entries > config.supported_entries) return [];
  const values = {
    build_ms: metrics.build_ms,
    artifact_bytes: metrics.artifact.bytes,
    artifact_files: metrics.artifact.files,
    catalog_html_gzip_bytes: metrics.catalog.gzip_bytes,
    catalog_dom_nodes: metrics.catalog.dom_nodes,
    css_gzip_bytes: metrics.css_gzip_bytes,
    javascript_gzip_bytes: metrics.javascript_gzip_bytes,
    font_transfer_bytes: metrics.font_transfer_bytes,
    image_transfer_bytes: metrics.image_transfer_bytes,
    search_json_gzip_bytes: metrics.search_json_gzip_bytes,
    entries_json_gzip_bytes: metrics.entries_json_gzip_bytes,
  };
  return Object.entries(config.budgets)
    .filter(([name, maximum]) => values[name] > maximum)
    .map(([name, maximum]) => ({ name, actual: values[name], maximum }));
}

export function scaleBudgetFindings(metrics, config) {
  const budgets = config.scale_budgets?.[String(metrics.entries)] || {};
  const values = {
    search_json_gzip_bytes: metrics.search_json_gzip_bytes,
    entries_json_gzip_bytes: metrics.entries_json_gzip_bytes,
  };
  return Object.entries(budgets)
    .map(([name, maximum]) => {
      const actual = values[name];
      if (!Number.isFinite(actual)) throw new Error(`scale probe did not measure ${name}`);
      return { name, actual, maximum };
    })
    .filter(({ actual, maximum }) => actual > maximum);
}

function buildFixture(count, scratchRoot, budgets, siteOutput = '', baseurl = '') {
  const fixtureRoot = path.join(scratchRoot, String(count));
  copyTree(ROOT, fixtureRoot);
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(fixtureRoot, 'node_modules'));
  removeEntries(fixtureRoot);
  seedFixtureEntries(fixtureRoot, { count, profile: 'performance' });

  const generated = run(process.execPath, ['scripts/generate.mjs'], {
    cwd: fixtureRoot,
  });
  if (!generated.ok) throw new Error(`generate failed for ${count} entries:\n${generated.output}`);

  const siteDir = path.join(fixtureRoot, '_site');
  fs.writeFileSync(
    path.join(fixtureRoot, '_config.performance.yml'),
    `baseurl: ${JSON.stringify(baseurl)}\n`
  );
  const started = performance.now();
  const built = run(
    'bundle',
    ['exec', 'jekyll', 'build', '--config', '_config.yml,_config.performance.yml', '--destination', siteDir],
    {
      cwd: fixtureRoot,
      env: { ...process.env, JEKYLL_ENV: 'production' },
    }
  );
  const buildMs = Math.round(performance.now() - started);
  if (!built.ok) throw new Error(`Jekyll build failed for ${count} entries:\n${built.output}`);

  const entryPath = configuredEntryPath(fixtureRoot);
  const catalogRelative = path.join(entryPath, 'index.html');
  const catalogFile = path.join(siteDir, catalogRelative);
  const metrics = {
    entries: count,
    baseurl,
    build_ms: buildMs,
    artifact: treeStats(siteDir),
    catalog: pageMetrics(siteDir, catalogRelative),
    css_gzip_bytes: gzipBytes(path.join(siteDir, 'assets', 'css', 'site.css')),
    javascript_gzip_bytes: javascriptBytes(siteDir, catalogFile, baseurl),
    font_transfer_bytes: assetTransferBytes(siteDir, ['.eot', '.otf', '.ttf', '.woff', '.woff2']),
    image_transfer_bytes: assetTransferBytes(siteDir, [
      '.avif',
      '.gif',
      '.ico',
      '.jpeg',
      '.jpg',
      '.png',
      '.svg',
      '.webp',
    ]),
    search_json_gzip_bytes: gzipBytes(path.join(siteDir, 'search.json')),
    entries_json_gzip_bytes: gzipBytes(path.join(siteDir, 'entries.json')),
  };
  if (siteOutput && count === budgets.supported_entries) {
    fs.cpSync(siteDir, path.resolve(ROOT, siteOutput), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  return {
    ...metrics,
    findings: [...budgetFindings(metrics, budgets), ...scaleBudgetFindings(metrics, budgets)],
    target_findings:
      metrics.entries > budgets.supported_entries && metrics.entries <= budgets.target_entries
        ? budgetFindings(metrics, {
            ...budgets,
            supported_entries: budgets.target_entries,
          })
        : [],
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, 'quality', 'performance-budgets.json'), 'utf8'));
  const scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-performance-'));
  const report = {
    schema_version: 1,
    commit: '',
    measured_at: new Date().toISOString(),
    supported_entries: budgets.supported_entries,
    target_entries: budgets.target_entries,
    runs: [],
  };
  try {
    try {
      report.commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf8',
      }).trim();
    } catch {
      report.commit = 'unknown';
    }
    for (const count of args.counts) {
      console.log(`Building deterministic ${count}-entry catalog...`);
      const metrics = buildFixture(count, scratchRoot, budgets, args.siteOutput, args.baseurl);
      report.runs.push(metrics);
      console.log(
        `  ${metrics.build_ms}ms, ${metrics.artifact.files} files, ` +
          `${Math.round(metrics.artifact.bytes / 1024)} KiB artifact, ${metrics.findings.length} release findings, ` +
          `${metrics.target_findings.length} target findings`
      );
    }
    if (args.siteOutput && !args.counts.includes(budgets.supported_entries)) {
      console.log(
        `  No browser fixture retained: --counts did not include the supported ${budgets.supported_entries}-entry ceiling.`
      );
    }
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }

  const output = path.resolve(ROOT, args.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  const findings = report.runs.flatMap((runResult) =>
    runResult.findings.map((finding) => ({
      entries: runResult.entries,
      ...finding,
    }))
  );
  if (findings.length > 0) {
    console.error('\nPerformance budgets failed:\n');
    for (const finding of findings) {
      console.error(`  • ${finding.entries} entries: ${finding.name} ${finding.actual} > ${finding.maximum}`);
    }
    console.error(`\nFull report: ${args.output}\n`);
    return 1;
  }
  console.log(`\nAll enforced performance budgets passed. Report: ${args.output}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
