import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsYaml from 'js-yaml';

import { presets } from '../../assets/js/configurator/presets.js';
import { CARD_SLOTS, checkSchema } from '../../assets/js/configurator/schema-validate.js';
import { renderFiles } from '../../assets/js/configurator/render-files.js';
import { applyAnswers, answersFromConfig } from '../../assets/js/configurator/answers.js';
import { checkThemeContrast } from '../../assets/js/configurator/color.js';

const EXPECTED_FILES = [
  '_data/site.yml',
  '_data/theme.yml',
  '_data/schema.yml',
  '_data/navigation.yml',
  '_config.yml',
  '.github/ISSUE_TEMPLATE/new-entry.yml',
];

for (const preset of presets) {
  test(`${preset.id}: the schema is valid`, () => {
    const result = checkSchema(preset.config.schema);
    assert.equal(result.ok, true, result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  });

  test(`${preset.id}: every file renders and parses as YAML`, () => {
    const files = renderFiles(applyAnswers(preset.config, {}), { url: '', baseurl: '' });
    assert.deepEqual(Object.keys(files), EXPECTED_FILES);
    for (const [name, contents] of Object.entries(files)) {
      assert.doesNotThrow(() => jsYaml.load(contents), `${name} parses`);
      assert.ok(contents.endsWith('\n'), `${name} ends with a newline`);
    }
  });

  test(`${preset.id}: a rendered schema still validates after the YAML round trip`, () => {
    const files = renderFiles(applyAnswers(preset.config, {}));
    const reparsed = jsYaml.load(files['_data/schema.yml']);
    const result = checkSchema(reparsed);
    assert.equal(result.ok, true, result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    assert.deepEqual(reparsed, preset.config.schema, 'nothing is lost in the round trip');
  });

  test(`${preset.id}: the submission page promises a turnaround`, () => {
    // The last step of "what happens next" is a promise the maintainers keep,
    // so every preset has to name one rather than fall back to a vague default.
    const turnaround = preset.config.site.submit?.turnaround;
    assert.equal(typeof turnaround, 'string');
    assert.ok(turnaround.trim() !== '', `${preset.id} says nothing about turnaround`);
  });

  test(`${preset.id}: the schema uses the v2 vocabulary`, () => {
    const schema = preset.config.schema;
    assert.ok(Array.isArray(schema.groups) && schema.groups.length > 0, 'declares groups');
    for (const field of schema.fields) {
      assert.ok(field.group, `${field.key} belongs to a group`);
      assert.ok(Number.isInteger(field.weight), `${field.key} has a weight`);
      assert.ok(field.prompt, `${field.key} asks a question`);
    }
    for (const group of schema.groups) {
      if (group.placement === undefined) continue;
      assert.ok(['main', 'rail'].includes(group.placement), `group ${group.key} has a legal placement`);
    }
    // Every preset needs at least one rail group, or its entry pages render an
    // empty sidebar (the bug `placement` replaced a hardcoded 'reuse,contact').
    assert.ok(
      schema.groups.some((group) => group.placement === 'rail'),
      'at least one group renders in the entry-page rail'
    );
    const carded = schema.fields.filter((field) => typeof field.card === 'string');
    assert.ok(carded.length > 0, 'at least one field claims a card slot');
    for (const field of carded) {
      assert.ok(CARD_SLOTS.includes(field.card), `${field.key}: "${field.card}" is a real card slot`);
    }
  });

  test(`${preset.id}: option_meta stays inside the declared options`, () => {
    for (const field of preset.config.schema.fields) {
      if (!field.option_meta) continue;
      for (const option of Object.keys(field.option_meta)) {
        assert.ok(field.options.includes(option), `${field.key}: "${option}" is a real option`);
      }
    }
  });

  test(`${preset.id}: the palette meets WCAG AA`, () => {
    // The pair list lives in color.js, where the wizard's own contrast panel
    // reads it: a preset is held to exactly what the wizard would flag.
    for (const pair of checkThemeContrast(preset.config.theme.colors)) {
      if (pair.level !== 'error') continue;
      assert.ok(
        pair.ok,
        `${pair.what}: ${pair.fg} on ${pair.bg} is ${
          pair.ratio === null ? 'unparseable' : `${pair.ratio.toFixed(2)}:1`
        }, needs ${pair.min}:1`
      );
    }
  });

  test(`${preset.id}: answersFromConfig seeds every colour question`, () => {
    const answers = answersFromConfig(preset.config);
    for (const key of ['primary', 'primaryDark', 'secondary', 'accent', 'lineStrong', 'warn']) {
      assert.match(answers[key], /^#[0-9A-Fa-f]{6}$/, `${key} is a hex colour`);
    }
    assert.equal(answers.siteName, preset.config.site.name);
    assert.equal(answers.entrySingular, preset.config.schema.entry.singular);
  });
}

test('presets do not share mutable state', () => {
  const [first] = presets;
  const before = JSON.stringify(first.config.schema.fields[0]);
  applyAnswers(first.config, { siteName: 'Something else', fields: [] });
  assert.equal(JSON.stringify(first.config.schema.fields[0]), before);
});
