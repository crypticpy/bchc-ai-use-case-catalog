/**
 * The schema vocabulary exists twice: once in JavaScript (the configurator and
 * both wizards) and once in Ruby (the Liquid filters that render it, and the
 * front matter validator). Nothing links the two copies, so this file reads the
 * Ruby as text and asserts the lists still match — the same trick
 * theme-preview.test.mjs uses against _includes/theme.html.
 *
 * The Ruby files are never edited from here. If a test fails, one side changed
 * and the other has to follow.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sortByWeight, CARD_SLOTS, CARD_SLOT_TYPES, FIELD_TYPES } from '../../assets/js/configurator/core.js';
// GROUP_PLACEMENTS is not on the core barrel; it is only consumed by the validator.
import { GROUP_PLACEMENTS } from '../../assets/js/configurator/schema-validate.js';

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const schemaFilters = read('../../_plugins/schema_filters.rb');
const frontMatterCheck = read('../../scripts/check_front_matter.rb');

/** `NAME = %w[a b c]` -> ['a', 'b', 'c'] */
function rubyWordArray(source, name) {
  const match = new RegExp(`${name}\\s*=\\s*%w\\[([^\\]]*)\\]`).exec(source);
  assert.ok(match, `${name} is no longer declared as a %w[] literal in the Ruby`);
  return match[1].trim().split(/\s+/);
}

/** `NAME = { "a" => "b", … }.freeze` -> {a: 'b', …} */
function rubyStringHash(source, name) {
  const match = new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\}\\.freeze`).exec(source);
  assert.ok(match, `${name} is no longer declared as a hash literal in the Ruby`);
  return Object.fromEntries([...match[1].matchAll(/"([^"]+)"\s*=>\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
}

test('CARD_SLOTS matches _plugins/schema_filters.rb', () => {
  assert.deepEqual(CARD_SLOTS, rubyWordArray(schemaFilters, 'CARD_SLOTS'));
});

test('GROUP_PLACEMENTS matches _plugins/schema_filters.rb', () => {
  assert.deepEqual(GROUP_PLACEMENTS, rubyWordArray(schemaFilters, 'GROUP_PLACEMENTS'));
});

test('CARD_SLOT_TYPES covers exactly the slots Ruby knows how to render', () => {
  assert.deepEqual(Object.keys(CARD_SLOT_TYPES).sort(), [...CARD_SLOTS].sort());
});

test("Ruby's CARD_DEFAULTS only maps a type to a slot the JS agrees fits it", () => {
  const defaults = rubyStringHash(schemaFilters, 'CARD_DEFAULTS');
  assert.ok(Object.keys(defaults).length > 0);
  for (const [type, slot] of Object.entries(defaults)) {
    assert.ok(FIELD_TYPES.includes(type), `CARD_DEFAULTS names an unknown type "${type}"`);
    assert.ok(CARD_SLOTS.includes(slot), `CARD_DEFAULTS names an unknown slot "${slot}"`);
    assert.ok(
      CARD_SLOT_TYPES[slot].includes(type),
      `card: true on a ${type} field resolves to "${slot}" in Ruby, but CARD_SLOT_TYPES.${slot} rejects it`
    );
  }
});

test('the default weight is 5 on both sides', () => {
  const match = /DEFAULT_WEIGHT\s*=\s*(\d+)/.exec(schemaFilters);
  assert.ok(match, 'DEFAULT_WEIGHT is no longer a literal in the Ruby');
  const rubyDefault = Number(match[1]);
  // A field with no weight sorts as if it had `rubyDefault`.
  const sorted = sortByWeight([
    { key: 'heavier', weight: rubyDefault + 1 },
    { key: 'unweighted' },
    { key: 'lighter', weight: rubyDefault - 1 },
  ]);
  assert.deepEqual(
    sorted.map((field) => field.key),
    ['lighter', 'unweighted', 'heavier']
  );
});

test('scripts/check_front_matter.rb never branches on a type FIELD_TYPES does not know', () => {
  const block = /case type([\s\S]*?)\n {6}end/.exec(frontMatterCheck);
  assert.ok(block, 'the `case type` block moved; update this test');
  const branched = [...block[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
  assert.ok(branched.length >= 6, 'expected the type case to branch on several types');
  for (const type of branched) {
    assert.ok(
      FIELD_TYPES.includes(type),
      `check_front_matter.rb handles "${type}", which is not a FIELD_TYPE`
    );
  }
});
