#!/usr/bin/env node
/**
 * How the catalog is doing: submissions, publications, contributing
 * organizations and review turnaround, by quarter, into `_data/metrics.json`.
 *
 *   node scripts/metrics.mjs [--today YYYY-MM-DD] [--quarters N] [--out PATH] [--dry-run]
 *
 * The governance page renders the file as "How the catalog is doing"; the
 * monthly workflow (.github/workflows/metrics.yml) runs this, commits the file
 * and dispatches a deploy. Everything the numbers need is already in GitHub —
 * the issues the entry form opens (labelled `content:new-entry`) and the pull
 * requests the scaffolder turns them into (branch `entry/<slug>-<issue>`, body
 * "Closes #<issue>") — so there is no analytics vendor and nothing to install
 * on the site: two read-only REST calls with the run's own token.
 *
 * What is counted, per quarter, for the last `--quarters` (default 4) ending
 * with the current one:
 *   - submissions: entry-form issues opened (`content:new-entry`, not a PR);
 *   - published:   entry pull requests merged (head branch `entry/…`);
 *   - organizations: distinct values of the schema's `entry.contributor_key`
 *     field among the (non-sample) entries published that quarter — the field
 *     is the site's to name (`organization` in the shipped schema); no key, no
 *     number;
 *   - turnaround: for every merged entry PR whose body closes an issue, the
 *     days from that issue opening to the merge — median and 90th percentile
 *     over the whole window, because a quarter with two data points has no
 *     meaningful p90.
 *
 * The pure half (`quarterOf`, `computeMetrics`) takes plain arrays and is
 * what the tests exercise; `fetchGitHub` is the only network call. Outside
 * Actions the token is optional — the public REST API answers unauthenticated
 * at a low rate limit, enough to try it once by hand.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { setOutput } from './lib/actions_output.mjs';
import { readSchema } from './lib/setup-io.mjs';
import { collectEntries, toDay } from './verification_sweep.mjs';

/** The label the entry form puts on every submission (see new-entry.yml). */
export const SUBMISSION_LABEL = 'content:new-entry';
/** The branch prefix the scaffolder gives every entry pull request. */
export const ENTRY_BRANCH_PREFIX = 'entry/';
const DEFAULT_QUARTERS = 4;
const MS_PER_DAY = 86400000;
const CLOSES = /(?:^|\s)(?:closes|fixes|resolves)\s+#(\d+)/i;

/* -------------------------------------------------------------- pure parts */

/**
 * The calendar quarter a date falls in, as `YYYY-Qn`.
 * @param {unknown} value `YYYY-MM-DD`, an ISO timestamp, or a Date
 * @returns {string|null} null when the value is not a date
 */
