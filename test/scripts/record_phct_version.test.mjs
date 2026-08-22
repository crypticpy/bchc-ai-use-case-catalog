import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVersionLock, parseArgs } from '../../scripts/record_phct_version.mjs';

test('version lock records one exact release and commit', () => {
  assert.deepEqual(
    buildVersionLock({
      release: 'v1.9.0-rc.1',
      packageVersion: '1.9.0-rc.1',
      commit: 'a'.repeat(40),
      date: '2026-08-22',
      repository: 'https://github.com/crypticpy/phct',
    }),
    {
      schema_version: 1,
      source_repository: 'https://github.com/crypticpy/phct',
      release: 'v1.9.0-rc.1',
      version: '1.9.0-rc.1',
      commit: 'a'.repeat(40),
      recorded_at: '2026-08-22',
    }
  );
});

test('version lock rejects moving or abbreviated references', () => {
  assert.throws(
    () =>
      buildVersionLock({
        release: 'main',
        packageVersion: '1.9.0',
        commit: 'abc1234',
        date: 'today',
        repository: 'https://github.com/crypticpy/phct',
      }),
    /release main must match.*full 40-character.*YYYY-MM-DD/
  );
});

test('record arguments accept separate and inline values', () => {
  assert.deepEqual(parseArgs(['--release=v2.0.0', '--commit', 'b'.repeat(40), '--date', '2026-09-01']), {
    release: 'v2.0.0',
    commit: 'b'.repeat(40),
    date: '2026-09-01',
  });
});
