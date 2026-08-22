import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { copyTree } from '../../scripts/lib/build-tree.mjs';

test('scratch builders exclude local generated evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-build-tree-'));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(source, 'coverage'), { recursive: true });
  fs.writeFileSync(path.join(source, 'coverage', 'summary.json'), '{}');
  fs.writeFileSync(path.join(source, 'performance-report.json'), '{}');
  fs.writeFileSync(path.join(source, 'sbom.cdx.json'), '{}');
  fs.writeFileSync(path.join(source, '_config.quality.yml'), 'baseurl: ""\n');
  fs.writeFileSync(path.join(source, 'kept.txt'), 'kept');

  copyTree(source, target);

  assert.deepEqual(fs.readdirSync(target), ['kept.txt']);
});
