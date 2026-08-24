#!/usr/bin/env node
/** Run Jekyll doctor and a production build with deterministic local URL settings. */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-jekyll-'));
const override = path.join(temp, 'release.yml');
fs.writeFileSync(override, 'url: "https://phct.invalid"\nbaseurl: ""\n', 'utf8');

try {
  for (const [label, args] of [
    ['Jekyll doctor', ['exec', 'jekyll', 'doctor', '--config', `_config.yml,${override}`]],
    [
      'Jekyll production build',
      ['exec', 'jekyll', 'build', '--destination', '_site', '--config', `_config.yml,${override}`],
    ],
  ]) {
    console.log(`\n${label}\n`);
    const result = spawnSync('bundle', args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, JEKYLL_ENV: 'production' },
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
