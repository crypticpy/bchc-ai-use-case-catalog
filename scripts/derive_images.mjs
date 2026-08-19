#!/usr/bin/env node
/**
 * Build the responsive-image derivatives the catalog serves.
 *
 *   npm run images              write what is missing or out of date
 *   npm run images -- --check   exit 1 if anything would change (CI gate)
 *   npm run images -- catalog/my-entry   limit the walk to one path
 *
 * For every screenshot under the schema's `entry.path` it writes AVIF and WebP
 * siblings at 400/800/1280 px (never wider than the source) and records what it
 * wrote in `_data/derivatives.json`. `_includes/picture.html` reads that
 * manifest; an image with no entry in it renders as the plain `<img>` it always
 * did, so a fresh fork that has never run this script still builds.
 *
 * Idempotent: a second run reports no changes. Freshness is judged on the
 * source's byte length and pixel size, not its mtime, because a `git clone`
 * stamps every file with the checkout time and an mtime rule would re-encode
 * the whole catalog on every CI run.
 *
 * Invoked by: `.github/workflows/new-entry.yml` (after the scaffolder downloads
 * a submitter's screenshots) and `.github/workflows/thumbnails.yml` (after
 * pdftoppm renders a deck's first page). Both commit the result — derivatives
 * are content, and this repo stores its screenshots. See docs/images.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';
import sharp from 'sharp';

import {
  FORMATS,
  SOURCE_EXTENSIONS,
  entryMatchesSource,
  expectedOutputs,
  isDerivativeName,
  manifestKey,
  orientedSize,
  renderVariants,
  variantWidths,
} from './lib/derivatives.mjs';

const ROOT = process.cwd();
const MANIFEST_PATH = '_data/derivatives.json';
/** Directories never walked, whatever the roots say. */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', '_site', '.jekyll-cache']);

const args = process.argv.slice(2);
const check = args.includes('--check');
const roots = args.filter((arg) => !arg.startsWith('--'));

/**
 * The catalog's entry folder, from the schema — never hardcoded here.
 * @returns {string}
 */
function entryPath() {
  const file = path.join(ROOT, '_data', 'schema.yml');
  if (!fs.existsSync(file)) return 'catalog';
  const schema = yaml.load(fs.readFileSync(file, 'utf8')) || {};
  return schema.entry?.path || 'catalog';
}

/**
 * Every source image under `dir`, repo-relative and sorted, skipping the
 * derivatives this script wrote.
 * @param {string} dir repo-relative
 * @returns {string[]}
 */
function findSources(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  if (!fs.statSync(abs).isDirectory()) {
    return SOURCE_EXTENSIONS.has(path.extname(dir).toLowerCase()) && !isDerivativeName(dir) ? [dir] : [];
  }
  const found = [];
  for (const dirent of fs
    .readdirSync(abs, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (dirent.isSymbolicLink()) continue;
    const rel = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      if (!SKIP_DIRS.has(dirent.name)) found.push(...findSources(rel));
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())) continue;
    if (isDerivativeName(dirent.name)) continue;
    found.push(rel);
  }
  return found;
}

/** @returns {Record<string, object>} the manifest as last written, or {}. */
function readManifest() {
  const file = path.join(ROOT, MANIFEST_PATH);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error(`Could not parse ${MANIFEST_PATH} (${error.message}); rebuilding it.`);
    return {};
  }
}

/**
 * Serialise the manifest with sorted keys, so two entries added in parallel
 * pull requests produce a diff a maintainer can read.
 * @param {Record<string, object>} manifest
 * @returns {string}
 */
function serialise(manifest) {
  const sorted = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key];
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

const searchRoots = roots.length > 0 ? roots : [entryPath()];
const previous = readManifest();
/** @type {Record<string, object>} */
const manifest = {};
const wrote = [];
const removed = [];
let skipped = 0;
let sourceBytesTotal = 0;
let derivativeBytesTotal = 0;

