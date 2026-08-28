#!/usr/bin/env node
/** Measure catalog interactions in real Chrome and append them to scale evidence. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createBuiltSiteServer } from './serve_built_site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Enforced at the supported ceiling on every run. A tier above it opts in to
// whichever of these its `scale_budgets` entry names.
const INTERACTION_BUDGETS = new Set(['filter_response_p95_ms', 'search_response_p95_ms']);
// Cold time-to-first-result: the keystroke that also pays for the fetch and the
// index build. Only ever budgeted per tier, never part of the required pair.
// Exported so scripts/performance_fixture.mjs can spell-check `scale_budgets`
// against everything either gate measures, not just its own half.
export const SCALE_INTERACTION_BUDGETS = new Set([...INTERACTION_BUDGETS, 'search_cold_response_ms']);
// The warm keystrokes, cycled: words the fixture corpus actually uses, so every
// sample is a query that answers rather than one that finds nothing.
const QUERY_SAMPLES = ['coordination', 'intake', 'triage', 'review', 'reporting', 'fixture'];

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

/**
 * The interaction budgets that apply to one fixture size.
 *
 * The supported ceiling always enforces the full required pair — a missing one
 * there is a configuration bug, not a tier that opted out. A larger tier is
 * evidence-first: it enforces exactly what `scale_budgets["<size>"]` names, so
 * a size can be measured and reported before anyone is ready to promise a
 * number for it.
 *
 * @param {object} config quality/performance-budgets.json.
 * @param {number} entries the fixture size being measured.
 * @returns {Record<string, number>}
 */
export function tierInteractionBudgets(config, entries) {
  if (entries === config.supported_entries) {
    const budgets = config.interaction_budgets || {};
    for (const name of INTERACTION_BUDGETS) {
      if (!Number.isFinite(budgets[name]) || budgets[name] <= 0) {
        throw new Error(`interaction performance budget is missing or invalid: ${name}`);
      }
    }
    return Object.fromEntries(
      Object.entries(budgets).filter(([name]) => SCALE_INTERACTION_BUDGETS.has(name))
    );
  }
  const scale = config.scale_budgets?.[String(entries)] || {};
  return Object.fromEntries(Object.entries(scale).filter(([name]) => SCALE_INTERACTION_BUDGETS.has(name)));
}

export function interactionBudgetFindings(interaction, config, entries = config.supported_entries) {
  const values = {
    filter_response_p95_ms: interaction.filter?.p95_ms,
    search_response_p95_ms: interaction.search?.warm?.p95_ms,
    search_cold_response_ms: interaction.search?.cold_initialization_ms,
  };
  return Object.entries(tierInteractionBudgets(config, entries))
    .map(([name, maximum]) => {
      const actual = values[name];
      if (!Number.isFinite(actual)) throw new Error(`interaction probe did not measure ${name}`);
      return { name, actual, maximum };
    })
    .filter(({ actual, maximum }) => actual > maximum);
}

/** The finding a tier gets when its probe never produced a measurement. */
export const PROBE_FAILURE = 'interaction_probe';

const stale = (finding) => SCALE_INTERACTION_BUDGETS.has(finding.name) || finding.name === PROBE_FAILURE;

export function mergeInteractionEvidence(report, interaction, config, entries = report.supported_entries) {
  const run = report.runs?.find((candidate) => candidate.entries === entries);
  if (!run) throw new Error(`performance report has no ${entries}-entry run`);
  const findings = interactionBudgetFindings(interaction, config, entries);
  run.interaction = interaction;
  run.findings = [...(run.findings || []).filter((finding) => !stale(finding)), ...findings];
  return findings;
}

/**
 * A tier whose probe never finished — a navigation that timed out under the CPU
 * throttle, a browser that would not launch.
 *
 * It is recorded as a finding rather than thrown, so one unmeasurable size
 * cannot hide the sizes that did measure, and the run still fails: no evidence
 * is a budget failure, not a pass.
 *
 * @param {object} report the performance report being amended.
 * @param {number} entries the tier that failed.
 * @param {Error|string} error what went wrong.
 * @returns {{name: string, actual: string, maximum: string}} the finding.
 */
export function mergeProbeFailure(report, entries, error) {
  const run = report.runs?.find((candidate) => candidate.entries === entries);
  if (!run) throw new Error(`performance report has no ${entries}-entry run`);
  const message = String((error && error.message) || error);
  const finding = { name: PROBE_FAILURE, actual: message, maximum: 'a completed probe' };
  run.interaction = { status: 'error', error: message };
  run.findings = [...(run.findings || []).filter((candidate) => !stale(candidate)), finding];
  return finding;
}

