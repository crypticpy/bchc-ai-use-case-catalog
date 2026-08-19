/**
 * The derivative-image pipeline: the planning rules (pure) and one end-to-end
 * run of scripts/derive_images.mjs over a fixture tree, which is the only way
 * to prove idempotence and the orphan sweep.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

import {
  FORMATS,
  SOURCE_EXTENSIONS,
  derivativePath,
  entryMatchesSource,
  expectedOutputs,
  isDerivativeName,
  manifestKey,
  orientedSize,
  renderVariants,
  variantWidths,
} from '../../scripts/lib/derivatives.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'derive_images.mjs');

/* ---------- planning rules ------------------------------------------------ */

test('variantWidths never upscales', () => {
  assert.deepEqual(variantWidths(1280), [400, 800, 1280]);
  assert.deepEqual(variantWidths(1000), [400, 800]);
  assert.deepEqual(variantWidths(800), [400, 800]);
  assert.deepEqual(variantWidths(401), [400]);
});

test('variantWidths falls back to the source width when it is below every step', () => {
  assert.deepEqual(variantWidths(320), [320]);
  assert.deepEqual(variantWidths(0), []);
  assert.deepEqual(variantWidths(undefined), []);
});

test('derivativePath puts the variant beside its source', () => {
  assert.equal(
    derivativePath('catalog/x/screenshots/01.png', 800, 'avif'),
    'catalog/x/screenshots/01-800.avif'
  );
  assert.equal(derivativePath('01.jpeg', 400, 'webp'), '01-400.webp');
});

test('isDerivativeName only matches what this script writes', () => {
  assert.equal(isDerivativeName('01-800.avif'), true);
  assert.equal(isDerivativeName('catalog/x/01-400.webp'), true);
  assert.equal(isDerivativeName('01.png'), false);
  assert.equal(isDerivativeName('screen-shot.png'), false);
  assert.equal(isDerivativeName('01-800.png'), false);
});

test('manifestKey is site-absolute whatever it is given', () => {
  assert.equal(manifestKey('catalog/x/01.png'), '/catalog/x/01.png');
  assert.equal(manifestKey('/catalog/x/01.png'), '/catalog/x/01.png');
});

test('expectedOutputs lists every variant the manifest claims', () => {
  const outputs = expectedOutputs('/catalog/x/01.png', {
    variants: { avif: [400, 800], webp: [400] },
  });
  assert.deepEqual(outputs, ['catalog/x/01-400.avif', 'catalog/x/01-800.avif', 'catalog/x/01-400.webp']);
  assert.deepEqual(expectedOutputs('/catalog/x/01.png', {}), []);
});

test('entryMatchesSource keys on bytes and pixels, not mtime', () => {
  const entry = { src_bytes: 100, w: 1280, h: 800 };
  assert.equal(entryMatchesSource(entry, { bytes: 100, width: 1280, height: 800 }), true);
  assert.equal(entryMatchesSource(entry, { bytes: 101, width: 1280, height: 800 }), false);
  assert.equal(entryMatchesSource(entry, { bytes: 100, width: 1024, height: 800 }), false);
  assert.equal(entryMatchesSource(undefined, { bytes: 100, width: 1280, height: 800 }), false);
});

test('the source extension list excludes formats a single frame would misrepresent', () => {
  assert.equal(SOURCE_EXTENSIONS.has('.png'), true);
  assert.equal(SOURCE_EXTENSIONS.has('.gif'), false);
  assert.equal(SOURCE_EXTENSIONS.has('.svg'), false);
});

/* ---------- fixtures ------------------------------------------------------ */

/**
 * A stand-in for what this pipeline is actually fed: a screenshot. A pale page,
 * a dark header bar, rows of text-like marks — compressible enough that PNG
 * holds it, detailed enough that the lossy formats beat PNG, which is the
 * premise every size rule below is judged against. A flat fill and a field of
 * noise each encode nothing like a screenshot and would make the byte
 * comparisons meaningless in opposite directions.
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>} PNG bytes
 */
