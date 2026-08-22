#!/usr/bin/env node
/** Explain whether this clone can run the complete PHCT release gate. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { expectedToolchain, parseToolVersions } from './lib/toolchain.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let warnings = 0;

function run(command, args = []) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}

function report(level, label, detail = '') {
  console.log(`${level.padEnd(4)}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (level === 'FAIL') failures += 1;
  if (level === 'WARN') warnings += 1;
}

function exactTool(name, expected, result, parsed) {
  if (!result.ok || !parsed) {
    report('FAIL', name, `not found; expected ${expected}`);
  } else if (parsed !== expected) {
    report('FAIL', name, `found ${parsed}; expected exactly ${expected}`);
  } else {
    report('PASS', name, parsed);
  }
}

function main() {
  const expected = expectedToolchain(ROOT);
  const commands = {
    node: run('node', ['--version']),
    npm: run('npm', ['--version']),
    ruby: run('ruby', ['--version']),
    bundler: run('bundle', ['--version']),
  };
  const actual = parseToolVersions({
    node: commands.node.output,
    npm: commands.npm.output,
    ruby: commands.ruby.output,
    bundler: commands.bundler.output,
  });

  console.log('\nPHCT development environment\n');
  for (const name of ['node', 'npm', 'ruby', 'bundler']) {
    exactTool(name, expected[name], commands[name], actual[name]);
  }

  const nvm = fs.existsSync(path.join(ROOT, '.nvmrc'))
    ? fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim()
    : '';
  report(nvm === expected.node ? 'PASS' : 'FAIL', 'Node version files agree', `.nvmrc=${nvm || 'missing'}`);

  const nodeModules = fs.existsSync(path.join(ROOT, 'node_modules'));
  report(nodeModules ? 'PASS' : 'FAIL', 'npm dependencies', nodeModules ? 'installed' : 'run npm ci');

  const bundleCheck = run('bundle', ['check']);
  report(
    bundleCheck.ok ? 'PASS' : 'FAIL',
    'Ruby dependencies',
    bundleCheck.ok ? 'installed' : 'run bundle install'
  );

  const ownership = run('node', ['scripts/check_template_ownership.mjs']);
  report(
    ownership.ok ? 'PASS' : 'FAIL',
    'PHCT ownership contract',
    ownership.ok ? 'manifest and attributes agree' : 'run npm run ownership:check'
  );

  const generated = run('node', ['scripts/generate.mjs', '--check']);
  report(
    generated.ok ? 'PASS' : 'FAIL',
    'Generated files',
    generated.ok ? 'in sync' : 'run npm run generate and commit the result'
  );

  if (fs.existsSync(path.join(ROOT, '.phct-version.json'))) {
    const applier = fs.existsSync(path.join(ROOT, 'scripts/apply_phct_update.mjs'));
    report(
      applier ? 'PASS' : 'FAIL',
      'Protected update engine',
      applier ? 'immutable parent diffs preserve deployment-owned paths' : 'update PHCT bootstrap tooling'
    );
  } else {
    report('PASS', 'Protected update engine', 'not required in the PHCT parent');
  }

  const chrome = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((command) => run(command, ['--version']).ok);
  report(
    chrome ? 'PASS' : 'WARN',
    'Browser quality tools',
    chrome ? `${chrome} is available` : 'Chrome/Chromium is needed only for a11y, flows, and Lighthouse'
  );

  console.log(
    `\nDoctor finished with ${failures} failure${failures === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'}.\n`
  );
  return failures === 0 ? 0 : 1;
}

process.exit(main());
