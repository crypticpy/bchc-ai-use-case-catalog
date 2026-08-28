#!/usr/bin/env node
/**
 * What is publicly observable about the code each entry links to, into
 * `_data/security_signals.json`.
 *
 *   node scripts/security_signals.mjs [--today YYYY-MM-DD] [--out PATH] [--dry-run]
 *
 * This catalog LINKS to third-party code. It does not host it, run it, or audit
 * it, and nothing here should ever be read as saying that it does. What this
 * script writes are observations, not verdicts: when the repository was last
 * pushed to, whether it is archived, what license it declares, whether it
 * publishes a security policy, and whether the OpenSSF Scorecard project has a
 * public score for it. Every one of those is a fact about the repository's
 * packaging. None of them inspects what the code does. The entry page says so
 * in as many words, and the maintainer-set `security_review` field is the only
 * place a human judgement is ever recorded.
 *
 * Which link is the repository link is the schema's to say: `entry.repo_key` in
 * _data/schema.yml names the `url` field, the same pointer idiom as
 * `status_key`, `submitter_key` and `deployments_key`. No key, no sweep — the
 * run reports "not configured" and writes nothing rather than guessing.
 *
 * Only `https://github.com/<owner>/<repo>` links are looked at: the two read
 * APIs used here are GitHub's and the Scorecard project's, and both are
 * GitHub-shaped. A repository link anywhere else is recorded as
 * `applicable: false` so the file says why it holds nothing, rather than
 * quietly omitting the entry.
 *
 * Failure is expected and is never fatal. A rate limit, a network blip, a repo
 * that has since been made private: each individual observation degrades to the
 * string "unavailable" and the run stays green, because a monthly job that goes
 * red on somebody else's outage is a job a maintainer stops reading. A
 * Scorecard 404 is not even that — most small public-sector repositories are
 * not crawled, so `scorecard: null` means "no public score", which is normal.
 *
 * The pure half (`repoTarget`, `applicableEntries`, `shapeObservation`,
 * `buildDocument`, `capDocument`, `sameSignals`) takes plain values and is what
 * the tests exercise; `observeRepo` is the only place a request is made, and it
 * takes an injected `fetchImpl`, so the suite never touches the network.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { setOutput } from './lib/actions_output.mjs';
import { readSchema } from './lib/setup-io.mjs';
import { collectEntries, toDay } from './verification_sweep.mjs';

/** The value every individual observation degrades to when its call failed. */
export const UNAVAILABLE = 'unavailable';
/** How long any one request may take before it is abandoned as unavailable. */
export const DEFAULT_TIMEOUT_MS = 10000;
/**
 * The Scorecard checks worth carrying into a public catalog: has the code been
 * reviewed by a second person, are known vulnerabilities outstanding, are
 * dependencies pinned, is there static analysis. Named here rather than
 * inherited from the API so the file stays a fixed, readable size whatever
 * Scorecard adds next.
 */
export const NOTABLE_CHECKS = ['Code-Review', 'Vulnerabilities', 'Pinned-Dependencies', 'SAST'];
/**
 * A ceiling on the written file, because it is read on every page build and
 * ships in the repository. Detail is shed before repositories are: a catalog
 * with a thousand entries should still say something about all thousand.
 */
export const MAX_BYTES = 256 * 1024;
/** Where the Scorecard project answers, and where a reader can see the full report. */
export const SCORECARD_API = 'https://api.scorecard.dev/projects/github.com';
export const SCORECARD_VIEWER = 'https://scorecard.dev/viewer/?uri=github.com';

/* -------------------------------------------------------------- pure parts */

/**
 * The `owner/repo` behind a repository link, or null for anything that is not a
 * plain GitHub repository URL.
 *
 * Deliberately strict. `https://github.com/org` is an owner, not a repository;
 * `https://github.com/org/repo/tree/main/sub` names a folder inside one and is
 * still that repository; anything on another host, or on a look-alike host, is
 * not GitHub at all and must not be sent to GitHub's API.
 *
 * @param {unknown} value a stored field value
 * @returns {{owner: string, repo: string, slug: string}|null}
 */
export function repoTarget(value) {
  const text = String(value ?? '').trim();
  if (text === '') return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  // GitHub's own limits, so a path segment that cannot be a name (a reserved
  // route, a stray character) never becomes a request.
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo) || repo === '.' || repo === '..') return null;
  return { owner, repo, slug: `${owner}/${repo}` };
}