/**
 * How long one STEP of the probe may take before it is called stuck.
 *
 * Puppeteer's 15s default is a local-hardware number: a thousand-entry catalog
 * under a 4× CPU throttle on a CI runner does not reach its load event inside
 * it, and the probe died on the navigation instead of measuring anything. The
 * deadline has to stay well clear of the budget it is there to let us measure —
 * a step that ends at the deadline reports nothing at all, where one that ends
 * over budget reports a number someone can act on.
 *
 * @param {number} entries the fixture size.
 * @returns {number} milliseconds.
 */
export function probeTimeoutMs(entries) {
  return Math.max(45000, Math.ceil(Number(entries) || 0) * 90);
}

/**
 * Fail a step at the tier deadline rather than at the protocol's.
 *
 * `evaluate()` is bounded only by the browser-wide `protocolTimeout`, which is
 * both far too coarse and reported as a bare CDP error. Racing each step gives
 * the failure the step's own name, and lets the tier be abandoned in seconds
 * rather than minutes.
 *
 * @param {Promise} promise the step.
 * @param {number} ms its deadline.
 * @param {string} label what to call it if it never finishes.
 * @returns {Promise} the step's value.
 */
export async function withDeadline(promise, ms, label) {
  let timer = null;
  // Settled either way, so losing the race never leaves a rejection unhandled.
  const settled = promise.then(
    (value) => ({ value }),
    (error) => ({ error })
  );
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ expired: true }), ms);
  });
  const outcome = await Promise.race([settled, deadline]);
  clearTimeout(timer);
  if (outcome.expired) throw new Error(`${label} did not finish within ${ms}ms`);
  if (outcome.error) throw outcome.error;
  return outcome.value;
}

/**
 * Which retained fixtures the probe can actually measure.
 *
 * `interaction_entries` is the reviewed list; `<site>/<size>` is where
 * scripts/performance_fixture.mjs leaves each one. A larger tier with no
 * directory was never built, and is reported rather than dropped.
 *
 * The supported ceiling is the exception: it is the size the release gate is
 * written against, so a run that did not build it has measured nothing it may
 * release on and must say so, rather than reporting green off the larger tiers.
 *
 * @param {string} siteRoot the `--site` directory.
 * @param {object} config quality/performance-budgets.json.
 * @returns {{measurable: number[], missing: number[]}}
 */
