import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSnapshot, compareSnapshots } from '../../scripts/protected_checksums.mjs';

const rules = [
  { pattern: '_data/**', owned: true },
  { pattern: '_data/template/**', owned: false },
  { pattern: 'catalog/**', owned: true },
];

test('snapshot includes protected files and honors nested template exceptions', () => {
  const contents = {
    '_data/site.yml': 'title: BCHC\n',
    '_data/template/defaults.yml': 'parent: true\n',
    'catalog/one/index.md': '---\ntitle: One\n---\n',
    'scripts/build.mjs': 'parent code\n',
  };
  const result = buildSnapshot(
    Object.keys(contents),
    (file) => contents[file],
    ['_data/**', 'catalog/**'],
    rules
  );
  assert.deepEqual(Object.keys(result.files), ['_data/site.yml', 'catalog/one/index.md']);
});

test('comparison reports additions, removals, and byte changes', () => {
  const before = { files: { 'a.md': 'one', 'b.md': 'two' } };
  const after = { files: { 'b.md': 'changed', 'c.md': 'three' } };
  assert.deepEqual(compareSnapshots(before, after), [
    { file: 'a.md', status: 'removed' },
    { file: 'b.md', status: 'changed' },
    { file: 'c.md', status: 'added' },
  ]);
});