async function screenshotPng(width, height) {
  const pixels = Buffer.alloc(width * height * 3, 0xf7);
  const put = (x, y, value) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 3;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
  };
  for (let y = 0; y < 64 && y < height; y += 1) for (let x = 0; x < width; x += 1) put(x, y, 0x2b);

  let seed = 11;
  const rand = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  for (let row = 0; row * 26 + 90 < height; row += 1) {
    const top = 90 + row * 26;
    let x = 32;
    while (x < width - 40) {
      const word = 18 + rand(70);
      for (let yy = top; yy < top + 11; yy += 1)
        for (let xx = x; xx < x + word; xx += 1) put(xx, yy, 0x33 + rand(60));
      x += word + 10 + rand(12);
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A scratch repo root with a schema and one entry folder. */
function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'derive-images-'));
  fs.mkdirSync(path.join(dir, '_data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'catalog', 'demo', 'screenshots'), { recursive: true });
  fs.writeFileSync(path.join(dir, '_data', 'schema.yml'), 'entry:\n  path: catalog\n');
  return dir;
}

/**
 * Run scripts/derive_images.mjs inside `dir`. Returns stdout; throws on a
 * non-zero exit, with the script's stderr on `error.stderr`.
 */
function run(dir, args = []) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8', stdio: 'pipe' });
}

/* ---------- renderVariants ------------------------------------------------ */

