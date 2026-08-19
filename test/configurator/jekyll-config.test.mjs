import test from 'node:test';
import assert from 'node:assert/strict';
import * as jsYaml from 'js-yaml';

import { jekyllConfig, patchJekyllConfig } from '../../assets/js/configurator/jekyll-config.js';
import { defaultConfig, DEFAULT_JEKYLL_CONFIG } from '../../assets/js/configurator/default-config.js';

const site = { name: 'Resource Library', description: 'Guides and toolkits.' };

test('jekyllConfig substitutes the four values the wizard owns', () => {
  const text = jekyllConfig(site, { url: 'https://example.org', baseurl: '/library' });
  const doc = jsYaml.load(text);
  assert.equal(doc.title, 'Resource Library');
  assert.equal(doc.description, 'Guides and toolkits.');
  assert.equal(doc.url, 'https://example.org');
  assert.equal(doc.baseurl, '/library');
});

test('jekyllConfig leaves every build setting alone', () => {
  const shipped = jsYaml.load(DEFAULT_JEKYLL_CONFIG);
  const doc = jsYaml.load(jekyllConfig(site));
  for (const key of [
    'theme',
    'timezone',
    'markdown',
    'permalink',
    'future',
    'exclude',
    'defaults',
    'plugins',
    'sass',
  ]) {
    assert.deepEqual(doc[key], shipped[key], key);
  }
  assert.match(jekyllConfig(site), /^# Jekyll configuration\./, 'the comment header survives');
});

test('regenerating the shipped site reproduces _config.yml', () => {
  const { site: shippedSite } = defaultConfig();
  assert.equal(jekyllConfig(shippedSite), DEFAULT_JEKYLL_CONFIG);
});

test('patchJekyllConfig rewrites only the lines it owns', () => {
  const existing = ['title: "Old"', 'description: "Old too"', 'url: ""', 'custom_setting: keep-me', ''].join(
    '\n'
  );
  const { text, changed } = patchJekyllConfig(existing, site);
  assert.deepEqual(changed, ['title', 'description']);
  assert.match(text, /custom_setting: keep-me/);
  assert.match(text, /^title: "Resource Library"$/m);
  assert.match(text, /^url: ""$/m, 'url is untouched when not passed');
});

test('patchJekyllConfig appends a missing key rather than dropping it', () => {
  const { text, changed } = patchJekyllConfig('permalink: pretty\n', site, { baseurl: '/x' });
  assert.deepEqual(changed, ['title', 'description', 'baseurl']);
  const doc = jsYaml.load(text);
  assert.equal(doc.permalink, 'pretty');
  assert.equal(doc.baseurl, '/x');
});

test('patchJekyllConfig is idempotent', () => {
  const once = patchJekyllConfig(DEFAULT_JEKYLL_CONFIG, site).text;
  assert.equal(patchJekyllConfig(once, site).text, once);
  assert.deepEqual(patchJekyllConfig(once, site).changed, []);
});

test('quoting survives values with YAML punctuation', () => {
  const doc = jsYaml.load(jekyllConfig({ name: 'Data: the catalog', description: 'It is "good" — really' }));
  assert.equal(doc.title, 'Data: the catalog');
  assert.equal(doc.description, 'It is "good" — really');
});
