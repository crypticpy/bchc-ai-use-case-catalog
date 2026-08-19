import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsYaml from 'js-yaml';

import { toYaml, quoteYamlString } from '../../assets/js/configurator/yaml-emit.js';

/** Parse with a second implementation when it is installed, for cross-checking. */
const yamlParsers = [['js-yaml', (text) => jsYaml.load(text)]];
try {
  const { parse } = await import('yaml');
  yamlParsers.push(['yaml', (text) => parse(text)]);
} catch {
  /* optional second opinion */
}

/** emit -> parse -> deepEqual, through every available parser. */
function roundTrip(value, message) {
  const text = toYaml(value);
  for (const [name, parse] of yamlParsers) {
    assert.deepEqual(parse(text), value, `${message} (${name})\n--- emitted ---\n${text}`);
  }
  return text;
}

test('round-trips scalars that YAML would otherwise retype', () => {
  roundTrip(
    {
      yes: 'true',
      no: 'false',
      nulled: 'null',
      tilde: '~',
      year: '2024',
      version: '1.0',
      negative: '-3',
      hex: '0x1F',
      norwegian: 'NO',
      empty: '',
      spaced: '  padded  ',
      time: '2024-01-02',
      real_bool: true,
      real_number: 12,
      real_null: null,
    },
    'scalar quoting'
  );
});

test('round-trips strings full of YAML punctuation', () => {
  roundTrip(
    {
      colon: 'Key: value',
      hash: 'C# and F#',
      dash: '- not a list',
      brackets: '[not, a, flow]',
      braces: '{not: a map}',
      quotes: `She said "hi" and 'bye'`,
      pipe: 'a | b',
      angle: '> quoted',
      bang: '!important',
      percent: '100% done',
      at: '@mention',
      backtick: '`code`',
      comma: 'Finance, procurement & contracts',
      question: 'Where is it today?',
      backslash: 'C:\\path\\to',
      tab: 'before\tafter',
    },
    'punctuation quoting'
  );
});

test('round-trips multi-line strings as block scalars', () => {
  const text = roundTrip(
    { body: '## Problem\n\n## Approach\n\n## Results\n', single: 'no newline here' },
    'block scalars'
  );
  assert.match(text, /^body: \|$/m, 'a clean multi-line string uses a block scalar');
});

test('round-trips multi-line strings that block scalars would mangle', () => {
  roundTrip({ trailing: 'line one  \nline two', crlf: 'one\r\ntwo', noEnd: 'a\nb' }, 'awkward multi-line');
});

test('round-trips nested structures, including arrays of objects', () => {
  roundTrip(
    {
      entry: { singular: 'Use case', plural: 'Use cases' },
      groups: [
        { key: 'about', title: 'About', description: 'What it is.' },
        { key: 'data', title: 'Data & access' },
      ],
      fields: [
        {
          key: 'area',
          type: 'multiselect',
          options: ['Epidemiology & surveillance', 'Policy & planning'],
          option_meta: { 'Policy & planning': { short: 'Policy', tone: 'warn' } },
          nested: [[1, 2], []],
        },
      ],
      emptyList: [],
      emptyMap: {},
    },
    'nested structures'
  );
});

test('round-trips a top-level sequence', () => {
  roundTrip(
    [
      { label: 'Home', url: '/' },
      { label: 'Catalog', url: '/catalog/', module: 'catalog' },
    ],
    'top-level sequence'
  );
});

test('drops undefined values rather than emitting them', () => {
  const text = toYaml({ kept: 'plain', dropped: undefined });
  assert.equal(text, 'kept: plain\n');
});

test('writes the header as a comment block', () => {
  const text = toYaml({ a: 1 }, { header: 'First line\n\nThird line' });
  assert.equal(text, '# First line\n#\n# Third line\n\na: 1\n');
  assert.deepEqual(jsYaml.load(text), { a: 1 });
});

test('quoteYamlString always double-quotes and escapes', () => {
  assert.equal(quoteYamlString('plain'), '"plain"');
  assert.equal(quoteYamlString('say "hi"'), '"say \\"hi\\""');
  assert.equal(quoteYamlString(undefined), '""');
});