export function measurableTiers(siteRoot, config) {
  const wanted = Array.isArray(config.interaction_entries)
    ? config.interaction_entries
    : [config.supported_entries];
  const measurable = [];
  const missing = [];
  for (const entries of wanted) {
    if (fs.existsSync(path.join(siteRoot, String(entries), 'entries.json'))) measurable.push(entries);
    else missing.push(entries);
  }
  if (missing.includes(config.supported_entries)) {
    throw new Error(
      `no retained browser fixture under ${siteRoot} for the supported ceiling of ` +
        `${config.supported_entries} entries`
    );
  }
  return { measurable, missing };
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

/**
 * The in-page half of the probe: every interaction, exposed one step at a time.
 *
 * It is installed once per page and left on `window`, because the Node half
 * drives the steps in separate `evaluate()` calls. Each step measures itself
 * with `performance.now()` deltas taken either side of the interaction, so the
 * protocol round trip between two steps cannot reach the numbers.
 *
 * Serialized to the page by puppeteer, so it may not close over module scope.
 *
 * @param {number} answerWithin ms a single keystroke may take before it is stuck.
 */
function installProbe(answerWithin) {
  const input = document.querySelector('[data-filter="search"]');
  const sort = document.querySelector('[data-sort]');
  if (!input) throw new Error('catalog search input was not rendered');
  if (!sort) throw new Error('catalog sort control was not rendered');

  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const paint = async () => {
    await frame();
    await frame();
  };
  const timed = async (act) => {
    const started = performance.now();
    act();
    const elapsed = performance.now() - started;
    await paint();
    return elapsed;
  };

  const probe = {
    controls: [],
    sheet: null,
    sortValues: [],
    compare: null,
    search(query) {
      return new Promise((resolve, reject) => {
        const started = performance.now();
        const timer = setTimeout(() => {
          document.removeEventListener('catalog:search', answered);
          reject(new Error(`search did not answer ${JSON.stringify(query)} within ${answerWithin}ms`));
        }, answerWithin);
        function answered() {
          clearTimeout(timer);
          // The keystroke is measured at the answer; the paint that follows is
          // settling time for the next step, never part of this reading.
          const elapsed = performance.now() - started;
          paint().then(() => resolve(elapsed));
        }
        document.addEventListener('catalog:search', answered, { once: true });
        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    },
    async openSheet() {
      const sheet = document.querySelector('[data-filter-sheet]');
      const sheetOpen = document.querySelector('[data-sheet-open]');
      if (!sheet || !sheetOpen) throw new Error('catalog mobile filter dialog was not rendered');
      probe.sheet = sheet;
      sheetOpen.click();
      await paint();
      const totalEntries = document.querySelectorAll('[data-entry]').length;
      const candidates = Array.from(sheet.querySelectorAll('[data-filter-key]'))
        .filter((candidate) => candidate.getAttribute('aria-disabled') !== 'true')
        .map((button) => ({
          button,
          count: Number(button.querySelector('[data-filter-count]')?.textContent || 0),
        }))
        .filter(({ count }) => count > 0 && count < totalEntries)
        .sort((left, right) => left.count - right.count);
      if (!candidates.length) throw new Error('catalog has no enabled facet control');
      const distinct = candidates.filter(
        (candidate, at, all) => at === 0 || candidate.count !== all[at - 1].count
      );
      probe.controls = [distinct[0], distinct[Math.floor(distinct.length / 2)], distinct.at(-1)].filter(
        (candidate, at, all) => all.indexOf(candidate) === at
      );
      return probe.controls.map(({ button, count }) => ({
        key: button.dataset.filterKey,
        value: button.dataset.filterValue,
        count,
      }));
    },
    async filterStep(index) {
      const filter = probe.controls[Math.floor(index / 2) % probe.controls.length].button;
      const elapsed = await timed(() => filter.click());
      const active = new URLSearchParams(window.location.search).get(filter.dataset.filterKey)?.split(',');
      const recorded = active?.includes(filter.dataset.filterValue) || false;
      if (recorded !== (index % 2 === 0)) {
        throw new Error('deferred filter history did not preserve the visible facet state');
      }
      return elapsed;
    },
    async applySheet() {
      const apply = probe.sheet.querySelector('[data-sheet-apply]');
      if (!apply) throw new Error('catalog mobile filter dialog has no apply control');
      apply.click();
      await paint();
    },
    prepareSort() {
      probe.sortValues = Array.from(sort.options, (entry) => entry.value).filter(
        (value) => value && value !== 'relevance'
      );
      if (probe.sortValues.length < 2) {
        throw new Error('catalog has fewer than two deterministic sort options');
      }
      probe.compare = document.querySelector('[data-compare-toggle]');
      if (!probe.compare) throw new Error('catalog has no comparison control');
    },
    sortStep(index) {
      sort.value = probe.sortValues[index % probe.sortValues.length];
      return timed(() => sort.dispatchEvent(new Event('change', { bubbles: true })));
    },
    compareStep() {
      return timed(() => probe.compare.click());
    },
  };
  window.__phctProbe = probe;
}

/**
 * Run every interaction as its own protocol call.
 *
 * Driving a whole tier inside one `evaluate()` made the tier's entire wall time
 * race a single protocol deadline, which a thousand entries under a 4× throttle
 * on a shared runner loses. One call per phase — and per keystroke — keeps every
 * call short, and the tier's deadline then applies to a step rather than to an
 * hour of work.
 *
 * @param {object} page the puppeteer page.
 * @param {number} timeout the tier deadline, per step.
 * @returns {Promise<object>} raw samples.
 */
async function measurePage(page, timeout) {
  const step = (label, fn, ...args) => withDeadline(page.evaluate(fn, ...args), timeout, label);

  await step('probe install', installProbe, timeout);
  const coldSearchMs = await step('cold search', () => window.__phctProbe.search('fixture'));
  const searchSamples = [];
  for (let index = 0; index < 18; index += 1) {
    const query = QUERY_SAMPLES[index % QUERY_SAMPLES.length];
    searchSamples.push(await step(`search "${query}"`, (typed) => window.__phctProbe.search(typed), query));
  }
  await step('search reset', () => window.__phctProbe.search(''));

  const filterControls = await step('filter setup', () => window.__phctProbe.openSheet());
  const filterSamples = [];
  for (let index = 0; index < 20; index += 1) {
    filterSamples.push(await step(`filter ${index + 1}`, (at) => window.__phctProbe.filterStep(at), index));
  }
  await step('filter apply', () => window.__phctProbe.applySheet());

  await step('sort setup', () => window.__phctProbe.prepareSort());
  const sortSamples = [];
  for (let index = 0; index < 20; index += 1) {
    sortSamples.push(await step(`sort ${index + 1}`, (at) => window.__phctProbe.sortStep(at), index));
  }

  const compareSamples = [];
  for (let index = 0; index < 20; index += 1) {
    compareSamples.push(await step(`compare ${index + 1}`, () => window.__phctProbe.compareStep()));
  }

  return { coldSearchMs, searchSamples, filterSamples, filterControls, sortSamples, compareSamples };
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
    const timeout = probeTimeoutMs(contract.entries);
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      // A backstop, not a deadline: measurePage() takes one step per call and
      // withDeadline() fails a stuck step long before this can fire.
      protocolTimeout: 600000,
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(timeout);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        value: { effectiveType: '4g', saveData: true },
      });
      // Pin the core count so the probe measures the same path on every
      // runner: search.js parks full search behind a "Load full search"
      // button on devices reporting few cores, and a 2-vCPU runner would
      // otherwise measure the gate instead of the load. The gate has its own
      // coverage in test/scripts/search.test.mjs; this harness measures the
      // load itself.
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        configurable: true,
        value: 8,
      });
    });
    const session = await page.createCDPSession();
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(catalogUrl, { waitUntil: 'networkidle2', timeout });
    await page.waitForFunction(
      (entries) =>
        Boolean(window.__catalogFilters) &&
        document.querySelectorAll('[data-entry]').length === entries &&
        Boolean(document.querySelector('[data-compare-toggle]')),
      { timeout },
      contract.entries
    );

    const before = await page.metrics();
    const measured = await measurePage(page, timeout);
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
  const siteRoot = path.resolve(ROOT, option(argv, '--site', '_site'));
  const budgetFile = path.resolve(ROOT, option(argv, '--budgets', 'quality/performance-budgets.json'));
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  const config = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
  const { measurable, missing } = measurableTiers(siteRoot, config);
  if (!measurable.length) {
    throw new Error(`no retained browser fixture under ${siteRoot} for any of ${missing.join(', ')} entries`);
  }
  for (const entries of missing) {
    console.log(`No ${entries}-entry browser fixture was retained; its interactions were not measured.`);
  }

  for (const entries of measurable) {
    const current = report.runs?.find((candidate) => candidate.entries === entries);
    if (!current) throw new Error(`performance report has no ${entries}-entry run`);
    let interaction;
    try {
      interaction = await runProbe(path.join(siteRoot, String(entries)), current);
    } catch (error) {
      // One size that will not answer is a finding against that size. Throwing
      // here would throw away the sizes already measured and report nothing.
      const finding = mergeProbeFailure(report, entries, error);
      writeReport(reportFile, report);
      console.error(`Low-end-mobile interactions at ${entries} entries did not complete: ${finding.actual}`);
      continue;
    }
    const interactionFindings = mergeInteractionEvidence(report, interaction, config, entries);
    writeReport(reportFile, report);
    console.log(
      `Low-end-mobile interactions at ${entries} entries: filter p95 ${interaction.filter.p95_ms}ms; ` +
        `warm search p95 ${interaction.search.warm.p95_ms}ms; ` +
        `cold search ${interaction.search.cold_initialization_ms}ms; ` +
        `${interactionFindings.length} interaction findings.`
    );
  }

  const releaseFindings = report.runs.flatMap((run) =>
    (run.findings || []).map((finding) => ({ entries: run.entries, ...finding }))
  );
  writeReport(reportFile, report);
  if (releaseFindings.length === 0) return 0;
  console.error('\nPerformance budgets failed:\n');
  for (const finding of releaseFindings) {
    // A probe that never ran reports its reason, not a number over a number.
    const detail =
      typeof finding.actual === 'number'
        ? `${finding.name} ${finding.actual} > ${finding.maximum}`
        : `${finding.name}: ${finding.actual}`;
    console.error(`  • ${finding.entries} entries: ${detail}`);
  }
  return 1;
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
