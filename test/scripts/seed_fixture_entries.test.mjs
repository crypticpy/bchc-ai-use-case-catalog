import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as yaml from 'js-yaml';
import sharp from 'sharp';

import {
  fixtureEntry,
  performanceFixturePng,
  seedFixtureEntries,
} from '../../scripts/seed_fixture_entries.mjs';

const schema = {
  entry: { path: 'catalog' },
  fields: [
    { key: 'title', type: 'text' },
    { key: 'review_status', type: 'select', options: ['Current', 'Review', 'Deprecated'] },
    { key: 'areas', type: 'multiselect', options: ['Common', 'Occasional', 'Rare'] },
    { key: 'screenshots', type: 'images' },
    { key: 'body', type: 'markdown' },
  ],
};

function data(markdown) {
  return yaml.load(markdown.slice(4, markdown.indexOf('\n---\n', 4)));
}

test('the performance profile creates common and rare facets plus long-form prose', () => {
  const common = fixtureEntry(schema, 0, { profile: 'performance' });
  const rare = fixtureEntry(schema, 19, { profile: 'performance' });

  assert.equal(data(common.markdown).review_status, 'Current');
  assert.deepEqual(data(common.markdown).areas, ['Common']);
  assert.equal(data(rare.markdown).review_status, 'Deprecated');
  assert.deepEqual(data(rare.markdown).areas, ['Common', 'Occasional', 'Rare']);
  assert.ok(rare.markdown.length > 3000, 'performance prose is not meaningfully long-form');
  assert.throws(() => fixtureEntry(schema, 0, { profile: 'typo' }), /must be matrix or performance/);
});

test('performance images are valid-sized PNG fixtures and vary deterministically', async () => {
  const first = performanceFixturePng(0);
  const again = performanceFixturePng(8);
  const second = performanceFixturePng(1);
  assert.deepEqual(first.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal(first.readUInt32BE(16), 320);
  assert.equal(first.readUInt32BE(20), 180);
  assert.ok(first.byteLength > 5000);
  const metadata = await sharp(first).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 180);
  assert.equal(metadata.channels, 3);
  assert.deepEqual(first, again);
  assert.notDeepEqual(first, second);
});

test('the performance profile writes its richer image while the matrix default stays tiny', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-seed-performance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sizes = [];
  for (const profile of ['matrix', 'performance']) {
    const fixtureRoot = path.join(root, profile);
    fs.mkdirSync(path.join(fixtureRoot, '_data'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, '_data', 'schema.yml'), yaml.dump(schema));
    seedFixtureEntries(fixtureRoot, { count: 1, profile });
    sizes.push(fs.statSync(path.join(fixtureRoot, 'catalog', 'fixture-1', 'screenshots', '01.png')).size);
  }
  assert.ok(sizes[0] < 100);
  assert.ok(sizes[1] > 5000);
  assert.throws(
    () => seedFixtureEntries(root, { count: 0, profile: 'typo' }),
    /must be matrix or performance/
  );
});
