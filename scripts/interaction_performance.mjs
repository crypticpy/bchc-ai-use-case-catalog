#!/usr/bin/env node
/** Measure catalog interactions in real Chrome and append them to scale evidence. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBuiltSiteServer } from './serve_built_site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INTERACTION_BUDGETS = new Set(['filter_response_p95_ms', 'search_response_p95_ms']);

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

export function percentile(samples, share = 0.95) {
  if (!Array.isArray(samples) || samples.length === 0)
    throw new Error('percentile needs at least one sample');
  if (!(share > 0 && share <= 1)) throw new Error('percentile share must be greater than 0 and at most 1');
  const sorted = samples.map(Number).sort((a, b) => a - b);
  if (sorted.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error('percentile samples must be finite, non-negative numbers');
  }
  return sorted[Math.ceil(sorted.length * share) - 1];
}

export function timingSummary(samples) {
  const rounded = (value) => Math.round(value * 100) / 100;
  return {
    samples: samples.length,
    values_ms: samples.map(rounded),
    p50_ms: rounded(percentile(samples, 0.5)),
    p95_ms: rounded(percentile(samples)),
    max_ms: rounded(Math.max(...samples)),
  };
}

export function catalogContract(siteDirectory, expectedEntries) {
  const file = path.join(siteDirectory, 'entries.json');
  if (!fs.existsSync(file)) throw new Error(`browser fixture has no entries.json: ${siteDirectory}`);
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(document.entries)) throw new Error('browser fixture entries.json has no entries array');
  if (document.entries.length !== expectedEntries) {
    throw new Error(
      `browser fixture has ${document.entries.length} entries; expected supported ceiling ${expectedEntries}`
    );
  }
  const entryPath = String(document.entry?.path || '').replace(/^\/+|\/+$/g, '');
  if (!entryPath) throw new Error('browser fixture entries.json has no entry.path');
  return { entryPath, entries: document.entries.length };
}

export function interactionBudgetFindings(interaction, config) {
  const budgets = config.interaction_budgets || {};
  for (const name of INTERACTION_BUDGETS) {
    if (!Number.isFinite(budgets[name]) || budgets[name] <= 0) {
      throw new Error(`interaction performance budget is missing or invalid: ${name}`);
    }
  }
  const values = {
    filter_response_p95_ms: interaction.filter?.p95_ms,
    search_response_p95_ms: interaction.search?.warm?.p95_ms,
  };
  return Object.entries(budgets)
    .filter(([name]) => INTERACTION_BUDGETS.has(name))
    .map(([name, maximum]) => {
      const actual = values[name];
      if (!Number.isFinite(actual)) throw new Error(`interaction probe did not measure ${name}`);
      return { name, actual, maximum };
    })
    .filter(({ actual, maximum }) => actual > maximum);
}

export function mergeInteractionEvidence(report, interaction, config) {
  const run = report.runs?.find((candidate) => candidate.entries === report.supported_entries);
  if (!run) throw new Error(`performance report has no ${report.supported_entries}-entry supported run`);
  const findings = interactionBudgetFindings(interaction, config);
  run.interaction = interaction;
  run.findings = [
    ...(run.findings || []).filter((finding) => !INTERACTION_BUDGETS.has(finding.name)),
    ...findings,
  ];
  return findings;
}

async function loadPuppeteer() {
  const explicit = process.env.PUPPETEER_MODULE_PATH;
  const specifier = explicit
    ? explicit.startsWith('file:')
      ? explicit
      : pathToFileURL(path.resolve(explicit)).href
    : 'puppeteer';
  try {
    const module = await import(specifier);
    return module.default ?? module;
  } catch (error) {
    throw new Error(
      'the interaction performance gate needs puppeteer. Install the version in quality/package.json ' +
        'with `PUPPETEER_SKIP_DOWNLOAD=1 npm install --no-save puppeteer@<version>`.',
      { cause: error }
    );
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

async function measurePage(page) {
  return page.evaluate(async () => {
    const input = document.querySelector('[data-filter="search"]');
    const sort = document.querySelector('[data-sort]');
    if (!input) throw new Error('catalog search input was not rendered');
    if (!sort) throw new Error('catalog sort control was not rendered');

    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const paint = async () => {
      await frame();
      await frame();
    };
    const search = (query) =>
      new Promise((resolve, reject) => {
        const started = performance.now();
        const timeout = setTimeout(() => {
          document.removeEventListener('catalog:search', answered);
          reject(new Error(`search did not answer ${JSON.stringify(query)} within five seconds`));
        }, 5000);
        function answered() {
          clearTimeout(timeout);
          resolve(performance.now() - started);
        }
        document.addEventListener('catalog:search', answered, { once: true });
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

    const coldSearchMs = await search('fixture');
    await paint();
    const searchSamples = [];
    const queries = ['coordination', 'intake', 'triage', 'review', 'reporting', 'fixture'];
    for (let index = 0; index < 18; index += 1) {
      searchSamples.push(await search(queries[index % queries.length]));
      await paint();
    }
    await search('');
    await paint();

    const sheet = document.querySelector('[data-filter-sheet]');
    const sheetOpen = document.querySelector('[data-sheet-open]');
    if (!sheet || !sheetOpen) throw new Error('catalog mobile filter dialog was not rendered');
    sheetOpen.click();
    await paint();
    const totalEntries = document.querySelectorAll('[data-entry]').length;
    const filterCandidates = Array.from(sheet.querySelectorAll('[data-filter-key]'))
      .filter((candidate) => candidate.getAttribute('aria-disabled') !== 'true')
      .map((button) => ({
        button,
        count: Number(button.querySelector('[data-filter-count]')?.textContent || 0),
      }))
      .filter(({ count }) => count > 0 && count < totalEntries)
      .sort((left, right) => left.count - right.count);
    if (!filterCandidates.length) throw new Error('catalog has no enabled facet control');
    const distinctCounts = filterCandidates.filter(
      (candidate, at, candidates) => at === 0 || candidate.count !== candidates[at - 1].count
    );
    const filterControls = [
      distinctCounts[0],
      distinctCounts[Math.floor(distinctCounts.length / 2)],
      distinctCounts.at(-1),
    ].filter((candidate, at, candidates) => candidates.indexOf(candidate) === at);
    const filterSamples = [];
    for (let index = 0; index < 20; index += 1) {
      const filter = filterControls[Math.floor(index / 2) % filterControls.length].button;
      const started = performance.now();
      filter.click();
      filterSamples.push(performance.now() - started);
      await paint();
      const activeValues = new URLSearchParams(window.location.search)
        .get(filter.dataset.filterKey)
        ?.split(',');
      const recorded = activeValues?.includes(filter.dataset.filterValue) || false;
      if (recorded !== (index % 2 === 0)) {
        throw new Error('deferred filter history did not preserve the visible facet state');
      }
    }
    const sheetApply = sheet.querySelector('[data-sheet-apply]');
    if (!sheetApply) throw new Error('catalog mobile filter dialog has no apply control');
    sheetApply.click();
    await paint();

    const sortValues = Array.from(sort.options, (entry) => entry.value).filter(
      (value) => value && value !== 'relevance'
    );
    if (sortValues.length < 2) throw new Error('catalog has fewer than two deterministic sort options');
    const sortSamples = [];
    for (let index = 0; index < 20; index += 1) {
      sort.value = sortValues[index % sortValues.length];
      const started = performance.now();
      sort.dispatchEvent(new Event('change', { bubbles: true }));
      sortSamples.push(performance.now() - started);
      await paint();
    }

    const compare = document.querySelector('[data-compare-toggle]');
    if (!compare) throw new Error('catalog has no comparison control');
    const compareSamples = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      compare.click();
      compareSamples.push(performance.now() - started);
      await paint();
    }

    return {
      coldSearchMs,
      searchSamples,
      filterSamples,
      filterControls: filterControls.map(({ button, count }) => ({
        key: button.dataset.filterKey,
        value: button.dataset.filterValue,
        count,
      })),
      sortSamples,
      compareSamples,
    };
  });
}

async function runProbe(siteDirectory, supportedRun) {
  const contract = catalogContract(siteDirectory, supportedRun.entries);
  const baseurl = `/${String(supportedRun.baseurl || '').replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const server = createBuiltSiteServer(siteDirectory, { baseurl });
  let browser;
  try {
    await listen(server);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('browser fixture server has no TCP address');
    const origin = `http://127.0.0.1:${address.port}`;
    const catalogUrl = `${origin}${baseurl}/${contract.entryPath}/`;
    const response = await fetch(catalogUrl, { method: 'HEAD' });
    if (!response.ok) throw new Error(`browser fixture answered ${response.status} at ${catalogUrl}`);

    const puppeteer = await loadPuppeteer();
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { effectiveType: '4g', saveData: true },
      });
    });
    const session = await page.createCDPSession();
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(catalogUrl, { waitUntil: 'networkidle2' });
    await page.waitForFunction(
      (entries) =>
        Boolean(window.__catalogFilters) &&
        document.querySelectorAll('[data-entry]').length === entries &&
        Boolean(document.querySelector('[data-compare-toggle]')),
      {},
      contract.entries
    );

    const before = await page.metrics();
    const measured = await measurePage(page);
    const after = await page.metrics();
    const rounded = (value) => Math.round(value * 100) / 100;
    return {
      profile: {
        browser: await browser.version(),
        viewport: { width: 390, height: 844 },
        cpu_slowdown: 4,
        entries: contract.entries,
      },
      search: {
        cold_initialization_ms: rounded(measured.coldSearchMs),
        warm: timingSummary(measured.searchSamples),
      },
      filter: { ...timingSummary(measured.filterSamples), controls: measured.filterControls },
      sort: timingSummary(measured.sortSamples),
      compare: timingSummary(measured.compareSamples),
      main_thread_task_ms: rounded((after.TaskDuration - before.TaskDuration) * 1000),
      js_heap_used_bytes: after.JSHeapUsedSize,
      fixture_cache_control: response.headers.get('cache-control') || '',
    };
  } finally {
    if (browser) await browser.close();
    if (server.listening) await close(server);
  }
}

function writeReport(file, report) {
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main(argv) {
  const reportFile = path.resolve(ROOT, option(argv, '--report', 'performance-report.json'));
  const siteDirectory = path.resolve(ROOT, option(argv, '--site', '_site'));
  const budgetFile = path.resolve(ROOT, option(argv, '--budgets', 'quality/performance-budgets.json'));
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const config = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
  const supportedRun = report.runs?.find((candidate) => candidate.entries === report.supported_entries);
  if (!supportedRun)
    throw new Error(`performance report has no ${report.supported_entries}-entry supported run`);

  try {
    const interaction = await runProbe(siteDirectory, supportedRun);
    const interactionFindings = mergeInteractionEvidence(report, interaction, config);
    const releaseFindings = report.runs.flatMap((run) =>
      (run.findings || []).map((finding) => ({ entries: run.entries, ...finding }))
    );
    writeReport(reportFile, report);
    console.log(
      `Low-end-mobile interactions: filter p95 ${interaction.filter.p95_ms}ms; ` +
        `warm search p95 ${interaction.search.warm.p95_ms}ms; ` +
        `${interactionFindings.length} interaction findings, ${releaseFindings.length} total release findings.`
    );
    if (releaseFindings.length === 0) return 0;
    for (const finding of releaseFindings) {
      console.error(`  • ${finding.entries} entries: ${finding.name} ${finding.actual} > ${finding.maximum}`);
    }
    return 1;
  } catch (error) {
    supportedRun.interaction = { status: 'error', error: error.message };
    writeReport(reportFile, report);
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
