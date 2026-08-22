#!/usr/bin/env node
/** Select the exact npm declared by packageManager before dependency installation. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function npmVersionFromSpec(spec) {
  const match = /^npm@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(String(spec ?? ''));
  if (!match) throw new Error('packageManager must be an exact npm@x.y.z version');
  return match[1];
}

export function installArgs(spec) {
  npmVersionFromSpec(spec);
  return ['install', '--global', '--no-audit', '--no-fund', spec];
}

function npmVersion() {
  return execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const spec = packageJson.packageManager;
  let expected;
  try {
    expected = npmVersionFromSpec(spec);
  } catch (error) {
    console.error(`Cannot select npm: ${error.message}.`);
    return 2;
  }

  const before = npmVersion();
  if (before === expected) {
    console.log(`npm ${expected} is already selected.`);
    return 0;
  }

  console.log(`Selecting ${spec} (runner supplied npm ${before}).`);
  const result = spawnSync('npm', installArgs(spec), { stdio: 'inherit' });
  if (result.error) {
    console.error(`Cannot install ${spec}: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) return result.status ?? 1;

  const after = npmVersion();
  if (after !== expected) {
    console.error(`npm selection failed: found ${after}; expected ${expected}.`);
    return 1;
  }
  console.log(`Selected npm ${after}.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
