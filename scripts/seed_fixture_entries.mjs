#!/usr/bin/env node
/**
 * Write schema-conformant fixture entries into a checkout.
 *
 *   node scripts/seed_fixture_entries.mjs --count 3 [--root <dir>] [--force]
 *
 * The preset build matrix (scripts/build_variants.mjs) needs a *non-empty*
 * catalog: an empty one never renders a card, a filter pill, a fact strip or a
 * signal strip, which is where preset-specific breakage lives. The shipped
 * sample entries cannot be reused — they are written against the shipped
 * schema, so any other preset leaves them failing `check_front_matter.rb` — so
 * the fixtures are generated from whatever `_data/schema.yml` says *now*: the
 * first option for a `select`, the first two for a `multiselect`, a sentence
 * for prose, a 1×1 PNG for `images`. Nothing here names a field key.
 *
 * Entries are written to `<entry.path>/fixture-<n>/` and marked `sample: true`
 * so the wizard's sample-removal step treats them like the shipped samples.
 * Intended for scratch copies; it refuses to overwrite an existing folder
 * unless `--force` is given.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

import { frontMatter } from './lib/yaml.mjs';

/** Smallest valid PNG: one fully transparent pixel. Enough for `<img>` + size checks. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** Filler prose, indexed by fixture so search and sort have something to separate. */
const WORDS = [
  'coordination',
  'intake',
  'triage',
  'review',
  'reporting',
  'outreach',
  'scheduling',
  'analysis',
];

/**
 * A valid value for one schema field.
 *
 * `index` (0-based) varies the values across fixtures so facets have more than
 * one bucket and the sort key is not a single repeated date.
 *
 * @param {object} field a `_data/schema.yml` field.
 * @param {number} index which fixture this is.
 * @param {{assetBase: string}} context `assetBase` is the entry's site-absolute
 *   folder, e.g. `/catalog/fixture-1`. Image `src` values are site-absolute
 *   because a card on `/catalog/` renders the same string as the entry page.
 * @returns {unknown|undefined} `undefined` when the type carries no front
 *   matter value (a `markdown` field is the page body).
 */
export function fixtureValue(field, index, context = { assetBase: '' }) {
  const options = (Array.isArray(field.options) ? field.options : []).filter(
    (option) => typeof option === 'string' && option.trim() !== ''
  );
  const word = WORDS[index % WORDS.length];
  const label = String(field.label || field.key || 'Field');

  switch (field.type) {
    case 'markdown':
      return undefined;
    case 'select':
      return options.length ? options[index % options.length] : `${label} ${index + 1}`;
    case 'multiselect':
      return options.length ? options.slice(0, 2) : [`${label} ${index + 1}`];
    case 'list':
      // A `links_entries` list holds slugs of other entries, and the validator
      // rejects one that names no entry — so point at the first fixture rather
      // than at generated filler. Fixture 1 has nothing earlier to point at,
      // which also leaves it as the one showing an "Adopted by" card.
      if (field.links_entries) return index === 0 ? undefined : ['fixture-1'];
      return [`${label} ${index + 1}`, `${label} ${index + 2}`];
    case 'url':
      return `https://example.org/fixture-${index + 1}`;
    case 'email':
      return `fixture-${index + 1}@example.org`;
    case 'date':
      return isoDate(index);
    case 'number':
      return index + 1;
    case 'boolean':
      return index % 2 === 0;
    case 'images':
      return [
        {
          src: `${context.assetBase}/screenshots/01.png`,
          alt: `Screenshot of the ${word} fixture interface.`,
        },
      ];
    case 'links':
      return [{ label: `${label} reference`, url: `https://example.org/fixture-${index + 1}/reference` }];
    case 'file':
      return String(field.filename || 'attachment.pdf');
    case 'image':
      return `${context.assetBase}/screenshots/01.png`;
    case 'textarea':
      return `A generated fixture used to prove the ${word} pages render. It is long enough to wrap.`;
    default:
      return `Fixture ${label.toLowerCase()} ${index + 1}`;
  }
}

/** A stable, descending run of dates so `sort: published` has something to order. */
function isoDate(index) {
  const day = String(28 - (index % 28)).padStart(2, '0');
  return `2026-01-${day}`;
}

/**
 * Generate the files for one fixture entry.
 *
 * @param {object} schema parsed `_data/schema.yml`.
 * @param {number} index 0-based.
 * @returns {{slug: string, markdown: string, needsPixel: boolean}}
 */
export function fixtureEntry(schema, index) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const slug = `fixture-${index + 1}`;
  const word = WORDS[index % WORDS.length];
  const entryPath = String(schema?.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '');
  const context = { assetBase: `/${entryPath}/${slug}` };

  const front = [
    ['layout', 'entry'],
    // Fixture bodies are treated exactly like a submitter's: never run through
    // Liquid. check_front_matter.rb requires the flag, and so does the matrix.
    ['render_with_liquid', false],
    ['title', `Fixture ${index + 1}: ${word}`],
    ['slug', slug],
    ['published', isoDate(index)],
    ['sample', true],
  ];
  if (index === 0) front.push(['featured', true]);

  let needsPixel = false;
  for (const field of fields) {
    if (!field || typeof field.key !== 'string' || field.key === '') continue;
    // `title` is already set above; a schema always declares it as a field too.
    if (front.some(([key]) => key === field.key)) continue;
    const value = fixtureValue(field, index, context);
    if (value === undefined) continue;
    if (field.type === 'images' || field.type === 'image') needsPixel = true;
    front.push([field.key, value]);
  }

  const body = fields.some((field) => field?.type === 'markdown')
    ? `## Background\n\nGenerated fixture content for the ${word} entry. ` +
      'It exists so the entry layout, the card and the search index have a body to render.\n'
    : '';

  return { slug, markdown: `${frontMatter(front)}${body ? `\n${body}` : ''}`, needsPixel };
}

/**
 * Write `count` fixtures under `<root>/<entry.path>/`.
 *
 * @param {string} root repository (or scratch copy) root.
 * @param {{count?: number, force?: boolean}} [options]
 * @returns {string[]} the folders written, relative to `root`.
 */
export function seedFixtureEntries(root, { count = 3, force = false } = {}) {
  const schemaFile = path.join(root, '_data', 'schema.yml');
  const schema = yaml.load(fs.readFileSync(schemaFile, 'utf8')) ?? {};
  const entryPath = String(schema?.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '');
  const written = [];

  for (let index = 0; index < count; index += 1) {
    const { slug, markdown, needsPixel } = fixtureEntry(schema, index);
    const dir = path.join(root, entryPath, slug);
    if (fs.existsSync(dir) && !force) throw new Error(`${path.relative(root, dir)} already exists`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.md'), markdown);
    if (needsPixel) {
      fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'screenshots', '01.png'), PIXEL_PNG);
    }
    written.push(path.join(entryPath, slug));
  }
  return written;
}

/* -------------------------------------------------------------------------- */

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const argv = process.argv.slice(2);
  const valueOf = (name, fallback) => {
    const at = argv.indexOf(name);
    return at === -1 ? fallback : argv[at + 1];
  };
  const written = seedFixtureEntries(path.resolve(valueOf('--root', process.cwd())), {
    count: Number(valueOf('--count', 3)),
    force: argv.includes('--force'),
  });
  console.log(`Seeded ${written.length} fixture entries:\n  ${written.join('\n  ')}`);
}
