import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installArgs, npmVersionFromSpec } from '../../scripts/install_exact_npm.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the package-manager declaration must be one exact npm version', () => {
  assert.equal(npmVersionFromSpec('npm@10.9.4'), '10.9.4');
  for (const moving of ['npm@latest', 'npm@^10.9.4', 'pnpm@10.9.4', '10.9.4', '']) {
    assert.throws(() => npmVersionFromSpec(moving), /exact npm@x\.y\.z/);
  }
});

test('npm installation disables unrelated audit and funding network work', () => {
  assert.deepEqual(installArgs('npm@10.9.4'), [
    'install',
    '--global',
    '--no-audit',
    '--no-fund',
    'npm@10.9.4',
  ]);
});

test('the updater selects each checkout’s npm before installing dependencies', () => {
  const source = fs.readFileSync(path.join(ROOT, '.github/workflows/update-phct.yml'), 'utf8');
  const installs = [...source.matchAll(/^\s+(?:run:\s*)?npm ci\b/gmu)];
  assert.equal(installs.length, 2);
  for (const install of installs) {
    const setup = source.lastIndexOf('actions/setup-node@', install.index);
    const exact = source.lastIndexOf('node scripts/install_exact_npm.mjs', install.index);
    assert.ok(setup >= 0 && exact > setup);
  }
});
