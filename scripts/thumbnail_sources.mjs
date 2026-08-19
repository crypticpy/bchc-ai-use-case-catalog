#!/usr/bin/env node
/**
 * Print the PDF -> thumbnail pairs that CI should render, one per line, as
 * "<pdf-path>\t<thumb-path>".
 *
 * Candidates come from _data/schema.yml: every `file` field marked
 * `thumbnail: true` contributes catalog/<slug>/<filename> for each entry
 * folder that actually has that file on disk.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as yaml from 'js-yaml';

const ROOT = process.cwd();
const schema = yaml.load(fs.readFileSync(path.join(ROOT, '_data', 'schema.yml'), 'utf8')) || {};
const entryPath = schema.entry?.path || 'catalog';

const filenames = (Array.isArray(schema.fields) ? schema.fields : [])
  .filter((field) => field.type === 'file' && field.thumbnail && field.filename)
  .map((field) => field.filename);

const entriesDir = path.join(ROOT, entryPath);
if (filenames.length === 0 || !fs.existsSync(entriesDir)) process.exit(0);

for (const dirent of fs
  .readdirSync(entriesDir, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name))) {
  if (!dirent.isDirectory()) continue;
  for (const filename of filenames) {
    const source = path.join(entryPath, dirent.name, filename);
    if (!fs.existsSync(path.join(ROOT, source))) continue;
    console.log(`${source}\t${path.join(entryPath, dirent.name, 'thumb.jpg')}`);
  }
}
