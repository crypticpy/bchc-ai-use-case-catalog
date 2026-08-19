/**
 * The build-free half of the theme gate: `npm run validate` reads
 * `_data/theme.yml` and refuses a palette that fails WCAG AA
 * (scripts/validate.mjs). These tests fix the two things that gate is only
 * useful if they hold — that the shipped palette passes, and that every palette
 * the wizard can *write* passes — so a preset can never hand a fork a theme its
 * own validator rejects.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

import { THEME_CONTRAST_PAIRS, checkThemeContrast } from '../../assets/js/configurator/color.js';
import { presets } from '../../assets/js/configurator/presets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Failures at `level`, as one message naming each pair and its measured ratio. */
function failures(colors, level) {
  return checkThemeContrast(colors)
    .filter((result) => !result.ok && result.level === level)
    .map(
      (result) =>
        `${result.fg} on ${result.bg} (${result.what}) is ` +
        `${result.ratio === null ? 'unparseable' : `${result.ratio.toFixed(2)}:1`}, needs ${result.min}:1`
    );
}

test('the shipped _data/theme.yml passes every pair', () => {
  const colors = yaml.load(fs.readFileSync(path.join(ROOT, '_data', 'theme.yml'), 'utf8'))?.colors;
  assert.ok(colors, '_data/theme.yml has no `colors` block');
  assert.deepEqual(failures(colors, 'error'), []);
  assert.deepEqual(failures(colors, 'warn'), []);
});

for (const preset of presets) {
  test(`${preset.id}: the palette passes the same gate validate.mjs applies`, () => {
    assert.deepEqual(failures(preset.config.theme.colors, 'error'), []);
  });
}

test('every pair names colours the presets actually define', () => {
  // A pair naming a key no palette has would report `null` forever — a check
  // that can only fail is worse than no check.
  const defined = new Set(presets.flatMap((preset) => Object.keys(preset.config.theme.colors)));
  const missing = THEME_CONTRAST_PAIRS.flatMap((pair) => [pair.fg, pair.bg])
    .filter((name) => !name.startsWith('#') && !defined.has(name))
    .sort();
  assert.deepEqual([...new Set(missing)], []);
});

test('checkThemeContrast reports an unreadable colour as a failure, not a pass', () => {
  // `hex_to_rgb` (_plugins/theme_filters.rb) turns anything it cannot parse into
  // "0 0 0", so a typo paints the site black instead of erroring. Skipping the
  // pair would let that through.
  const results = checkThemeContrast({ ink: 'blue', card: '#FFFFFF' });
  const pair = results.find((result) => result.fg === 'ink' && result.bg === 'card');
  assert.equal(pair.ratio, null);
  assert.equal(pair.ok, false);
  assert.equal(
    checkThemeContrast({}).every((result) => result.ok === false),
    true
  );
});
