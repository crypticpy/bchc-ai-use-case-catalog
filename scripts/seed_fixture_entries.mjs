#!/usr/bin/env node
/**
 * Write schema-conformant fixture entries into a checkout.
 *
 *   node scripts/seed_fixture_entries.mjs --count 3 [--root <dir>] [--force]
 *   node scripts/seed_fixture_entries.mjs --count 100 --profile performance
 *
 * The preset build matrix (scripts/build_variants.mjs) needs a *non-empty*
 * catalog: an empty one never renders a card, a filter pill, a fact strip or a
 * signal strip, which is where preset-specific breakage lives. The shipped
 * sample entries cannot be reused — they are written against the shipped
 * schema, so any other preset leaves them failing `check_front_matter.rb` — so
 * the fixtures are generated from whatever `_data/schema.yml` says *now*: the
 * first option for a `select`, the first two for a `multiselect`, a sentence
 * for prose, a 1×1 PNG for `images`. The performance profile instead produces
 * common/rare facet distributions, long prose, and 320×180 images while staying
 * schema-driven. Nothing here names a field key.
 *
 * Entries are written to `<entry.path>/fixture-<n>/` and marked `sample: true`
 * so the wizard's sample-removal step treats them like the shipped samples.
 * Intended for scratch copies; it refuses to overwrite an existing folder
 * unless `--force` is given.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import * as yaml from 'js-yaml';

import { frontMatter } from './lib/yaml.mjs';

/** Smallest valid PNG: one fully transparent pixel. Enough for `<img>` + size checks. */
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

const PERFORMANCE_PNGS = new Map();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

/** A valid, deterministic 320×180 screenshot-like PNG for scale fixtures. */
export function performanceFixturePng(index) {
  const variant = index % 8;
  if (PERFORMANCE_PNGS.has(variant)) return PERFORMANCE_PNGS.get(variant);
  const width = 320;
  const height = 180;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  let offset = 0;
  let random = (variant + 1) * 2654435761;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      random = (random * 1664525 + 1013904223) >>> 0;
      const texture = random & 63;
      raw[offset] = (30 + Math.floor(x / 40) * 12 + texture + variant * 3) & 255;
      raw[offset + 1] = (80 + Math.floor(y / 30) * 8 + texture) & 255;
      raw[offset + 2] = (140 + texture + variant * 5) & 255;
      offset += 3;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const image = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  PERFORMANCE_PNGS.set(variant, image);
  return image;
}

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
 * @param {{assetBase: string, profile?: string}} context `assetBase` is the entry's site-absolute
 *   folder, e.g. `/catalog/fixture-1`. Image `src` values are site-absolute
 *   because a card on `/catalog/` renders the same string as the entry page.
 * @returns {unknown|undefined} `undefined` when the type carries no front
 *   matter value (a `markdown` field is the page body).
 */
export function fixtureValue(field, index, context = { assetBase: '', profile: 'matrix' }) {
  const options = (Array.isArray(field.options) ? field.options : []).filter(
    (option) => typeof option === 'string' && option.trim() !== ''
  );
  const word = WORDS[index % WORDS.length];
  const label = String(field.label || field.key || 'Field');

  switch (field.type) {
    case 'markdown':
      return undefined;
    case 'select':
      if (!options.length) return `${label} ${index + 1}`;
      if (context.profile !== 'performance') return options[index % options.length];
      if ((index + 1) % 5 === 0 && options.length > 1) {
        const alternate = (Math.floor((index + 1) / 5) - 1) % (options.length - 1);
        return options[alternate + 1];
      }
      return options[0];
    case 'multiselect': {
      if (!options.length) return [`${label} ${index + 1}`];
      if (context.profile !== 'performance') return options.slice(0, 2);
      const alternate = options.length > 1 ? (Math.floor((index + 1) / 4) - 1) % (options.length - 1) : -1;
      return [
        options[0],
        ...((index + 1) % 4 === 0 && alternate >= 0 ? [options[alternate + 1]] : []),
        ...((index + 1) % 20 === 0 && options.length > 2 ? [options.at(-1)] : []),
      ].filter((value, at, values) => values.indexOf(value) === at);
    }
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
 * @param {{profile?: 'matrix'|'performance'}} [options]
 * @returns {{slug: string, markdown: string, needsPixel: boolean}}
 */
export function fixtureEntry(schema, index, { profile = 'matrix' } = {}) {
  if (!['matrix', 'performance'].includes(profile)) {
    throw new Error(`fixture profile must be matrix or performance, not ${JSON.stringify(profile)}`);
  }
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  const slug = `fixture-${index + 1}`;
  const word = WORDS[index % WORDS.length];
  const entryPath = String(schema?.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '');
  const context = { assetBase: `/${entryPath}/${slug}`, profile };

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

  let body = '';
  if (fields.some((field) => field?.type === 'markdown')) {
    body =
      `## Background\n\nGenerated fixture content for the ${word} entry. ` +
      'It exists so the entry layout, the card and the search index have a body to render.\n';
    if (profile === 'performance') {
      body += Array.from({ length: 7 }, (_, section) => {
        const terms = Array.from({ length: 32 }, (_, at) => WORDS[(index + section + at) % WORDS.length]);
        return (
          `\n## Evidence ${section + 1}\n\n` +
          `Team ${index + 1} documented ${terms.join(', ')} during iteration ${index + 1}-${section + 1}. ` +
          'The narrative records the decision, the observed result, the operational constraint, ' +
          'the accessibility check, and the next review date so long-form rendering and search indexing are measured.\n'
        );
      }).join('');
    }
  }

  return { slug, markdown: `${frontMatter(front)}${body ? `\n${body}` : ''}`, needsPixel };
}

/**
 * Write `count` fixtures under `<root>/<entry.path>/`.
 *
 * @param {string} root repository (or scratch copy) root.
 * @param {{count?: number, force?: boolean, profile?: 'matrix'|'performance'}} [options]
 * @returns {string[]} the folders written, relative to `root`.
 */
export function seedFixtureEntries(root, { count = 3, force = false, profile = 'matrix' } = {}) {
  if (!['matrix', 'performance'].includes(profile)) {
    throw new Error(`fixture profile must be matrix or performance, not ${JSON.stringify(profile)}`);
  }
  const schemaFile = path.join(root, '_data', 'schema.yml');
  const schema = yaml.load(fs.readFileSync(schemaFile, 'utf8')) ?? {};
  const entryPath = String(schema?.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '');
  const written = [];

  for (let index = 0; index < count; index += 1) {
    const { slug, markdown, needsPixel } = fixtureEntry(schema, index, { profile });
    const dir = path.join(root, entryPath, slug);
    if (fs.existsSync(dir) && !force) throw new Error(`${path.relative(root, dir)} already exists`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.md'), markdown);
    if (needsPixel) {
      fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'screenshots', '01.png'),
        profile === 'performance' ? performanceFixturePng(index) : PIXEL_PNG
      );
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
    profile: valueOf('--profile', 'matrix'),
  });
  console.log(`Seeded ${written.length} fixture entries:\n  ${written.join('\n  ')}`);
}
