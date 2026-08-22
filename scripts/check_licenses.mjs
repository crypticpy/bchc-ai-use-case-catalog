#!/usr/bin/env node
/** Fail closed when npm or bundled Ruby dependencies introduce a new license. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function npmLicenseFindings(lock, allowed) {
  const findings = [];
  for (const [location, metadata] of Object.entries(lock?.packages ?? {})) {
    if (!location) continue;
    if (!metadata.license) findings.push(`${location}: missing license metadata`);
    else if (!allowed.has(metadata.license))
      findings.push(`${location}: unreviewed license ${metadata.license}`);
  }
  return findings;
}

function main() {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'quality', 'allowed-licenses.json'), 'utf8'));
  const allowed = new Set(policy.allowed);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const findings = npmLicenseFindings(lock, allowed);

  const ruby = spawnSync('bundle', ['exec', 'ruby', 'scripts/check_gem_licenses.rb'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PHCT_ALLOWED_LICENSES: [...allowed].join('\n') },
  });
  if (ruby.status !== 0)
    findings.push(ruby.stdout.trim() || ruby.stderr.trim() || 'Ruby license check failed');

  if (findings.length > 0) {
    console.error('\nDependency license review failed:\n');
    for (const finding of findings) console.error(`  • ${finding}`);
    console.error(
      '\nReview the dependency and document the decision before extending quality/allowed-licenses.json.\n'
    );
    return 1;
  }
  console.log(
    `Dependency licenses are reviewed: ${Object.keys(lock.packages).length - 1} npm packages and all bundled gems.`
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