test('renderVariants writes each format at each width and reports what landed', async () => {
  const dir = scratchRepo();
  const rel = path.join('catalog', 'demo', 'screenshots', '01.png');
  const abs = path.join(dir, rel);
  fs.writeFileSync(abs, await screenshotPng(1000, 600));
  const sourceBytes = fs.statSync(abs).size;

  const result = await renderVariants({
    absSource: abs,
    relSource: rel,
    rootDir: dir,
    sourceBytes,
    widths: variantWidths(1000),
    sharp,
  });

  assert.deepEqual(Object.keys(result.variants).sort(), FORMATS.slice().sort());
  assert.equal(result.skipped.length, 0);
  assert.equal(result.written.length, 4);
  for (const format of FORMATS) {
    assert.deepEqual(result.variants[format], [400, 800], `${format} should cover both widths`);
    for (const width of [400, 800]) {
      const file = path.join(dir, derivativePath(rel, width, format));
      assert.ok(fs.existsSync(file), `${file} should exist`);
      assert.ok(fs.statSync(file).size < sourceBytes);
      // No upscaling, whatever the step list says.
      assert.equal((await sharp(file).metadata()).width, width);
    }
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderVariants drops a variant that is not smaller than the source', async () => {
  const dir = scratchRepo();
  const rel = path.join('catalog', 'demo', 'screenshots', '01.png');
  const abs = path.join(dir, rel);
  fs.writeFileSync(abs, await screenshotPng(1280, 800));

  // A source claimed to be 1 KB: no variant of a 1280x800 page can beat that,
  // so nothing may be written and no format may be recorded.
  const result = await renderVariants({
    absSource: abs,
    relSource: rel,
    rootDir: dir,
    sourceBytes: 1024,
    widths: [400, 800],
    sharp,
  });

  assert.deepEqual(result.variants, {});
  assert.deepEqual(result.written, []);
  assert.equal(result.skipped.length, 4);
  assert.equal(result.bytes, 0);
  for (const skipped of result.skipped) assert.equal(fs.existsSync(path.join(dir, skipped)), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('renderVariants decides per width, not per format', async () => {
  const dir = scratchRepo();
  const rel = path.join('catalog', 'demo', 'screenshots', '01.png');
  const abs = path.join(dir, rel);
  fs.writeFileSync(abs, await screenshotPng(1280, 800));

  // Between the 400px and the 1280px AVIF of this page: the small one has to
  // survive even though the large one loses. A whole-format verdict would drop
  // both and cost a phone the 80% saving it was entitled to.
  const result = await renderVariants({
    absSource: abs,
    relSource: rel,
    rootDir: dir,
    sourceBytes: 20_000,
    widths: [400, 1280],
    formats: ['avif'],
    sharp,
  });

  assert.deepEqual(result.variants, { avif: [400] });
  assert.deepEqual(result.skipped, [derivativePath(rel, 1280, 'avif')]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('orientedSize reports the size the browser will lay out', async () => {
  const upright = sharp(await screenshotPng(400, 200));
  assert.deepEqual(await orientedSize(upright), { width: 400, height: 200 });

  // EXIF orientation 6 = rotate 90 degrees: stored 400x200, displayed 200x400.
  const sideways = await sharp(await screenshotPng(400, 200))
    .withMetadata({ orientation: 6 })
    .toBuffer();
  assert.deepEqual(await orientedSize(sharp(sideways)), { width: 200, height: 400 });
});

/* ---------- the script end to end ----------------------------------------- */

test('derive_images writes a manifest, is idempotent, and sweeps orphans', async () => {
  const dir = scratchRepo();
  const rel = 'catalog/demo/screenshots/01.png';
  const abs = path.join(dir, rel);
  fs.writeFileSync(abs, await screenshotPng(1280, 800));
  const manifestFile = path.join(dir, '_data', 'derivatives.json');

  const first = run(dir);
  assert.match(first, /1 image\(s\) encoded/);

  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entry = manifest['/catalog/demo/screenshots/01.png'];
  assert.ok(entry, 'the source should be in the manifest');
  assert.equal(entry.w, 1280);
  assert.equal(entry.h, 800);
  assert.equal(entry.src_bytes, fs.statSync(abs).size);
  assert.equal(entry.base, '/catalog/demo/screenshots/01');
  assert.deepEqual(Object.keys(entry.variants), FORMATS, 'best format first, so <source> order is right');
  const outputs = expectedOutputs('/catalog/demo/screenshots/01.png', entry);
  assert.ok(outputs.length > 0);
  for (const output of outputs) assert.ok(fs.existsSync(path.join(dir, output)), `${output} should exist`);

  // Idempotent, and mtime-independent: touching the source without changing a
  // byte must not re-encode anything, because a git checkout does exactly that.
  const stamp = new Date(Date.now() + 60_000);
  fs.utimesSync(abs, stamp, stamp);
  const second = run(dir);
  assert.match(second, /0 image\(s\) encoded, 1 already current/);
  assert.match(second, /derivatives\.json unchanged/);

  // --check agrees while the tree is clean, and objects once it is not.
  assert.match(run(dir, ['--check']), /up to date/);
  fs.rmSync(abs);
  assert.throws(
    () => run(dir, ['--check']),
    (error) => /is an orphan/.test(error.stderr) && error.status === 1
  );

  const third = run(dir);
  assert.match(third, new RegExp(`${outputs.length} orphan\\(s\\) removed`));
  for (const orphan of outputs) {
    assert.equal(fs.existsSync(path.join(dir, orphan)), false, `${orphan} should be gone`);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(manifestFile, 'utf8')), {});

  fs.rmSync(dir, { recursive: true, force: true });
});

test('derive_images leaves an image it cannot improve out of the manifest', async () => {
  const dir = scratchRepo();
  // An already-squeezed WebP: re-encoding it at either quality makes it bigger,
  // so the honest answer is to serve the file the submitter uploaded.
  const abs = path.join(dir, 'catalog/demo/screenshots/01.webp');
  fs.writeFileSync(
    abs,
    await sharp(await screenshotPng(400, 300))
      .webp({ quality: 8, effort: 6 })
      .toBuffer()
  );

  const output = run(dir);
  assert.match(output, /serving the original on its own/);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '_data', 'derivatives.json'), 'utf8'));
  assert.deepEqual(manifest, {}, 'nothing to serve means nothing to record');
  assert.deepEqual(fs.readdirSync(path.dirname(abs)), ['01.webp'], 'no variant left behind');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('derive_images ignores its own output and formats it must not flatten', async () => {
  const dir = scratchRepo();
  const shots = path.join(dir, 'catalog/demo/screenshots');
  fs.writeFileSync(path.join(shots, '01.png'), await screenshotPng(1000, 600));
  // A hand-placed file that looks like a derivative, and an animated format.
  fs.writeFileSync(
    path.join(shots, '99-400.webp'),
    await sharp(await screenshotPng(400, 300))
      .webp()
      .toBuffer()
  );
  fs.writeFileSync(
    path.join(shots, 'loop.gif'),
    await sharp(await screenshotPng(200, 200))
      .gif()
      .toBuffer()
  );

  run(dir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, '_data', 'derivatives.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest), ['/catalog/demo/screenshots/01.png']);
  assert.ok(
    fs.existsSync(path.join(shots, '99-400.webp')),
    'a file this script did not write is never touched'
  );
  assert.ok(fs.existsSync(path.join(shots, 'loop.gif')));
  assert.equal(
    fs.existsSync(path.join(shots, 'loop-400.avif')),
    false,
    'a GIF may be animated; leave it alone'
  );
  fs.rmSync(dir, { recursive: true, force: true });
});
