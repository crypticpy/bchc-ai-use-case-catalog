import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

test('the documented verify command exists and references only available entrypoints', () => {
  const verify = packageJson.scripts?.verify;
  assert.ok(verify, 'package.json has no scripts.verify command');

  for (const match of verify.matchAll(/\bnpm run ([\w:-]+)/gu)) {
    assert.ok(packageJson.scripts[match[1]], `scripts.verify references missing npm script ${match[1]}`);
  }
  for (const match of verify.matchAll(/\bnode ([\w./-]+\.mjs)\b/gu)) {
    assert.ok(fs.existsSync(path.join(ROOT, match[1])), `scripts.verify references missing ${match[1]}`);
  }
});
