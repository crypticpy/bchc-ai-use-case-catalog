import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import * as yaml from 'js-yaml';

import { frontMatter, pair, quote, scalar } from '../../scripts/lib/yaml.mjs';

test('scalar leaves simple text plain and quotes everything risky', () => {
  assert.equal(scalar('Pilot'), 'Pilot');
  assert.equal(scalar('Chicago Department of Public Health'), 'Chicago Department of Public Health');
  assert.equal(scalar(''), '""');
  assert.equal(scalar('true'), '"true"');
  assert.equal(scalar('12'), '"12"');
  assert.equal(scalar('- leading dash'), '"- leading dash"');
  assert.equal(scalar('key: value'), '"key: value"');
  assert.equal(scalar('trailing '), '"trailing "');
  assert.equal(scalar(7), '7');
  assert.equal(scalar(true), 'true');
  assert.equal(scalar(null), '""');
});

test('quote escapes backslashes, quotes and control characters', () => {
  assert.equal(quote('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
});

test('pair renders block lists of scalars and of maps', () => {
  assert.equal(pair('area', []), 'area: []');
  assert.equal(pair('area', ['Epi', 'Data']), 'area:\n  - Epi\n  - Data');
  assert.equal(
    pair('links', [{ label: 'Docs', url: 'https://e.org' }]),
    'links:\n  - label: Docs\n    url: "https://e.org"'
  );
});

test('pair renders multi-line prose as a literal block scalar', () => {
  const rendered = pair('summary', 'first line\nsecond line   ');
  assert.equal(rendered, 'summary: |-\n  first line\n  second line');
});

test('frontMatter round-trips through a YAML parser', () => {
  const text = frontMatter([
    ['layout', 'entry'],
    ['title', 'A: tricky "title" — with #hash'],
    ['slug', 'a-tricky-title'],
    ['published', '2026-08-17'],
    ['featured', false],
    ['thumbnail', ''],
    ['area', ['Epidemiology & surveillance', 'Data & informatics']],
    ['screenshots', [{ src: '/catalog/a/screenshots/01.png', alt: 'Queue view' }]],
    ['resources', [{ label: 'Report', url: 'https://e.org/r.pdf' }]],
    ['impact', ''],
    ['count', 12],
    ['story', 'line one\nline two'],
  ]);

  const parsed = yaml.load(text.replace(/^---\n/, '').replace(/\n---\n$/, ''));
  assert.equal(parsed.title, 'A: tricky "title" — with #hash');
  assert.equal(parsed.published, '2026-08-17');
  assert.equal(parsed.featured, false);
  assert.deepEqual(parsed.area, ['Epidemiology & surveillance', 'Data & informatics']);
  assert.deepEqual(parsed.screenshots, [{ src: '/catalog/a/screenshots/01.png', alt: 'Queue view' }]);
  assert.deepEqual(parsed.resources, [{ label: 'Report', url: 'https://e.org/r.pdf' }]);
  assert.equal(parsed.impact, '');
  assert.equal(parsed.count, 12);
  assert.equal(parsed.story, 'line one\nline two');
  assert.match(text, /^---\n/);
  assert.match(text, /\n---\n$/);
});

/** ESC, NUL, BEL, DEL, a C1 control, LINE SEPARATOR, PARAGRAPH SEPARATOR, NEL. */
const CONTROLS = [0x1b, 0x00, 0x07, 0x7f, 0x9f, 0x2028, 0x2029, 0x85];
const TAB = String.fromCharCode(9);
const CRLF = String.fromCharCode(13, 10);

/**
 * Values a YAML loader is tempted to retype, restructure or mangle. Front
 * matter is assembled from an issue body, so each of these is something a
 * submitter can actually type into the form.
 */
const NASTY = [
  // YAML 1.1 scalars that are not strings
  '0x1F',
  '0o17',
  '1_000',
  '12:30',
  '1:2:3',
  '.inf',
  '-.inf',
  '.nan',
  '~',
  'null',
  'Null',
  'NULL',
  'y',
  'Y',
  'n',
  'N',
  'yes',
  'No',
  'on',
  'OFF',
  'true',
  'False',
  '007',
  '1e3',
  '2026-08-17',
  // structure characters
  '# comment',
  '- item',
  'key: value',
  '? key',
  '*alias',
  '&anchor',
  '!!str x',
  '%YAML 1.2',
  '{ a: 1 }',
  '[ 1, 2 ]',
  '| block',
  '> fold',
  "'single'",
  '"double"',
  '@reserved',
  '`backtick',
  // whitespace the loader would eat, and backslashes
  'trailing space ',
  ' leading space',
  `tab${TAB}here`,
  'a\\b\\\\c',
  // control characters and the Unicode line breaks
  ...CONTROLS.map((code) => `ctrl${String.fromCodePoint(code)}here`),
  `crlf${CRLF}here`,
  // and something entirely ordinary, which should stay plain
  'Chicago Department of Public Health',
];

const NASTY_KEYS = NASTY.map((_, i) => `f${String(i).padStart(2, '0')}`);
const NASTY_FRONT_MATTER = frontMatter([
  ...NASTY.map((value, i) => [NASTY_KEYS[i], value]),
  ['list', NASTY.slice(0, 12)],
  [
    'maps',
    [
      { label: '.inf', url: 'https://e.org/?a=1&b=2' },
      { label: 'on', url: 'x: y' },
    ],
  ],
]);

/** The same document without the `---` fences. */
const NASTY_BODY = NASTY_FRONT_MATTER.replace(/^---\n/, '').replace(/\n---\n$/, '');

/** Any line break inside a scalar is normalised by every YAML loader. */
const expected = (value) => value.replace(/\r\n?/g, '\n');

test('the emitter quotes every hostile value and leaves plain prose plain', () => {
  // Everything is either double-quoted or (for the multi-line value) a block
  // scalar; the one prose value is the only thing emitted plain.
  const plain = NASTY_BODY.split('\n').filter((line) => /^f\d\d: (?!["|])/.test(line));
  const proseKey = NASTY_KEYS[NASTY.length - 1];
  assert.deepEqual(plain, [`${proseKey}: Chicago Department of Public Health`]);
});

test('every hostile value survives a round trip through the yaml package (YAML 1.2)', async () => {
  const { parse } = await import('yaml');
  const parsed = parse(NASTY_BODY);
  NASTY.forEach((value, i) => {
    assert.equal(parsed[NASTY_KEYS[i]], expected(value), `${NASTY_KEYS[i]} = ${JSON.stringify(value)}`);
  });
  assert.deepEqual(parsed.list, NASTY.slice(0, 12).map(expected));
  assert.deepEqual(parsed.maps, [
    { label: '.inf', url: 'https://e.org/?a=1&b=2' },
    { label: 'on', url: 'x: y' },
  ]);
});

test('every hostile value survives a round trip through Ruby Psych (YAML 1.1)', () => {
  const ruby = spawnSync(
    'ruby',
    ['-ryaml', '-rjson', '-e', 'print JSON.generate(YAML.safe_load(STDIN.read))'],
    { input: NASTY_BODY, encoding: 'utf8' }
  );
  if (ruby.error) {
    // Ruby is not on PATH everywhere; the YAML 1.2 round trip above still runs.
    assert.equal(ruby.error.code, 'ENOENT', String(ruby.error));
    return;
  }
  assert.equal(ruby.status, 0, ruby.stderr);
  const parsed = JSON.parse(ruby.stdout);
  NASTY.forEach((value, i) => {
    assert.equal(parsed[NASTY_KEYS[i]], expected(value), `${NASTY_KEYS[i]} = ${JSON.stringify(value)}`);
  });
  assert.deepEqual(parsed.list, NASTY.slice(0, 12).map(expected));
  assert.deepEqual(parsed.maps, [
    { label: '.inf', url: 'https://e.org/?a=1&b=2' },
    { label: 'on', url: 'x: y' },
  ]);
});

test('prose blocks, but a control character forces a quoted scalar instead', () => {
  assert.match(pair('story', 'line one\nline two'), /^story: \|-\n/);
  const rendered = pair('story', `line one\nline${String.fromCharCode(27)}two`);
  assert.equal(rendered, 'story: "line one\\nline\\etwo"');
  assert.equal(yaml.load(rendered).story, `line one\nline${String.fromCharCode(27)}two`);
});
