import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  discoverVendoredPaths,
  npmLicenseFindings,
  vendoredAssetFindings,
} from '../../scripts/check_licenses.mjs';

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

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const NOTICE = `# Third-party notices

shared license marker

## Example library 1.0.0

- Included file: \`assets/example.js\`
- License: MIT

example copyright

## Example font 2.0.0

- Included file: \`assets/example.woff2\`
- License: SIL Open Font License 1.1

font copyright
`;

function vendoredManifest() {
  return {
    schema_version: 1,
    notice_file: 'THIRD_PARTY_NOTICES.md',
    required_notice_markers: ['shared license marker'],
    assets: [
      {
        name: 'Example library',
        version: '1.0.0',
        license: 'MIT',
        notice_heading: '## Example library 1.0.0',
        notice_markers: ['assets/example.js', 'example copyright', 'License: MIT'],
        files: [{ path: 'assets/example.js', sha256: HASH_A }],
      },
      {
        name: 'Example font',
        version: '2.0.0',
        license: 'OFL-1.1',
        notice_heading: '## Example font 2.0.0',
        notice_markers: ['assets/example.woff2', 'font copyright', 'SIL Open Font License 1.1'],
        files: [{ path: 'assets/example.woff2', sha256: HASH_B }],
      },
    ],
  };
}

function review(
  manifest = vendoredManifest(),
  notice = NOTICE,
  discoveredPaths = new Set(['assets/example.js', 'assets/example.woff2'])
) {
  return vendoredAssetFindings(
    manifest,
    notice,
    new Map([
      ['assets/example.js', HASH_A],
      ['assets/example.woff2', HASH_B],
    ]),
    new Set(['MIT', 'OFL-1.1']),
    discoveredPaths
  );
}

test('vendored asset review accepts an inventoried, attributed, digest-matched tree', () => {
  assert.deepEqual(review(), []);
});

test('vendored asset review requires markers inside the matching notice section', () => {
  const notice = NOTICE.replace('example copyright\n\n## Example font', '## Example font');
  assert.deepEqual(review(vendoredManifest(), notice), [
    'vendored asset 1: notice section is missing "example copyright"',
  ]);
});

test('vendored asset review rejects unsafe and duplicate paths', () => {
  const manifest = vendoredManifest();
  manifest.assets[0].files[0].path = '../outside.js';
  manifest.assets[1].files.push({ path: 'assets/example.woff2', sha256: HASH_B });
  assert.deepEqual(review(manifest), [
    'vendored asset 1 file 1: path must be a safe repository-relative path',
    'vendored asset 2 file 2: duplicate path assets/example.woff2',
    'vendored inventory: unmanifested file assets/example.js',
  ]);
});

test('vendored asset review rejects unapproved licenses and digest drift', () => {
  const manifest = vendoredManifest();
  manifest.assets[0].license = 'UNKNOWN';
  manifest.assets[1].files[0].sha256 = HASH_A;
  assert.deepEqual(review(manifest), [
    'vendored asset 1: unreviewed license UNKNOWN',
    `vendored asset 2 file 1: SHA-256 mismatch for assets/example.woff2; expected ${HASH_A}, got ${HASH_B}`,
  ]);
});

test('vendored asset review rejects files omitted from the manifest', () => {
  assert.deepEqual(
    review(
      vendoredManifest(),
      NOTICE,
      new Set(['assets/example.js', 'assets/example.woff2', 'assets/NewFont.woff2'])
    ),
    ['vendored inventory: unmanifested file assets/NewFont.woff2']
  );
});

test('vendored location discovery recursively finds copied files and ignores authored source', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-vendored-assets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets/fonts/nested'), { recursive: true });
  fs.mkdirSync(path.join(root, 'assets/js/lib'), { recursive: true });
  fs.mkdirSync(path.join(root, '_includes'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets/fonts/nested/NewFont.woff2'), 'font');
  fs.writeFileSync(path.join(root, 'assets/js/lib/vendor.min.js'), 'vendor');
  fs.writeFileSync(path.join(root, 'assets/js/lib/authored.js'), 'authored');
  fs.writeFileSync(path.join(root, '_includes/icon.html'), 'icons');

  const result = discoverVendoredPaths(root);
  assert.deepEqual(result.findings, []);
  assert.deepEqual([...result.paths].sort(), [
    '_includes/icon.html',
    'assets/fonts/nested/NewFont.woff2',
    'assets/js/lib/vendor.min.js',
  ]);
});