for (const root of searchRoots) {
  for (const relSource of findSources(root)) {
    const absSource = path.join(ROOT, relSource);
    const key = manifestKey(relSource);
    const bytes = fs.statSync(absSource).size;

    let size;
    try {
      size = await orientedSize(sharp(absSource));
    } catch (error) {
      console.error(`Skipped ${relSource} — sharp could not read it (${error.message}).`);
      continue;
    }
    if (!size.width || !size.height) {
      console.error(`Skipped ${relSource} — no intrinsic size.`);
      continue;
    }

    const widths = variantWidths(size.width);
    const existing = previous[key];
    const fresh =
      entryMatchesSource(existing, { bytes, width: size.width, height: size.height }) &&
      expectedOutputs(key, existing).every((rel) => fs.existsSync(path.join(ROOT, rel)));

    if (fresh) {
      manifest[key] = existing;
      skipped += 1;
      continue;
    }

    if (check) {
      wrote.push(relSource);
      manifest[key] = existing ?? {};
      continue;
    }

    const result = await renderVariants({
      absSource,
      relSource,
      rootDir: ROOT,
      sourceBytes: bytes,
      widths,
      sharp,
    });

    if (Object.keys(result.variants).length === 0) {
      console.log(
        `${relSource}: every variant came out larger than the source; serving the original on its own.`
      );
      continue;
    }
    if (result.skipped.length > 0) {
      console.log(`${relSource}: skipped ${result.skipped.join(', ')} (not smaller than the source).`);
    }

    // Key order follows FORMATS so `picture.html` emits <source> best-first.
    /** @type {Record<string, number[]>} */
    const variants = {};
    for (const format of FORMATS) {
      if (result.variants[format]?.length) variants[format] = result.variants[format];
    }

    manifest[key] = {
      w: size.width,
      h: size.height,
      src_bytes: bytes,
      base: key.replace(/\.[^./]+$/, ''),
      variants,
    };
    wrote.push(relSource);
    sourceBytesTotal += bytes;
    derivativeBytesTotal += result.bytes;
  }
}

// Anything the previous manifest claimed but this run did not produce is an
// orphan: its source was deleted or renamed. Only files this script recorded
// are removed — a hand-placed `photo-800.webp` is never touched.
for (const [key, entry] of Object.entries(previous)) {
  if (manifest[key]) continue;
  if (!searchRoots.some((root) => key.startsWith(manifestKey(root)))) {
    manifest[key] = entry; // outside this run's roots; leave the record alone
    continue;
  }
  for (const rel of expectedOutputs(key, entry)) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    if (check) {
      removed.push(rel);
      continue;
    }
    fs.rmSync(abs, { force: true });
    removed.push(rel);
  }
}

const manifestFile = path.join(ROOT, MANIFEST_PATH);
const nextText = serialise(manifest);
const currentText = fs.existsSync(manifestFile) ? fs.readFileSync(manifestFile, 'utf8') : '';
const manifestChanged = nextText !== currentText;

if (check) {
  const changed = wrote.length + removed.length;
  if (changed === 0 && !manifestChanged) {
    console.log(`Derivatives are up to date (${skipped} images).`);
    process.exit(0);
  }
  console.error('Derivative images are out of date. Run `npm run images` and commit the result.');
  for (const rel of wrote) console.error(`  - ${rel} needs derivatives`);
  for (const rel of removed) console.error(`  - ${rel} is an orphan`);
  if (manifestChanged) console.error(`  - ${MANIFEST_PATH} is stale`);
  process.exit(1);
}

if (manifestChanged) {
  // Write beside the target and rename: the manifest is tracked, and a run
  // interrupted mid-write must not leave half a JSON file in the tree.
  const temp = `${manifestFile}.tmp`;
  fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
  fs.writeFileSync(temp, nextText, 'utf8');
  fs.renameSync(temp, manifestFile);
}

console.log(
  [
    `Derivatives: ${wrote.length} image(s) encoded, ${skipped} already current, ${removed.length} orphan(s) removed.`,
    wrote.length > 0
      ? `Wrote ${derivativeBytesTotal} bytes of variants from ${sourceBytesTotal} bytes of source.`
      : '',
    manifestChanged ? `Updated ${MANIFEST_PATH}.` : `${MANIFEST_PATH} unchanged.`,
  ]
    .filter(Boolean)
    .join('\n')
);
