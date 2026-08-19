import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as jsYaml from 'js-yaml';

import { renderDefaults, OUTPUT_PATH } from '../../scripts/build_defaults.mjs';
import { defaultConfig, DEFAULT_JEKYLL_CONFIG } from '../../assets/js/configurator/default-config.js';
import { presets, getPreset } from '../../assets/js/configurator/presets.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const readYaml = (relative) => jsYaml.load(fs.readFileSync(path.join(ROOT, relative), 'utf8'));

test('defaults.generated.js is in sync with the _data files', () => {
  const committed = fs.readFileSync(path.join(ROOT, OUTPUT_PATH), 'utf8');
  assert.equal(
    renderDefaults(ROOT),
    committed,
    `${OUTPUT_PATH} is stale. Run \`npm run generate\` and commit the result.`
  );
});

test('defaultConfig() mirrors every _data file it is built from', () => {
  const config = defaultConfig();
  assert.deepEqual(config.site, readYaml('_data/site.yml'));
  assert.deepEqual(config.theme, readYaml('_data/theme.yml'));
  assert.deepEqual(config.schema, readYaml('_data/schema.yml'));
  assert.deepEqual(config.navigation, readYaml('_data/navigation.yml'));
});

test('defaultConfig() hands out a fresh copy each time', () => {
  const first = defaultConfig();
  first.site.name = 'Mutated';
  first.schema.fields.length = 0;
  const second = defaultConfig();
  assert.notEqual(second.site.name, 'Mutated');
  assert.ok(second.schema.fields.length > 0);
});

test('the compiled _config.yml is the repository one', () => {
  assert.equal(DEFAULT_JEKYLL_CONFIG, fs.readFileSync(path.join(ROOT, '_config.yml'), 'utf8'));
});

test('the theme carries the v2 tokens', () => {
  const { colors } = defaultConfig().theme;
  for (const token of [
    'primary',
    'primary_dark',
    'secondary',
    'accent',
    'ink',
    'muted',
    'line',
    'line_strong',
    'surface',
    'card',
    'on_dark',
    'warn',
  ]) {
    assert.match(colors[token] ?? '', /^#[0-9A-Fa-f]{6}$/, `theme.colors.${token}`);
  }
});

test('the ai-use-cases preset is exactly _data/schema.yml', () => {
  const preset = getPreset('ai-use-cases');
  assert.ok(preset, 'the ai-use-cases preset exists');
  assert.deepEqual(preset.config.schema, readYaml('_data/schema.yml'));
  assert.deepEqual(preset.config.site, readYaml('_data/site.yml'));
  assert.deepEqual(preset.config.theme, readYaml('_data/theme.yml'));
});

test('every preset has a unique id, a name and a description', () => {
  const ids = presets.map((preset) => preset.id);
  assert.deepEqual([...new Set(ids)], ids);
  assert.deepEqual(ids, ['ai-use-cases', 'cohort-portal', 'resource-library', 'blank']);
  for (const preset of presets) {
    assert.ok(preset.name.trim(), `${preset.id} has a name`);
    assert.ok(preset.description.trim(), `${preset.id} has a description`);
    assert.ok(preset.config.site && preset.config.theme && preset.config.schema, `${preset.id} is complete`);
  }
});
