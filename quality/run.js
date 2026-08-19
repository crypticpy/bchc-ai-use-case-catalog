#!/usr/bin/env node
/**
 * Run one of the quality tools at the version ./package.json pins.
 *
 *   node quality/run.js pa11y-ci --config quality/pa11yci
 *   node quality/run.js @lhci/cli autorun --config=quality/lighthouserc.js
 *
 * The tools are deliberately not root dependencies: `npm ci` runs in six other
 * workflows and neither pa11y-ci's puppeteer nor Lighthouse's Chrome belong in
 * that install. They were pinned inline instead (`npx --yes pa11y-ci@4.0.1`),
 * which put the same version string in package.json *and* quality.yml, free to
 * drift. This keeps `npx --yes` — no repo-local install, no vendored Chromium —
 * but reads the version from ./package.json, so there is one place to bump.
 *
 * Exact versions, no `^`: an a11y gate that silently changes what it checks
 * between two runs of the same commit is not a gate.
 */
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { devDependencies } = require('./package.json');

const [name, ...args] = process.argv.slice(2);
const version = devDependencies[name];

if (!version) {
  const known = Object.keys(devDependencies).join(', ');
  console.error(`quality/run.js: no version pinned for "${name}". Known tools: ${known}.`);
  process.exit(2);
}
if (/^[\^~]/.test(version)) {
  console.error(`quality/run.js: "${name}" is pinned as "${version}"; use an exact version.`);
  process.exit(2);
}

// npx resolves the bin name from the package, which is what the callers want:
// `@lhci/cli` ships `lhci`, `pa11y-ci` ships `pa11y-ci`.
const result = spawnSync('npx', ['--yes', `${name}@${version}`, ...args], {
  cwd: path.resolve(__dirname, '..'),
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
