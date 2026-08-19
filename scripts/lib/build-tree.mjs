/**
 * Scratch-tree plumbing shared by the two builders that copy this repository,
 * reconfigure the copy and run Jekyll over it: `scripts/build_variants.mjs`
 * (the preset build matrix) and `scripts/build_showcase.mjs` (the landing and
 * the live examples).
 *
 * Nothing here knows what a variant or an example is — it is the four
 * operations both of them need: copy a tree, run a command, read/write a data
 * file, and empty the catalog.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';

/**
 * Directories never copied into a scratch tree: build output, caches, and the
 * two big ones (`node_modules`, `.git`) that nothing in a Jekyll build reads.
 */
export const SKIP = new Set([
  '.git',
  '.jekyll-cache',
  '.lighthouseci',
  '_site',
  'node_modules',
  'panel2',
  'vendor',
]);

/** Recursive copy of `from` into `to`, skipping {@link SKIP} at the top level. */
export function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(item.name)) continue;
    const source = path.join(from, item.name);
    const target = path.join(to, item.name);
    if (item.isDirectory()) copyTree(source, target);
    else if (item.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(source), target);
    else if (item.isFile()) fs.copyFileSync(source, target);
  }
}

/** Run a command, capturing output. Never throws; the caller reads `.ok`. */
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { ok: result.status === 0, status: result.status, output, error: result.error };
}

/** A YAML file as an object; `{}` when it is missing or empty. */
export function readYaml(file) {
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) ?? {};
}

/**
 * Write an object back as YAML. Comments are not preserved — these are scratch
 * trees, and the file a fork reads is never the one being rewritten.
 */
export function writeYaml(file, data) {
  fs.writeFileSync(file, yaml.dump(data, { lineWidth: 100, noRefs: true }), 'utf8');
}

/** Delete every `<entry.path>/<slug>/` folder in a scratch tree. */
export function removeEntries(root) {
  const schema = readYaml(path.join(root, '_data', 'schema.yml'));
  const dir = path.join(root, String(schema?.entry?.path || 'catalog').replace(/^\/+|\/+$/g, ''));
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) fs.rmSync(path.join(dir, item.name), { recursive: true, force: true });
  }
}
