#!/usr/bin/env node
/**
 * Remove the demo content this template ships with, and turn the demo banner
 * off — the last step of making a fork your own.
 *
 * What counts as demo content is never guessed from a name list: entries are
 * the folders whose front matter says `sample: true` (see `listSampleEntries`),
 * cohorts are the `_data/cohorts/<year>.yml` files paired with their
 * `cohorts/<year>/` pages, and the two feature data files are emptied back to
 * the header comment that explains what to put in them rather than deleted, so
 * a fork that later turns the module on still has the file and its
 * instructions. The showcase — the landing page and the sample content behind
 * the live examples of each preset — goes too: it is the template introducing
 * itself, and a fork's home page is its catalog.
 *
 * Run it as `npm run eject:samples`, or let `npm run setup` and the "Apply
 * setup" workflow call `ejectSamples()` for you.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { manifestKey } from './lib/derivatives.mjs';
import { bold, dim, green, entryPathFrom, listSampleEntries, readSchema } from './lib/setup-io.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Feature data emptied back to its header comment instead of deleted. */
export const EMPTIED_DATA = ['_data/events.yml', '_data/resources.yml'];

/**
 * Modules whose data file is a worked example rather than sample rows: it
 * cannot be emptied (the page would render blank headings) and should not be
 * published as-is (it names the shipping organization's committees and
 * timelines). The ejector switches the module off in `_data/site.yml` and the
 * fork turns it back on once the file says what they mean.
 */
export const EXAMPLE_MODULES = ['governance'];

/**
 * Sample data files with no rows to empty: `_data/metrics.json` is the sample
 * submission and review figures the governance page shows, in the shape
 * scripts/metrics.mjs writes; the fork's own monthly workflow writes the real
 * ones. Deleted outright — the governance page hides the block until then.
 */
export const SAMPLE_DATA_FILES = ['_data/metrics.json'];

/**
 * The showcase: `_showcase/<preset-id>/` is the sample content each live
 * example is built from, `_data/showcase.yml` is the landing page's copy and
 * `assets/images/showcase/` holds the screenshots it shows of each example
 * (see docs/showcase-plan.md). All three exist to introduce the template, and
 * `scripts/build_showcase.mjs` only ever runs while `demo` is true — so once a
 * fork is running on its own content they are dead weight in the repository.
 * Paths, not files: two of the three are directories.
 */
export const SHOWCASE_PATHS = ['_showcase', '_data/showcase.yml', 'assets/images/showcase'];

/**
 * The responsive-image manifest `scripts/derive_images.mjs` keeps. Its records
 * for the sample screenshots go with the sample entries: left behind, they are
 * orphans and `derive_images --check` fails the fork's next pull request.
 */
export const DERIVATIVES_MANIFEST = '_data/derivatives.json';

/**
 * The leading `#` comment block of a YAML file — the part that documents what
 * the file is for, which a fork should keep.
 *
 * @param {string} text the whole file.
 * @returns {string} the comment lines, newline-terminated, or ''.
 */
export function headerComment(text) {
  const kept = [];
  for (const line of String(text ?? '').split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) kept.push(line);
    else break;
  }
  while (kept.length && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.length ? `${kept.join('\n')}\n` : '';
}

/**
 * A feature data file with its sample rows dropped: the header comment, then an
 * empty sequence so the file still parses as a list.
 *
 * @param {string} text the whole file.
 * @returns {string}
 */
export function emptiedYaml(text) {
  return `${headerComment(text)}[]\n`;
}

/**
 * Program years that have a `_data/cohorts/<year>.yml`.
 * @param {string} root repository root.
 * @returns {string[]}
 */
export function cohortYears(root) {
  const dir = path.join(root, '_data', 'cohorts');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => name.slice(0, -'.yml'.length))
    .sort();
}

/**
 * `_data/site.yml` with the demo banner switched off. Rewritten as one line
 * rather than round-tripped through the YAML parser, which would drop every
 * comment in the file.
 *
 * @param {string} text the whole file.
 * @returns {string|null} the new contents, or null when nothing had to change.
 */
export function siteYamlWithoutDemo(text) {
  const source = String(text ?? '');
  const line = /^demo:[ \t]*true[ \t]*(#.*)?$/m;
  if (!line.test(source)) return null;
  return source.replace(line, 'demo: false');
}

/**
 * `_data/site.yml` with the named module switched off — the two-space
 * `<name>: true` line inside `modules:` becomes `<name>: false`, comment kept.
 * A textual edit for the same reason as `siteYamlWithoutDemo`.
 *
 * @param {string} text the whole file.
 * @param {string} name a module key from `_data/modules.yml`.
 * @returns {string|null} the new contents, or null when the module was already
 *   off or absent.
 */
export function siteYamlWithModuleOff(text, name) {
  const source = String(text ?? '');
  const line = new RegExp(`^(  ${name}:[ \t]*)true([ \t]*(?:#.*)?)$`, 'm');
  if (!line.test(source)) return null;
  return source.replace(line, '$1false$2');
}

/**
 * The derivatives manifest without the records under the given entry folders,
 * serialised the way `scripts/derive_images.mjs` writes it (sorted keys, two
 * spaces, trailing newline).
 *
 * @param {string} text the manifest as read from disk.
 * @param {string[]} entryDirs repo-relative entry folders that were removed.
 * @returns {string|null} the new file, or null when nothing in it was theirs
 *   (or it does not parse — a broken manifest is not this script's to fix).
 */
export function manifestWithoutEntries(text, entryDirs) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    return null;
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  const prefixes = entryDirs.map((dir) => `${manifestKey(dir)}/`);
  const kept = {};
  let dropped = 0;
  for (const key of Object.keys(manifest).sort()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) dropped += 1;
    else kept[key] = manifest[key];
  }
  return dropped === 0 ? null : `${JSON.stringify(kept, null, 2)}\n`;
}

