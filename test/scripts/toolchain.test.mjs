import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expectedToolchain, parseToolVersions } from '../../scripts/lib/toolchain.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('all package-manager and runtime pins are exact versions', () => {
  const versions = expectedToolchain(ROOT);
  for (const [name, version] of Object.entries(versions)) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is not exact: ${version}`);
  }
});

test('tool version output is normalized for comparison', () => {
  assert.deepEqual(
    parseToolVersions({
      node: 'v22.22.2',
      npm: '10.9.4',
      ruby: 'ruby 3.3.11 (2025-12-01 revision abc) [arm64-darwin]',
      bundler: 'Bundler version 4.0.11',
    }),
    { node: '22.22.2', npm: '10.9.4', ruby: '3.3.11', bundler: '4.0.11' }
  );
  assert.equal(parseToolVersions({ bundler: '4.0.11' }).bundler, '4.0.11');
});