/**
 * The live entries this sweep has anything to say about, oldest concern first —
 * which is to say, in slug order, because the file is a lookup table and not a
 * list anybody reads top to bottom.
 *
 * An entry with no repository link at all is absent from the result and from
 * the file: there is nothing to observe and nothing to disclaim. An entry whose
 * repository link is not a GitHub URL IS present, with `target: null`, so the
 * file records that it was considered.
 *
 * @param {Array<{slug: string, data: Record<string, unknown>}>} entries from `collectEntries`
 * @param {string} repoKey the schema's `entry.repo_key`
 * @returns {Array<{slug: string, url: string, target: ReturnType<typeof repoTarget>}>}
 */
export function applicableEntries(entries, repoKey) {
  if (!repoKey) return [];
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry?.data?.sample !== true)
    .map((entry) => {
      const url = String(entry?.data?.[repoKey] ?? '').trim();
      if (url === '') return null;
      return { slug: String(entry.slug), url, target: repoTarget(url) };
    })
    .filter(Boolean)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * One entry's record, from whatever the two APIs did or did not answer.
 *
 * @param {object} input
 * @param {string} input.url the repository link as the entry stores it
 * @param {ReturnType<typeof repoTarget>} input.target
 * @param {string} input.fetched `YYYY-MM-DD`
 * @param {object} [input.observed] the `observeRepo` result; omitted for a
 *   non-GitHub link, which is never fetched
 * @returns {object} the record written under the entry's slug
 */
export function shapeObservation({ url, target, fetched, observed }) {
  if (!target) {
    return {
      applicable: false,
      fetched,
      reason: 'The repository link is not a GitHub repository, so nothing here could be observed.',
      repo: null,
      url,
    };
  }
  const o = observed ?? {};
  return {
    applicable: true,
    archived: o.archived ?? UNAVAILABLE,
    errors: [...(Array.isArray(o.errors) ? o.errors : [])].sort(),
    exists: o.exists ?? UNAVAILABLE,
    fetched,
    license: o.license ?? UNAVAILABLE,
    owner_type: o.owner_type ?? UNAVAILABLE,
    pushed_at: o.pushed_at ?? UNAVAILABLE,
    repo: target.slug,
    scorecard: o.scorecard === undefined ? UNAVAILABLE : o.scorecard,
    security_policy: o.security_policy ?? UNAVAILABLE,
    url,
  };
}

/**
 * Every object key sorted, recursively — the second half of "deterministic",
 * after the slug ordering. Two runs that observed the same things must produce
 * the same bytes, or the monthly pull request is noise.
 * @param {unknown} value
 * @returns {unknown}
 */
export function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = sortKeys(value[key]);
    return out;
  }
  return value;
}

/**
 * The whole document, from a list of already-shaped records.
 * @param {object} input
 * @param {string} input.today `YYYY-MM-DD`
 * @param {Array<{slug: string, record: object}>} input.records
 * @returns {{generated_at: string, entries: Record<string, object>}}
 */
export function buildDocument({ today, records }) {
  const entries = {};
  for (const { slug, record } of [...records].sort((a, b) => a.slug.localeCompare(b.slug))) {
    entries[slug] = record;
  }
  return sortKeys({ generated_at: today, entries });
}

/**
 * The document serialised, shrunk if it has to be. Detail goes first: the
 * per-check Scorecard breakdown, then the Scorecard block entirely, then — only
 * if a catalog is somehow still over the ceiling — repositories from the end of
 * the slug order, with `truncated` naming how many were dropped so the file
 * never lies about being complete.
 *
 * @param {object} doc from `buildDocument`
 * @param {number} [maxBytes]
 * @returns {{text: string, doc: object, dropped: string[], detail: boolean}}
 */
export function capDocument(doc, maxBytes = MAX_BYTES) {
  // Through `sortKeys` on every pass, not just the first: the shrinking steps
  // below add and rewrite keys, and the file's determinism is not theirs to lose.
  const serialise = (value) => `${JSON.stringify(sortKeys(value), null, 2)}\n`;
  let text = serialise(doc);
  if (Buffer.byteLength(text) <= maxBytes) return { text, doc, dropped: [], detail: true };

  const withoutChecks = structuredClone(doc);
  for (const record of Object.values(withoutChecks.entries)) {
    if (record?.scorecard && typeof record.scorecard === 'object') delete record.scorecard.checks;
  }
  text = serialise(withoutChecks);
  if (Buffer.byteLength(text) <= maxBytes) return { text, doc: withoutChecks, dropped: [], detail: false };

  const withoutScorecard = structuredClone(withoutChecks);
  for (const record of Object.values(withoutScorecard.entries)) {
    if (record?.scorecard && typeof record.scorecard === 'object') {
      record.scorecard = { score: record.scorecard.score ?? null };
    }
  }
  text = serialise(withoutScorecard);
  if (Buffer.byteLength(text) <= maxBytes) return { text, doc: withoutScorecard, dropped: [], detail: false };

  const trimmed = structuredClone(withoutScorecard);
  const dropped = [];
  const slugs = Object.keys(trimmed.entries).sort();
  while (slugs.length && Buffer.byteLength(serialise(trimmed)) > maxBytes) {
    const slug = slugs.pop();
    delete trimmed.entries[slug];
    dropped.push(slug);
    trimmed.truncated = dropped.length;
  }
  return { text: serialise(trimmed), doc: trimmed, dropped: dropped.sort(), detail: false };
}

