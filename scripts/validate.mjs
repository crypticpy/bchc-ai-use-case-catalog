#!/usr/bin/env node
/**
 * Local mirror of the CI validation gate: `npm run validate`.
 *
 * 1. Parses every _data/*.yml and _data/cohorts/*.yml file.
 * 2. Checks _data/theme.yml's colours against the contrast pairs the rendered
 *    site actually puts on top of each other.
 * 3. In CI (GITHUB_REPOSITORY set), checks that _data/site.yml and the issue
 *    template contact links point at *this* repository, not the template's.
 * 4. Runs scripts/check_front_matter.rb and scripts/check_file_sizes.rb.
 *
 * Deliberately build-free: it must stay runnable without Ruby, Jekyll or a
 * built _site. The checks that need a built tree live in `npm run test:build`.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
let failed = false;

function report(ok, label, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n      ${detail}` : ''}`);
  if (!ok) failed = true;
}

function warn(label, detail) {
  console.log(`WARN  ${label}${detail ? `\n      ${detail}` : ''}`);
}

// --- YAML data files -------------------------------------------------------

const dataFiles = [...listYaml(path.join(ROOT, '_data')), ...listYaml(path.join(ROOT, '_data', 'cohorts'))];

function listYaml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort();
}

for (const file of dataFiles) {
  const rel = path.relative(ROOT, file);
  try {
    yaml.load(fs.readFileSync(file, 'utf8'));
    report(true, rel);
  } catch (error) {
    report(false, rel, error.message);
  }
}

if (dataFiles.length === 0) console.log('SKIP  no YAML data files found under _data/');

// --- Theme contrast --------------------------------------------------------
// `hex_to_rgb` (_plugins/theme_filters.rb) returns "0 0 0" for anything it
// cannot parse, so a hand-edited `primary: blue` produces a black site with no
// error anywhere. The wizards already warn on these pairs interactively; this
// closes the hand-edit path with the same list.

const themeFile = path.join(ROOT, '_data', 'theme.yml');
if (fs.existsSync(themeFile)) {
  const colorModule = pathToFileURL(path.join(ROOT, 'assets/js/configurator/color.js')).href;
  const { checkThemeContrast } = await import(colorModule);
  let colors = null;
  try {
    colors = yaml.load(fs.readFileSync(themeFile, 'utf8'))?.colors ?? null;
  } catch {
    // The parse failure was already reported above.
  }
  if (colors) {
    const results = checkThemeContrast(colors);
    const problems = results.filter((result) => !result.ok);
    const describe = (result) =>
      `${result.fg} on ${result.bg} (${result.what}) is ` +
      `${result.ratio === null ? 'not a readable colour pair' : `${result.ratio.toFixed(2)}:1`}; ` +
      `needs ${result.min}:1.`;
    for (const result of problems.filter((r) => r.level === 'warn')) {
      warn('_data/theme.yml colors contrast', describe(result));
    }
    const errors = problems.filter((result) => result.level === 'error');
    report(
      errors.length === 0,
      `_data/theme.yml colors meet WCAG AA (${results.length} pairs)`,
      errors.map(describe).join('\n      ')
    );
  }
}

// --- Repository identity (CI only) -----------------------------------------
// A fork or a "Use this template" copy still carries the template's
// owner/repo until the admin runs the setup wizard. Everything the site links
// to on GitHub (issue forms, "edit this page", the submit fallback) would then
// point at the wrong repository, so fail the PR gate with the fix spelled out.
// Locally there is nothing to compare against, so the check is skipped.

const ciRepository = (process.env.GITHUB_REPOSITORY || '').trim();

if (ciRepository) {
  const siteFile = path.join(ROOT, '_data', 'site.yml');
  let siteRepository = '';
  try {
    siteRepository = String(yaml.load(fs.readFileSync(siteFile, 'utf8'))?.github?.repository || '').trim();
  } catch {
    // Parse failures were already reported above.
  }
  const matches = siteRepository.toLowerCase() === ciRepository.toLowerCase();
  report(
    matches,
    '_data/site.yml github.repository matches this repository',
    matches
      ? ''
      : `site.yml says ${JSON.stringify(siteRepository)} but this repository is ${JSON.stringify(ciRepository)}.\n` +
          `      Run \`npm run setup\` (or edit github.repository in _data/site.yml) and commit the result.`
  );

  const contactFile = path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'config.yml');
  if (fs.existsSync(contactFile)) {
    const contactText = fs.readFileSync(contactFile, 'utf8');
    const foreign = [...contactText.matchAll(/github\.com\/([\w.-]+\/[\w.-]+)/g)]
      .map((m) => m[1])
      .filter((repo) => repo.toLowerCase() !== ciRepository.toLowerCase());
    report(
      foreign.length === 0,
      '.github/ISSUE_TEMPLATE/config.yml links point at this repository',
      foreign.length
        ? `contact links still point at ${[...new Set(foreign)].join(', ')}; update the URLs to ${ciRepository}.`
        : ''
    );
  }
} else {
  console.log('SKIP  repository identity check — only runs in GitHub Actions (GITHUB_REPOSITORY unset).');
}

// --- Ruby checks -----------------------------------------------------------

const rubyAvailable = spawnSync('ruby', ['--version'], { stdio: 'ignore' }).status === 0;

if (!rubyAvailable) {
  console.log(
    '\nSKIP  Ruby checks — `ruby` was not found on your PATH.\n' +
      '      Front matter and file size validation were NOT run locally; CI will still run them.\n' +
      '      Install Ruby 3.3+ (e.g. `brew install ruby`) to run the full gate.'
  );
} else {
  for (const script of ['check_front_matter.rb', 'check_file_sizes.rb']) {
    const result = spawnSync('ruby', [path.join('scripts', script)], { cwd: ROOT, stdio: 'inherit' });
    report(result.status === 0, `scripts/${script}`);
  }
}

console.log(failed ? '\nValidation failed.' : '\nValidation passed.');
process.exit(failed ? 1 : 0);
