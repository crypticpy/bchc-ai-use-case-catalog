#!/usr/bin/env node
/**
 * Render the quality gate's results as a job summary.
 *
 *   node quality/summary.js --pa11y pa11y.json --lighthouse .lighthouseci
 *
 * Both tools already print everything, but the useful part is buried in a few
 * thousand lines of log: "which page regressed, and by how much" takes a
 * download and a scroll. Reviewers who will not do that end up trusting a green
 * tick and learning nothing from a red one, so the numbers go on the run's
 * summary page, where the pull request already sends them.
 *
 * Reads what the tools leave behind — pa11y-ci's `--json` on stdout and
 * Lighthouse CI's `.lighthouseci/lhr-*.json` — so it adds no third run.
 * Prints markdown; the caller appends it to $GITHUB_STEP_SUMMARY.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATEGORIES = [
  ['performance', 'Perf'],
  ['accessibility', 'A11y'],
  ['best-practices', 'Best practices'],
  ['seo', 'SEO'],
];

/** Lighthouse's own pass mark: below it, the number is bolded rather than coloured. */
const GOOD = 0.9;

/** A category score as a percentage, emphasised when it is below {@link GOOD}. */
function score(value) {
  if (typeof value !== 'number') return '-';
  const percent = Math.round(value * 100);
  return value >= GOOD ? String(percent) : `**${percent}**`;
}

/** A URL shortened to its path, so the table fits without scrolling. */
function shortPath(url) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

/**
 * Every file named `name` at or below `dir`. The workflow runs Lighthouse once
 * per lane and keeps each lane's `.lighthouseci` in its own subdirectory, so
 * one summary covers both.
 * @param {string} dir
 * @param {(name: string) => boolean} match
 * @returns {string[]} absolute paths.
 */
function findFiles(dir, match) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) found.push(...findFiles(full, match));
    else if (item.isFile() && match(item.name)) found.push(full);
  }
  return found;
}

/** JSON at `file`, or `fallback` when it is missing or unreadable. */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** The middle value, or null when there are none. */
function median(values) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
}

/**
 * The Lighthouse section: one row per audited page, per form factor.
 *
 * Several runs per URL are normal (`numberOfRuns`), and Lighthouse CI asserts
 * on the median, so the table reports the median too — a lucky run in the
 * summary and an unlucky one in the assertion would read as a contradiction.
 *
 * @param {string} dir a `.lighthouseci` directory.
 * @returns {string} markdown, or a note when there is nothing to report.
 */
function lighthouseSection(dir) {
  const files = findFiles(dir, (name) => name.startsWith('lhr-') && name.endsWith('.json'));

  const byRun = new Map();
  for (const file of files) {
    const report = readJson(file, null);
    if (!report?.categories) continue;
    const lane = report.configSettings?.formFactor === 'desktop' ? 'Desktop' : 'Mobile';
    const key = `${lane}\t${shortPath(report.finalDisplayedUrl || report.requestedUrl || '')}`;
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key).push(report);
  }
  if (byRun.size === 0) return '_Lighthouse produced no reports._';

  const rows = [...byRun.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, reports]) => {
      const [lane, url] = key.split('\t');
      const cells = CATEGORIES.map(([id]) =>
        score(median(reports.map((report) => report.categories[id]?.score)))
      );
      const lcp = median(reports.map((r) => r.audits?.['largest-contentful-paint']?.numericValue));
      const lcpCell = lcp === null ? '-' : `${(lcp / 1000).toFixed(1)}s`;
      return `| ${lane} | \`${url}\` | ${cells.join(' | ')} | ${lcpCell} |`;
    });

  const failures = findFiles(dir, (name) => name === 'assertion-results.json')
    .flatMap((file) => readJson(file, []))
    .filter((result) => !result.passed);
  const detail = failures.length
    ? [
        '',
        `<details><summary>${failures.length} assertion${failures.length === 1 ? '' : 's'} not met</summary>`,
        '',
        ...failures.map(
          (r) =>
            `- \`${r.auditId}\` on \`${shortPath(r.url)}\`: ${r.actual} ` +
            `(expected ${r.operator} ${r.expected})`
        ),
        '',
        '</details>',
      ].join('\n')
    : '';

  return [
    `| Lane | Page | ${CATEGORIES.map(([, label]) => label).join(' | ')} | LCP |`,
    `| --- | --- | ${CATEGORIES.map(() => '---:').join(' | ')} | ---: |`,
    ...rows,
    detail,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The pa11y section: a count per URL, and the distinct rule codes behind them.
 * @param {string} file pa11y-ci's `--json` output.
 * @returns {string} markdown.
 */
function pa11ySection(file) {
  const report = readJson(file, null);
  if (!report?.results) return '_pa11y-ci produced no report._';

  const urls = Object.entries(report.results);
  const failing = urls.filter(([, issues]) => issues.some((issue) => issue.type === 'error'));
  if (failing.length === 0) {
    return `Passed: ${urls.length} URL${urls.length === 1 ? '' : 's'} audited, no WCAG 2 AA errors.`;
  }

  const rows = failing.map(([url, issues]) => {
    const errors = issues.filter((issue) => issue.type === 'error');
    // Three codes is enough to recognise the failure; the full list is in the log.
    const codes = [...new Set(errors.map((issue) => issue.code))].slice(0, 3).join(', ');
    return `| \`${shortPath(url)}\` | ${errors.length} | ${codes} |`;
  });

  return [
    `Failed: ${report.errors} error${report.errors === 1 ? '' : 's'} across ` +
      `${failing.length} of ${urls.length} URLs.`,
    '',
    '| Page | Errors | Rules |',
    '| --- | ---: | --- |',
    ...rows,
  ].join('\n');
}

/* -------------------------------------------------------------------------- */

if (require.main === module) {
  const argv = process.argv.slice(2);
  const valueOf = (name, fallback) => {
    const at = argv.indexOf(name);
    return at === -1 ? fallback : argv[at + 1];
  };
  console.log(
    [
      '## Accessibility (pa11y-ci, WCAG 2 AA)',
      '',
      pa11ySection(path.resolve(valueOf('--pa11y', 'pa11y.json'))),
      '',
      '## Lighthouse',
      '',
      lighthouseSection(path.resolve(valueOf('--lighthouse', '.lighthouseci'))),
      '',
    ].join('\n')
  );
}

module.exports = { lighthouseSection, pa11ySection, score, shortPath };
