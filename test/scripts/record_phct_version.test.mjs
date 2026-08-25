import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVersionLock, parseArgs, preservedDate } from '../../scripts/record_phct_version.mjs';

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

test('re-recording an unchanged release keeps the original recorded_at', () => {
  const previous = {
    release: 'v1.9.0-rc.1',
    commit: 'a'.repeat(40),
    recorded_at: '2026-08-22',
  };
  // Same release + commit → the lock must stay byte-identical, so the
  // updater's "already up to date" branch sees a clean tree on re-runs.
  assert.equal(preservedDate(previous, 'v1.9.0-rc.1', 'a'.repeat(40)), '2026-08-22');
  // A new release or a moved commit records fresh.
  assert.equal(preservedDate(previous, 'v1.9.0-rc.2', 'a'.repeat(40)), undefined);
  assert.equal(preservedDate(previous, 'v1.9.0-rc.1', 'b'.repeat(40)), undefined);
  // A missing or unreadable previous lock records fresh too.
  assert.equal(preservedDate(undefined, 'v1.9.0-rc.1', 'a'.repeat(40)), undefined);
  assert.equal(preservedDate(null, 'v1.9.0-rc.1', 'a'.repeat(40)), undefined);
});

test('record arguments accept separate and inline values', () => {
  assert.deepEqual(parseArgs(['--release=v2.0.0', '--commit', 'b'.repeat(40), '--date', '2026-09-01']), {
    release: 'v2.0.0',
    commit: 'b'.repeat(40),
    date: '2026-09-01',
  });
});
