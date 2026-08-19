/**
 * Derivative images: the rules for turning one submitted screenshot into the
 * width variants and modern formats `_includes/picture.html` serves.
 *
 * Split from `scripts/lib/images.mjs` on purpose — that module is about
 * fetching bytes off the network safely, this one is about re-encoding bytes
 * already on disk. Everything here except `renderVariants` is pure, so the
 * planning rules are testable without sharp touching a file.
 *
 * The contract with the template:
 *   - a derivative is a sibling of its source: `01.png` -> `01-800.webp`;
 *   - `_data/derivatives.json` is the manifest Liquid reads (Jekyll loads
 *     `_data/*.json` as `site.data.<name>`), keyed by the site-absolute source
 *     path exactly as it appears in front matter;
 *   - no manifest entry means `picture.html` emits the plain `<img>` it always
 *     did, so a fresh fork, a hand-added image and an external URL all still
 *     render. Derivatives are an optimisation, never a requirement.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Width steps, in CSS/device pixels, offered to the browser. */
export const WIDTH_STEPS = [400, 800, 1280];

/** Formats written next to the source, best first — `picture.html` emits <source> in this order. */
export const FORMATS = ['avif', 'webp'];

/**
 * Source extensions we re-encode. GIF and SVG are deliberately absent: a GIF
 * may be animated (a single-frame derivative would silently drop the
 * animation) and an SVG is already resolution-independent.
 */
export const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Encoder settings. Tuned for screenshots of dashboards and documents: flat
 *  colour, thin type, so quality below these starts to smear 11px labels. */
export const ENCODE = {
  avif: { quality: 55, effort: 4, chromaSubsampling: '4:4:4' },
  webp: { quality: 78, effort: 4 },
};

/** A derivative filename, e.g. `01-800.webp`. */
const DERIVATIVE_RE = /-(\d+)\.(avif|webp)$/i;

/**
 * Does this filename look like something this script wrote? Used to keep
 * derivatives out of the source list — a `<name>-<width>.<avif|webp>` sibling
 * is never itself re-derived.
 * @param {string} file a path or bare filename
 * @returns {boolean}
 */
export function isDerivativeName(file) {
  return DERIVATIVE_RE.test(path.basename(String(file ?? '')));
}

/**
 * Widths worth writing for a source this wide. Never upscales: a 500px-wide
 * screenshot gets a 400px variant and nothing else, and a source narrower than
 * the smallest step gets exactly one variant at its own width (still worth it —
 * the format change alone is most of the saving).
 * @param {number} sourceWidth intrinsic width of the source, in pixels
 * @param {number[]} [steps]
 * @returns {number[]} ascending widths
 */
export function variantWidths(sourceWidth, steps = WIDTH_STEPS) {
  const width = Math.round(Number(sourceWidth) || 0);
  if (width <= 0) return [];
  const usable = steps.filter((step) => step <= width);
  return usable.length > 0 ? usable : [width];
}

/**
 * The sibling path for one variant.
 * @param {string} sourcePath any path ending in the source filename
 * @param {number} width
 * @param {string} format `avif` | `webp`
 * @returns {string}
 */
export function derivativePath(sourcePath, width, format) {
  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const name = `${stem}-${width}.${format}`;
  return dir === '.' ? name : path.join(dir, name);
}

/**
 * Manifest key for a repo-relative path: site-absolute, forward slashes — the
 * same string an entry's front matter carries in `src:`.
 * @param {string} relativePath e.g. `catalog/x/screenshots/01.png`
 * @returns {string} e.g. `/catalog/x/screenshots/01.png`
 */
export function manifestKey(relativePath) {
  const posix = String(relativePath ?? '')
    .split(path.sep)
    .join('/');
  return posix.startsWith('/') ? posix : `/${posix}`;
}

/**
 * Every derivative a manifest entry claims exists, as repo-relative paths.
 * @param {string} key manifest key (site-absolute source path)
 * @param {{variants?: Record<string, number[]>}} entry
 * @returns {string[]}
 */
