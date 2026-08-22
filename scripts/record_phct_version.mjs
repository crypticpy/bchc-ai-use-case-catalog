#!/usr/bin/env node
/** Record the immutable PHCT release consumed by a downstream deployment. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    if (!['--release', '--commit', '--date'].includes(flag)) continue;
    values[flag.slice(2)] = inline ?? argv[(index += 1)];
  }
  return values;
}

export function buildVersionLock({ release, commit, date, packageVersion, repository }) {
  const errors = [];
  if (release !== `v${packageVersion}`) {
    errors.push(`release ${release || '(missing)'} must match package.json version v${packageVersion}`);
  }
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) errors.push('commit must be a full 40-character Git SHA');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) errors.push('date must use YYYY-MM-DD');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(repository ?? '')) {
    errors.push('the ownership manifest must contain a public GitHub template repository URL');
  }
  if (errors.length > 0) throw new Error(errors.join('; '));

  return {
    schema_version: 1,
    source_repository: repository,
    release,
    version: packageVersion,
    commit,
    recorded_at: date,
  };
}

function main(argv) {
  const args = parseArgs(argv);
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = yaml.load(fs.readFileSync(path.join(ROOT, '.phct/ownership.yml'), 'utf8'));
  try {
    const lock = buildVersionLock({
      release: args.release,
      commit: args.commit,
      date: args.date ?? new Date().toISOString().slice(0, 10),
      packageVersion: packageJson.version,
      repository: manifest.template.repository,
    });
    fs.writeFileSync(path.join(ROOT, '.phct-version.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
    console.log(`Recorded ${lock.release} at ${lock.commit}.`);
    return 0;
  } catch (error) {
    console.error(`Cannot record PHCT version: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