/**
 * Whether a previously written file carries the same observations — the dates
 * this run stamped on them are allowed to differ, so a month in which nothing
 * moved does not open a pull request that changes nothing but a date.
 *
 * Compares the whole document — including top-level cap metadata such as
 * `truncated` — with only the two timestamp fields (`generated_at` at the top,
 * `fetched` on each record) stripped first. Comparing just `entries` used to
 * miss the case where a catalog is big enough for `capDocument` to shed
 * records: the retained entries can be byte-for-byte identical between two
 * runs while a slug was added or removed at the trimmed end, changing
 * `truncated` without changing a single kept record — and that must still
 * count as changed.
 * @param {string} previousText the file as written before
 * @param {object} doc the freshly built (and, if applicable, capped) document
 * @returns {boolean}
 */
export function sameSignals(previousText, doc) {
  const withoutTimestamps = (value) => {
    const rest = { ...(value ?? {}) };
    delete rest.generated_at;
    const entries = rest.entries ?? {};
    const strippedEntries = {};
    for (const key of Object.keys(entries).sort()) {
      const record = { ...(entries[key] ?? {}) };
      delete record.fetched;
      strippedEntries[key] = record;
    }
    rest.entries = strippedEntries;
    return JSON.stringify(sortKeys(rest));
  };
  try {
    return withoutTimestamps(JSON.parse(previousText)) === withoutTimestamps(doc);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- thin fetch */

/**
 * One JSON GET, with a timeout, that never throws.
 *
 * @param {string} url
 * @param {object} options
 * @param {typeof fetch} options.fetchImpl
 * @param {Record<string, string>} [options.headers]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ok: boolean, status: number, body: unknown, error: string}>}
 *   `status` is 0 when the request never completed.
 */
export async function getJson(url, { fetchImpl, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  try {
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const status = Number(response?.status ?? 0);
    if (!response?.ok) return { ok: false, status, body: null, error: `HTTP ${status}` };
    return { ok: true, status, body: await response.json(), error: '' };
  } catch (error) {
    return { ok: false, status: 0, body: null, error: String(error?.message ?? error).slice(0, 160) };
  }
}

/**
 * The three read-only calls behind one repository's record. Individually
 * tolerant: whichever of them answers contributes, whichever does not leaves
 * "unavailable" and a line in `errors`.
 *
 * @param {{owner: string, repo: string, slug: string}} target
 * @param {{fetchImpl?: typeof fetch, token?: string, timeoutMs?: number}} [options]
 * @returns {Promise<object>} the loose observation `shapeObservation` tidies
 */
export async function observeRepo(target, { fetchImpl = fetch, token = '', timeoutMs } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'catalog-security-signals',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const api = `https://api.github.com/repos/${target.owner}/${target.repo}`;
  const errors = [];
  const observed = {};

  const repo = await getJson(api, { fetchImpl, headers, timeoutMs });
  if (repo.ok) {
    const body = repo.body ?? {};
    observed.exists = true;
    observed.archived = body.archived === true;
    observed.pushed_at = typeof body.pushed_at === 'string' ? body.pushed_at.slice(0, 10) : null;
    observed.owner_type = typeof body.owner?.type === 'string' ? body.owner.type : null;
    // SPDX or nothing: "NOASSERTION" is GitHub saying it could not identify the
    // license, which is a different fact from the repository having none, and
    // neither is this file's to interpret.
    observed.license = typeof body.license?.spdx_id === 'string' ? body.license.spdx_id : null;
  } else if (repo.status === 404) {
    // The repository is gone, renamed, or was made private. That is itself the
    // most useful observation on this list, so it is a finding and not an error.
    observed.exists = false;
    observed.archived = null;
    observed.pushed_at = null;
    observed.owner_type = null;
    observed.license = null;
  } else {
    errors.push(`repository: ${repo.error}`);
  }

  // Only asked when the repository answered: a 404 on the profile of a repo
  // that does not exist is not a second finding.
  if (observed.exists === true) {
    const profile = await getJson(`${api}/community/profile`, { fetchImpl, headers, timeoutMs });
    if (profile.ok) {
      const files = profile.body?.files ?? {};
      observed.security_policy = Boolean(files.security);
    } else if (profile.status === 404) {
      observed.security_policy = false;
    } else {
      errors.push(`security policy: ${profile.error}`);
    }
  } else if (observed.exists === false) {
    observed.security_policy = null;
  }

  const card = await getJson(`${SCORECARD_API}/${target.owner}/${target.repo}`, { fetchImpl, timeoutMs });
  if (card.ok) {
    const body = card.body ?? {};
    const checks = (Array.isArray(body.checks) ? body.checks : [])
      .filter((check) => NOTABLE_CHECKS.includes(check?.name))
      .map((check) => ({ name: String(check.name), score: Number(check.score) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    observed.scorecard = {
      checks,
      date: typeof body.date === 'string' ? body.date.slice(0, 10) : null,
      score: typeof body.score === 'number' ? body.score : null,
    };
  } else if (card.status === 404) {
    // Normal, and the single most common answer for a small public-sector
    // repository: the Scorecard project simply has not crawled it.
    observed.scorecard = null;
  } else {
    errors.push(`scorecard: ${card.error}`);
  }

  return { ...observed, errors };
}

/* -------------------------------------------------------------------- main */

/**
 * @param {string[]} argv
 * @returns {Promise<number>} process exit code
 */
async function main(argv) {
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const dryRun = argv.includes('--dry-run');
  const todayDay = toDay(flag('--today')) ?? toDay(new Date().toISOString().slice(0, 10));
  if (todayDay === null) {
    console.error('usage: node scripts/security_signals.mjs [--today YYYY-MM-DD] [--out PATH] [--dry-run]');
    return 2;
  }
  const today = new Date(todayDay).toISOString().slice(0, 10);
  const out = flag('--out') ?? path.join('_data', 'security_signals.json');

  const root = process.cwd();
  const repoKey = String(readSchema(root)?.entry?.repo_key ?? '').trim();
  if (repoKey === '') {
    console.log(
      'No `entry.repo_key` in _data/schema.yml, so this catalog has not named the field that ' +
        'holds a repository link. Nothing observed and nothing written.'
    );
    setOutput('configured', 'false');
    setOutput('changed', 'false');
    return 0;
  }

  const { entries } = collectEntries(root);
  const targets = applicableEntries(entries, repoKey);
  const token = process.env.GITHUB_TOKEN ?? '';
  const records = [];
  for (const item of targets) {
    const observed = item.target ? await observeRepo(item.target, { token }) : undefined;
    records.push({ slug: item.slug, record: shapeObservation({ ...item, fetched: today, observed }) });
  }

  const doc = buildDocument({ today, records });
  // Compared, and diffed against, the CAPPED document — the one that is
  // actually written. Comparing against the uncapped `doc` instead would mean
  // a catalog big enough to trigger capping never sees `unchanged: true`
  // again, because the written file (capped) can never equal the uncapped
  // document it is compared to, even when nothing observed actually moved.
  const { text, doc: cappedDoc, dropped } = capDocument(doc);
  const target = path.resolve(root, out);
  // Read-then-catch rather than exists-then-read, so there is no window
  // between the check and the use in which the file could be created,
  // removed or replaced out from under this run.
  let previous = '';
  try {
    previous = fs.readFileSync(target, 'utf8');
  } catch (readError) {
    if (readError.code !== 'ENOENT') throw readError;
  }
  const unchanged = previous !== '' && sameSignals(previous, cappedDoc);

  const observable = records.filter((r) => r.record.applicable).length;
  const failed = records.reduce((sum, r) => sum + (r.record.errors?.length ?? 0), 0);
  console.log(
    `${observable} of ${targets.length} entries with a repository link point at a public GitHub ` +
      `repository; ${failed} observation${failed === 1 ? '' : 's'} were unavailable.` +
      (dropped.length ? ` ${dropped.length} dropped to keep ${out} under ${MAX_BYTES} bytes.` : '')
  );

  if (dryRun) {
    console.log(text);
  } else if (unchanged) {
    console.log(`${out} unchanged.`);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    console.log(`Wrote ${out}.`);
  }
  setOutput('configured', 'true');
  setOutput('changed', String(!dryRun && !unchanged));
  setOutput('count', String(observable));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