export function expectedOutputs(key, entry) {
  const source = String(key ?? '').replace(/^\//, '');
  const variants = entry?.variants ?? {};
  const out = [];
  for (const format of Object.keys(variants)) {
    for (const width of variants[format] ?? []) out.push(derivativePath(source, width, format));
  }
  return out;
}

/**
 * Is the recorded manifest entry still true for the file on disk?
 *
 * Deliberately keyed on the source's byte length and pixel size rather than its
 * mtime: a `git clone` gives every file the checkout time, so an mtime rule
 * would re-encode the whole catalog on every CI run and commit byte-identical
 * files back.
 *
 * @param {object|undefined} entry existing manifest entry
 * @param {{bytes: number, width: number, height: number}} source
 * @returns {boolean}
 */
export function entryMatchesSource(entry, source) {
  if (!entry) return false;
  return (
    Number(entry.src_bytes) === Number(source.bytes) &&
    Number(entry.w) === Number(source.width) &&
    Number(entry.h) === Number(source.height)
  );
}

/**
 * Read an image's intrinsic size, honouring the EXIF orientation the browser
 * will honour too (a phone screenshot rotated by metadata reports its stored
 * width, which is the other one).
 * @param {import('sharp').Sharp} image
 * @returns {Promise<{width: number, height: number}>}
 */
export async function orientedSize(image) {
  const meta = await image.metadata();
  const rotated = Number(meta.orientation) >= 5;
  return {
    width: rotated ? Number(meta.height) : Number(meta.width),
    height: rotated ? Number(meta.width) : Number(meta.height),
  };
}

/**
 * Write every variant of one source image.
 *
 * A variant that comes out no smaller than the source is dropped, per width and
 * per format: shipping a "modern format" file that is bigger than the PNG it
 * replaces costs the reader bytes and buys nothing. Screenshots of dashboards
 * are usually palette PNGs, and a full-width AVIF of one really can lose to the
 * original while the 400 px variant still saves 80 % — so the two decisions have
 * to be made separately, and the manifest records what actually landed.
 *
 * @param {object} options
 * @param {string} options.absSource absolute path to the source file
 * @param {string} options.relSource repo-relative path to the source file
 * @param {string} options.rootDir absolute repo root, variants are written under it
 * @param {number} options.sourceBytes
 * @param {number[]} options.widths
 * @param {string[]} [options.formats]
 * @param {typeof import('sharp')} options.sharp
 * @param {{writeFileSync: Function, rmSync: Function}} [options.fsImpl]
 * @returns {Promise<{variants: Record<string, number[]>, written: string[], skipped: string[], bytes: number}>}
 */
export async function renderVariants(options) {
  const {
    absSource,
    relSource,
    rootDir,
    sourceBytes,
    widths,
    formats = FORMATS,
    sharp,
    fsImpl = fs,
  } = options;

  /** @type {Record<string, number[]>} */
  const variants = {};
  /** @type {string[]} */
  const written = [];
  /** @type {string[]} */
  const skipped = [];
  let bytes = 0;

  for (const format of formats) {
    for (const width of widths) {
      const rel = derivativePath(relSource, width, format);
      const abs = path.join(rootDir, rel);
      const buffer = await sharp(absSource)
        .rotate() // apply EXIF orientation, then drop the metadata with it
        .resize({ width, withoutEnlargement: true })
        .toFormat(format, ENCODE[format])
        .toBuffer();

      if (buffer.length >= sourceBytes) {
        if (fs.existsSync(abs)) fsImpl.rmSync(abs, { force: true });
        skipped.push(rel);
        continue;
      }

      fsImpl.writeFileSync(abs, buffer);
      written.push(rel);
      bytes += buffer.length;
      (variants[format] ??= []).push(width);
    }
  }

  return { variants, written, skipped, bytes };
}
