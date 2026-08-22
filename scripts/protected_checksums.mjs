#!/usr/bin/env node
/** Snapshot or verify every byte of deployment-owned PHCT downstream content. */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

import { forkOwnershipRules, isForkOwned } from './upgrade_check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function buildSnapshot(files, readFile, protectedPatterns, ownershipRules) {
  const selected = files
    .filter((file) =>
      protectedPatterns.some((pattern) => {
        if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
        return file === pattern;
      })
    )
    .filter((file) => isForkOwned(ownershipRules, file))
    .sort();

  return {
    schema_version: 1,
    algorithm: 'sha256',
    files: Object.fromEntries(selected.map((file) => [file, sha256(readFile(file))])),
  };
}

export function compareSnapshots(before, after) {
  const left = before?.files ?? {};
  const right = after?.files ?? {};
  const paths = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
  return paths
    .filter((file) => left[file] !== right[file])
    .map((file) => ({
      file,
      status: !(file in left) ? 'added' : !(file in right) ? 'removed' : 'changed',
    }));
}

function currentSnapshot() {
  const manifest = yaml.load(fs.readFileSync(path.join(ROOT, '.phct/ownership.yml'), 'utf8'));
  const attributes = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
  return buildSnapshot(
    files,
    (file) => fs.readFileSync(path.join(ROOT, file)),
    manifest.ownership.deployment,
    forkOwnershipRules(attributes)
  );
}

function usage() {
  console.error('Usage: node scripts/protected_checksums.mjs <snapshot|verify> <snapshot.json>');
  return 2;
}

function main(argv) {
  const [command, output] = argv;
  if (!['snapshot', 'verify'].includes(command) || !output) return usage();
  const outputPath = path.resolve(process.cwd(), output);
  const current = currentSnapshot();

  if (command === 'snapshot') {
    fs.writeFileSync(outputPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    console.log(`Recorded ${Object.keys(current.files).length} protected deployment files in ${output}.`);
    return 0;
  }

  if (!fs.existsSync(outputPath)) {
    console.error(`Protected-file snapshot not found: ${output}`);
    return 2;
  }
  const baseline = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const changes = compareSnapshots(baseline, current);
  if (changes.length > 0) {
    console.error('\nPHCT update changed protected deployment files:\n');
    for (const change of changes) console.error(`  • ${change.status}: ${change.file}`);
    console.error('\nRevert these changes or document and apply an explicit downstream migration.\n');
    return 1;
  }
  console.log(`All ${Object.keys(current.files).length} protected deployment files are byte-identical.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