/**
 * Remove the demo content.
 *
 * @param {string} root repository root.
 * @param {{dryRun?: boolean}} [options] `dryRun` reports without writing.
 * @returns {{entries: string[], cohorts: string[], emptied: string[], removed: string[], showcase: string[], pruned: string[], demo: boolean, modulesOff: string[]}}
 *   repo-relative paths, the data files whose sample records were dropped,
 *   whether the demo banner was turned off, and which example-data modules
 *   were switched off.
 */
export function ejectSamples(root, options = {}) {
  const dryRun = options.dryRun === true;
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const result = {
    entries: [],
    cohorts: [],
    emptied: [],
    removed: [],
    showcase: [],
    pruned: [],
    demo: false,
    modulesOff: [],
  };

  for (const dir of listSampleEntries(root, entryPathFrom(readSchema(root)))) {
    result.entries.push(relative(dir));
    if (!dryRun) fs.rmSync(dir, { recursive: true, force: true });
  }

  const manifestFile = path.join(root, DERIVATIVES_MANIFEST);
  if (result.entries.length && fs.existsSync(manifestFile)) {
    const pruned = manifestWithoutEntries(fs.readFileSync(manifestFile, 'utf8'), result.entries);
    if (pruned !== null) {
      result.pruned.push(DERIVATIVES_MANIFEST);
      if (!dryRun) fs.writeFileSync(manifestFile, pruned, 'utf8');
    }
  }

  for (const year of cohortYears(root)) {
    // The data file and the page that reads it are one unit; leaving the page
    // behind would render a cohort with no title and no timeline.
    const paired = [path.join(root, '_data', 'cohorts', `${year}.yml`), path.join(root, 'cohorts', year)];
    for (const target of paired) {
      if (!fs.existsSync(target)) continue;
      result.cohorts.push(relative(target));
      if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
    }
  }

  for (const name of EMPTIED_DATA) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const current = fs.readFileSync(file, 'utf8');
    const next = emptiedYaml(current);
    if (next === current) continue;
    result.emptied.push(name);
    if (!dryRun) fs.writeFileSync(file, next, 'utf8');
  }

  for (const name of SAMPLE_DATA_FILES) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    result.removed.push(name);
    if (!dryRun) fs.rmSync(file, { force: true });
  }

  for (const name of SHOWCASE_PATHS) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) continue;
    result.showcase.push(name);
    if (!dryRun) fs.rmSync(target, { recursive: true, force: true });
  }

  const siteFile = path.join(root, '_data', 'site.yml');
  if (fs.existsSync(siteFile)) {
    let site = fs.readFileSync(siteFile, 'utf8');
    let changed = false;
    const withoutDemo = siteYamlWithoutDemo(site);
    if (withoutDemo !== null) {
      result.demo = true;
      site = withoutDemo;
      changed = true;
    }
    for (const name of EXAMPLE_MODULES) {
      const off = siteYamlWithModuleOff(site, name);
      if (off === null) continue;
      result.modulesOff.push(name);
      site = off;
      changed = true;
    }
    if (changed && !dryRun) fs.writeFileSync(siteFile, site, 'utf8');
  }

  return result;
}

/**
 * One line per thing removed, for a terminal or a pull-request body.
 * @param {ReturnType<typeof ejectSamples>} result
 * @returns {string[]}
 */
export function ejectSummary(result) {
  const lines = [];
  if (result.entries.length) lines.push(`Removed ${result.entries.length} sample entries.`);
  if (result.cohorts.length) lines.push(`Removed the sample cohort: ${result.cohorts.join(', ')}.`);
  if (result.emptied.length)
    lines.push(`Emptied ${result.emptied.join(' and ')} (the header comments stay).`);
  if (result.removed.length)
    lines.push(
      `Removed ${result.removed.join(' and ')} — sample figures; your monthly Catalog metrics run writes yours.`
    );
  if (result.showcase.length)
    lines.push(
      `Removed the showcase (${result.showcase.join(', ')}) — the template's own landing page and example sites; your home page is your catalog.`
    );
  if (result.pruned.length) lines.push(`Dropped the sample screenshots from ${result.pruned.join(' and ')}.`);
  if (result.demo) lines.push('Turned the demo banner off (`demo: false` in _data/site.yml).');
  for (const name of result.modulesOff)
    lines.push(
      `Switched the ${name} module off (\`${name}: false\` in _data/site.yml) — _data/${name}.yml is the shipped example; rewrite it, then turn the module back on.`
    );
  return lines;
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const lines = ejectSummary(ejectSamples(ROOT, { dryRun }));
  if (!lines.length) {
    console.log(dim('Nothing to remove — this catalog is already running on its own content.'));
    return 0;
  }
  console.log(bold(dryRun ? '\nWould remove:\n' : '\nRemoved:\n'));
  for (const line of lines) console.log(`  ${line}`);
  console.log(`${green(bold('\nDone.'))} Review with \`git diff\` and commit when it looks right.\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
