import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

test('the theme and preload paths use the renamed derivative font files', () => {
  const css = read('assets/css/components/base.css');
  const head = read('_includes/head.html');
  for (const [family, file] of [
    ['PHCT Sans', 'PHCTSans-Variable.woff2'],
    ['PHCT Serif', 'PHCTSerif-Variable.woff2'],
  ]) {
    assert.match(css, new RegExp(`font-family: "${family}"`, 'u'));
    assert.match(css, new RegExp(file.replace('.', '\\.'), 'u'));
    assert.match(head, new RegExp(file.replace('.woff2', ''), 'u'));
    assert.equal(fs.existsSync(path.join(ROOT, 'assets/fonts', file)), true);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'assets/fonts/SourceSans3-Variable.woff2')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'assets/fonts/SourceSerif4-Variable.woff2')), false);
});

test('Liquid keeps protected pre-rename theme files compatible', () => {
  const head = read('_includes/head.html');
  const theme = read('_includes/theme.html');
  for (const legacy of ['Source Sans 3', 'Source Serif 4']) {
    assert.match(head, new RegExp(legacy, 'u'));
    assert.match(theme, new RegExp(legacy, 'u'));
  }
});
