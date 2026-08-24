#!/usr/bin/env node
/** Run every non-browser PHCT release gate through one documented command. */

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const gates = [
  ['Environment and repository contract', 'npm', ['run', 'doctor']],
  ['Generated files', 'node', ['scripts/generate.mjs', '--check']],
  ['Lint', 'npm', ['run', 'lint']],
  ['Formatting', 'npm', ['run', 'format:check']],
  ['Node tests', 'npm', ['test']],
  ['Code coverage evidence', 'npm', ['run', 'coverage']],
  ['Ruby tests', 'npm', ['run', 'test:ruby']],
  ['Data and front matter', 'npm', ['run', 'validate']],
  ['Dependency licenses', 'npm', ['run', 'licenses:check']],
  ['Security exception policy', 'npm', ['run', 'security:exceptions']],
  ['Deterministic software bill of materials', 'npm', ['run', 'sbom']],
  ['Image derivatives', 'node', ['scripts/derive_images.mjs', '--check']],
  ['Preset and module builds', 'npm', ['run', 'test:build']],
  ['Production CSS', 'npm', ['run', 'build:css']],
  ['Jekyll diagnostics and production build', 'npm', ['run', 'build:release']],
  ['Built-site links', 'npm', ['run', 'links:check']],
];

for (const [label, command, args] of gates) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, JEKYLL_ENV: 'production' },
  });
  if (result.status !== 0) {
    console.error(`\nVerification stopped: ${label} failed.\n`);
    process.exit(result.status ?? 1);
  }
}

console.log(
  '\nAll non-browser PHCT release gates passed. Run the full performance workflow (including its Chrome interaction probe), npm run a11y, npm run test:flows, and both Lighthouse lanes for release evidence.\n'
);
