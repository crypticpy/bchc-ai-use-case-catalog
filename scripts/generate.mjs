#!/usr/bin/env node
/**
 * Regenerate everything derived from _data/*.yml.
 *
 *   npm run generate            write the files that changed
 *   npm run generate -- --check exit 1 if anything would change (CI gate)
 *
 * Writes  assets/js/configurator/defaults.generated.js  (wizard defaults)
 * Writes  .github/ISSUE_TEMPLATE/new-entry.yml          (public submission form)
 * Syncs   _config.yml title/description from _data/site.yml (SEO fallbacks)
 * Syncs   .github/ISSUE_TEMPLATE/config.yml contact-link URLs to site.github.repository
 * Syncs   _data/site.yml links into this repository's own files (footer guide link)
 *
 * Run this after hand-editing _data/schema.yml or _data/site.yml. It is
 * idempotent: a second run reports no changes.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';
import { renderDefaults, OUTPUT_PATH as DEFAULTS_PATH } from './build_defaults.mjs';

const ROOT = process.cwd();
const ISSUE_TEMPLATE_PATH = '.github/ISSUE_TEMPLATE/new-entry.yml';
const CONFIG_PATH = '_config.yml';
const CONTACT_LINKS_PATH = '.github/ISSUE_TEMPLATE/config.yml';
const SITE_DATA_PATH = '_data/site.yml';

const check = process.argv.slice(2).some((arg) => arg === '--check');
const changes = [];
const stale = [];

function abort(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

function readData(relative) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) abort(`Missing ${relative}. Run \`npm run setup\` first.`);
  try {
    return yaml.load(fs.readFileSync(file, 'utf8')) || {};
  } catch (error) {
    abort(`Could not parse ${relative}:\n  ${error.message}`);
  }
}

/**
 * Write when the content differs — or, under `--check`, just record it.
 * @returns {boolean} true when the file was already up to date.
 */
function sync(relative, content, note = '') {
  const file = path.join(ROOT, relative);
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (existing === content) return true;
  if (check) {
    stale.push(relative);
    return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Write beside the target and rename: every file here is tracked, and a
  // partial write (ENOSPC, Ctrl-C) would leave a committed file truncated.
  // A rename within one directory is atomic.
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, content, 'utf8');
  fs.renameSync(temp, file);
  changes.push(`${existing === null ? 'created' : 'updated'} ${relative}${note ? ` (${note})` : ''}`);
  return false;
}

// --- 0. links into our own repository, in _data/site.yml --------------------
// The shipped footer has a "Maintainer guide" link to a file in this
// repository, so a fork's public footer keeps pointing at the template until
// someone rewrites it. Only file-view URLs (/blob/, /tree/, /raw/, /edit/) are
// rewritten — those name a repository's own source, whereas a bare
// github.com/org/project link in the footer is a deliberate link out.
//
// This runs before anything is derived from _data/site.yml: the wizard defaults
// below are compiled from the file, so patching it afterwards left them one run
// stale and `--check` red on the very commit that had just run `generate`.

const repository = String(readData(SITE_DATA_PATH).github?.repository || '').trim();
const ownRepository = /^[\w.-]+\/[\w.-]+$/.test(repository);
if (ownRepository) {
  const siteFile = path.join(ROOT, SITE_DATA_PATH);
  const original = fs.readFileSync(siteFile, 'utf8');
  const patched = original.replace(
    /github\.com\/[\w.-]+\/[\w.-]+(?=\/(?:blob|tree|raw|edit)\/)/g,
    `github.com/${repository}`
  );
  sync(SITE_DATA_PATH, patched, `repository links point at ${repository}`);
}

// --- 1. wizard defaults, compiled from _data/*.yml --------------------------
// Written first: core.js imports the generated module.

sync(DEFAULTS_PATH, renderDefaults(ROOT));

const core = await import(pathToFileURL(path.join(ROOT, 'assets/js/configurator/core.js')).href);

// --- 2. schema check --------------------------------------------------------

const schema = readData('_data/schema.yml');
const site = readData(SITE_DATA_PATH);

const result = core.checkSchema(schema);
if (!result.ok) {
  console.error('\n_data/schema.yml is not valid:\n');
  for (const { path: where, message } of result.errors) console.error(`  • ${where}: ${message}`);
  console.error('\nFix the field definitions and run `npm run generate` again.\n');
  process.exit(1);
}
for (const { path: where, message } of result.warnings) console.warn(`  ! ${where}: ${message}`);

// --- 3. issue form ----------------------------------------------------------

const fieldCount = (Array.isArray(schema.fields) ? schema.fields : []).filter((f) => f.form !== false).length;
sync(ISSUE_TEMPLATE_PATH, core.issueTemplateFromSchema(schema, site), `${fieldCount} fields`);

// --- 4. _config.yml title/description ---------------------------------------

const configFile = path.join(ROOT, CONFIG_PATH);
if (fs.existsSync(configFile)) {
  const original = fs.readFileSync(configFile, 'utf8');
  const patched = core.patchJekyllConfig(original, site);
  sync(CONFIG_PATH, patched.text, `${patched.changed.join(' and ')} synced from _data/site.yml`);
} else {
  console.warn(`Warning: ${CONFIG_PATH} not found; skipped the title/description sync.`);
}

// --- 5. issue chooser contact links -----------------------------------------
// The chooser's "Maintainer guide" link is a plain GitHub URL, so a fork keeps
// pointing at the template's repository until it is rewritten here.

const contactFile = path.join(ROOT, CONTACT_LINKS_PATH);
if (fs.existsSync(contactFile) && ownRepository) {
  const original = fs.readFileSync(contactFile, 'utf8');
  const patched = original.replace(/github\.com\/[\w.-]+\/[\w.-]+(?=\/)/g, `github.com/${repository}`);
  sync(CONTACT_LINKS_PATH, patched, `links point at ${repository}`);
}

// --- report -----------------------------------------------------------------

if (check) {
  if (stale.length === 0) {
    console.log('Generated files are in sync.');
  } else {
    console.error('\nThese generated files are out of date:\n');
    for (const file of stale) console.error(`  • ${file}`);
    console.error('\nRun `npm run generate` and commit the result.\n');
    process.exit(1);
  }
} else if (changes.length === 0) {
  console.log('Everything is up to date — no changes.');
} else {
  for (const change of changes) console.log(change);
}