export function quarterOf(value) {
  const day = toDay(value instanceof Date ? value : String(value ?? '').slice(0, 10));
  if (day === null) return null;
  const date = new Date(day);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/**
 * The last `count` quarters ending with the one `today` is in, oldest first.
 * @param {number} todayDay UTC midnight timestamp
 * @param {number} count
 * @returns {string[]}
 */
export function recentQuarters(todayDay, count) {
  const date = new Date(todayDay);
  let year = date.getUTCFullYear();
  let quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.unshift(`${year}-Q${quarter}`);
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

/**
 * The first day of a quarter, `YYYY-MM-DD`.
 * @param {string} quarter `YYYY-Qn`
 * @returns {string}
 */
export function quarterStart(quarter) {
  const [year, q] = quarter.split('-Q').map(Number);
  return `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
}

/**
 * A percentile of a list of numbers (nearest-rank), or null for an empty list.
 * @param {number[]} values
 * @param {number} p 0–100
 * @returns {number|null}
 */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

/**
 * The whole computation, from plain arrays.
 *
 * @param {object} input
 * @param {Array<{number: number, created_at: string, labels?: Array<{name: string}|string>, pull_request?: unknown}>} input.issues
 *   issues as the REST API lists them (pull requests appear there too and are
 *   skipped).
 * @param {Array<{number: number, merged_at: string|null, head?: {ref?: string}, body?: string|null}>} input.pulls
 *   pull requests as the REST API lists them.
 * @param {Array<{data: Record<string, unknown>}>} input.entries the catalog's
 *   entries (`collectEntries` shape); `sample: true` ones are ignored.
 * @param {string} input.today `YYYY-MM-DD`
 * @param {number} [input.quarters]
 * @param {string} [input.contributorKey] the front matter key whose distinct
 *   values are "contributing organizations"; omit for no such number.
 * @param {string} [input.label]
 * @returns {object} the `_data/metrics.json` document.
 */
export function computeMetrics({
  issues,
  pulls,
  entries,
  today,
  quarters = DEFAULT_QUARTERS,
  contributorKey,
  label = SUBMISSION_LABEL,
}) {
  const todayDay = toDay(today);
  if (todayDay === null) throw new Error(`computeMetrics: today must be YYYY-MM-DD, got ${today}`);
  const window = recentQuarters(todayDay, Math.max(1, quarters));
  const inWindow = new Set(window);
  const rows = new Map(
    window.map((quarter) => [quarter, { quarter, submissions: 0, published: 0, organizations: new Set() }])
  );

  const labelNames = (issue) =>
    (Array.isArray(issue.labels) ? issue.labels : []).map((l) => (typeof l === 'string' ? l : l?.name));
  const submissions = (Array.isArray(issues) ? issues : []).filter(
    (issue) => !issue.pull_request && labelNames(issue).includes(label)
  );
  const opened = new Map(
    submissions.map((issue) => [issue.number, toDay(String(issue.created_at).slice(0, 10))])
  );
  for (const issue of submissions) {
    const q = quarterOf(issue.created_at);
    if (inWindow.has(q)) rows.get(q).submissions += 1;
  }

  const merged = (Array.isArray(pulls) ? pulls : []).filter(
    (pull) => pull.merged_at && String(pull.head?.ref ?? '').startsWith(ENTRY_BRANCH_PREFIX)
  );
  const turnaround = [];
  for (const pull of merged) {
    const q = quarterOf(pull.merged_at);
    if (inWindow.has(q)) rows.get(q).published += 1;
    const closes = CLOSES.exec(pull.body ?? '');
    const openedDay = closes ? opened.get(Number(closes[1])) : undefined;
    const mergedDay = toDay(String(pull.merged_at).slice(0, 10));
    if (openedDay !== undefined && openedDay !== null && mergedDay !== null && inWindow.has(q))
      turnaround.push(Math.max(0, Math.round((mergedDay - openedDay) / MS_PER_DAY)));
  }

  const live = (Array.isArray(entries) ? entries : []).filter((entry) => entry?.data?.sample !== true);
  const allOrganizations = new Set();
  if (contributorKey) {
    for (const entry of live) {
      const value = entry.data?.[contributorKey];
      const name = String(value ?? '').trim();
      if (!name) continue;
      allOrganizations.add(name);
      const q = quarterOf(entry.data?.published);
      if (inWindow.has(q)) rows.get(q).organizations.add(name);
    }
  }

  const byQuarter = window.map((quarter) => {
    const row = rows.get(quarter);
    return {
      quarter,
      from: quarterStart(quarter),
      submissions: row.submissions,
      published: row.published,
      organizations: contributorKey ? row.organizations.size : null,
    };
  });

  return {
    generated: today,
    window: { from: quarterStart(window[0]), to: today, quarters: window.length },
    totals: {
      submissions: byQuarter.reduce((sum, row) => sum + row.submissions, 0),
      published: byQuarter.reduce((sum, row) => sum + row.published, 0),
      organizations: contributorKey ? allOrganizations.size : null,
      entries: live.length,
      turnaround_days: {
        count: turnaround.length,
        median: percentile(turnaround, 50),
        p90: percentile(turnaround, 90),
      },
    },
    quarters: byQuarter,
  };
}

/* ------------------------------------------------------------------ GitHub */

/**
 * Every page of a GitHub REST list endpoint — or every page up to the first
 * whose last item satisfies `stopAt`, for a list the caller sorted so that
 * everything after that point is out of range (the items already fetched are
 * all returned; the caller still filters).
 * @param {string} url absolute, with its query string
 * @param {{token?: string, fetchImpl?: typeof fetch, stopAt?: (item: any) => boolean}} [options]
 * @returns {Promise<unknown[]>}
 */
export async function fetchGitHub(url, { token = '', fetchImpl = fetch, stopAt } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'catalog-metrics',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const items = [];
  let next = url;
  while (next) {
    const response = await fetchImpl(next, { headers });
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${next.split('?')[0]}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`GitHub API returned a non-list for ${next.split('?')[0]}`);
    items.push(...page);
    if (stopAt && page.length && stopAt(page.at(-1))) break;
    const link = response.headers.get('link') ?? '';
    const match = /<([^>]+)>;\s*rel="next"/.exec(link);
    next = match ? match[1] : null;
  }
  return items;
}

/**
 * The two lists the computation needs.
 * @param {string} repository `owner/name`
 * @param {string} since `YYYY-MM-DD` — issues and pull requests not updated since it are not fetched
 * @param {{token?: string, fetchImpl?: typeof fetch}} [options]
 * @returns {Promise<{issues: unknown[], pulls: unknown[]}>}
 */
export async function fetchActivity(repository, since, options = {}) {
  const base = `https://api.github.com/repos/${repository}`;
  const issues = await fetchGitHub(
    `${base}/issues?state=all&labels=${encodeURIComponent(SUBMISSION_LABEL)}&since=${since}T00:00:00Z&per_page=100`,
    options
  );
  // Newest-updated first, and a merge inside the window bumps `updated_at`, so
  // once a page ends before the window nothing further back can count.
  const pulls = await fetchGitHub(`${base}/pulls?state=closed&sort=updated&direction=desc&per_page=100`, {
    ...options,
    stopAt: (pull) => typeof pull?.updated_at === 'string' && pull.updated_at < `${since}T00:00:00Z`,
  });
  return { issues, pulls };
}

/**
 * Whether a previously written metrics file carries the same figures — the
 * `generated` date and the window's end are allowed to differ.
 * @param {string} previousText the file as written before
 * @param {object} metrics the freshly computed document
 * @returns {boolean}
 */
export function sameFigures(previousText, metrics) {
  try {
    const previous = JSON.parse(previousText);
    const figures = (doc) =>
      JSON.stringify({ from: doc.window?.from, totals: doc.totals, quarters: doc.quarters });
    return figures(previous) === figures(metrics);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------- main */

async function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dryRun = argv.includes('--dry-run');
  const todayDay = toDay(flag('--today')) ?? toDay(new Date().toISOString().slice(0, 10));
  const today = new Date(todayDay).toISOString().slice(0, 10);
  const quarters = Number(flag('--quarters') ?? DEFAULT_QUARTERS);
  const out = flag('--out') ?? path.join('_data', 'metrics.json');
  if (!Number.isInteger(quarters) || quarters < 1) {
    console.error(
      'usage: node scripts/metrics.mjs [--today YYYY-MM-DD] [--quarters N] [--out PATH] [--dry-run]'
    );
    return 2;
  }

  const root = process.cwd();
  const schema = readSchema(root);
  const contributorKey = schema?.entry?.contributor_key ? String(schema.entry.contributor_key) : undefined;
  const { entries, repo } = collectEntries(root);
  const repository = process.env.GITHUB_REPOSITORY || repo;
  if (!repository) {
    console.error('No repository: set GITHUB_REPOSITORY or _data/site.yml github.repository.');
    return 2;
  }

  const since = quarterStart(recentQuarters(todayDay, quarters)[0]);
  let activity;
  try {
    activity = await fetchActivity(repository, since, { token: process.env.GITHUB_TOKEN ?? '' });
  } catch (error) {
    console.error(String(error.message ?? error));
    setOutput('changed', 'false');
    return 1;
  }

  const metrics = computeMetrics({ ...activity, entries, today, quarters, contributorKey });
  const text = `${JSON.stringify(metrics, null, 2)}\n`;
  const target = path.resolve(root, out);
  const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  // Only the numbers decide whether the file changed — a fresh `generated`
  // date on identical numbers is not worth a commit and a deploy.
  const sameNumbers = previous !== '' && sameFigures(previous, metrics);

  console.log(
    `${repository}: ${metrics.totals.submissions} submissions, ${metrics.totals.published} published` +
      (metrics.totals.organizations === null ? '' : `, ${metrics.totals.organizations} organizations`) +
      ` over ${metrics.window.quarters} quarters (${metrics.window.from} → ${today}); ` +
      (metrics.totals.turnaround_days.count
        ? `turnaround median ${metrics.totals.turnaround_days.median} d, p90 ${metrics.totals.turnaround_days.p90} d (n=${metrics.totals.turnaround_days.count}).`
        : 'no linked issue→merge pairs for turnaround yet.')
  );
  if (dryRun) {
    console.log(text);
  } else if (sameNumbers) {
    console.log(`${out} unchanged.`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    console.log(`Wrote ${out}.`);
  }
  setOutput('changed', String(!dryRun && !sameNumbers));
  setOutput('summary', text);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
