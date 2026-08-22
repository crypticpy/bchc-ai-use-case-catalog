import test from 'node:test';
import assert from 'node:assert/strict';

import { npmLicenseFindings } from '../../scripts/check_licenses.mjs';

test('npm license review fails closed on missing and new values', () => {
  const lock = {
    packages: {
      '': {},
      'node_modules/known': { license: 'MIT' },
      'node_modules/new': { license: 'NEW-LICENSE' },
      'node_modules/missing': {},
    },
  };
  assert.deepEqual(npmLicenseFindings(lock, new Set(['MIT'])), [
    'node_modules/new: unreviewed license NEW-LICENSE',
    'node_modules/missing: missing license metadata',
  ]);
});
