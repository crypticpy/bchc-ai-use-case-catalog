/**
 * Everything `npm run setup` touches outside its own process: the terminal,
 * git, the repository's YAML, and the files it writes.
 *
 * The schema and entry front matter are parsed with the YAML parser rather
 * than matched with regular expressions — a quoted path, a flow-style mapping
 * or an anchored field would all slip past a pattern and silently give the
 * wizard the wrong answer.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import * as yaml from 'js-yaml';

/* -------------------------------------------------------------------------- */
/* Terminal                                                                   */
/* -------------------------------------------------------------------------- */

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);

export const bold = (text) => paint('1', text);
export const dim = (text) => paint('2', text);
export const cyan = (text) => paint('36', text);
export const green = (text) => paint('32', text);
export const red = (text) => paint('31', text);

/* -------------------------------------------------------------------------- */
/* git                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `owner/repo` from a git remote URL, for both URL and scp-like (`git@host:owner/repo`)
 * spellings. Only github.com remotes count — the value seeds a GitHub-only answer.
 *
 * @param {string} url the raw `git remote get-url` output.
 * @returns {string|null}
 */
export function repositoryFromGitUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  // `git@github.com:owner/repo.git` is not a URL; turn it into one before parsing.
  const normalized = raw.includes('://') ? raw : `ssh://${raw.replace(':', '/')}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return null;
  }
  if (!/(^|\.)github\.com$/.test(parsed.hostname)) return null;
  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (segment.endsWith('.git') ? segment.slice(0, -'.git'.length) : segment));
  if (segments.length < 2) return null;
  return segments.slice(-2).join('/');
}

/**
 * `owner/repo` from the checkout's origin remote, or null.
 * @param {string} root repository root.
 * @returns {string|null}
 */
export function repositoryFromGit(root) {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return repositoryFromGitUrl(url);
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Repository YAML                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Parse `_data/schema.yml`.
 * @param {string} root repository root.
 * @returns {object|null} null when the file is missing or unparseable.
 */
export function readSchema(root) {
  try {
    const parsed = yaml.load(fs.readFileSync(path.join(root, '_data', 'schema.yml'), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The URL segment entries live under (`catalog` by default).
 * @param {object|null} schema a parsed schema.
 * @returns {string}
 */
export function entryPathFrom(schema) {
  const value = schema?.entry?.path;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : 'catalog';
}

/**
 * Field keys declared by a parsed schema, in order.
 * @param {object|null} schema
 * @returns {string[]}
 */
export function schemaFieldKeys(schema) {
  const fields = Array.isArray(schema?.fields) ? schema.fields : [];
  return fields.map((field) => field?.key).filter((key) => typeof key === 'string');
}

/**
 * Parse a Markdown file's YAML front matter.
 * @param {string} text the whole file.
 * @returns {object|null} null when there is no front matter, or it is not a mapping.
 */
export function frontMatter(text) {
  const lines = String(text ?? '').split('\n');
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return null;
  try {
    const parsed = yaml.load(lines.slice(1, end).join('\n'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Entry folders shipped as sample content: `<entry path>/<slug>/index.md` whose
 * front matter carries `sample: true` (all template samples do). User content
 * never does.
 *
 * @param {string} root repository root.
 * @param {string} entryPath the schema's `entry.path`.
 * @returns {string[]} absolute paths of sample entry directories.
 */
export function listSampleEntries(root, entryPath) {
  const dir = path.join(root, entryPath);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => path.join(dir, item.name))
    .filter((folder) => {
      const file = path.join(folder, 'index.md');
      if (!fs.existsSync(file)) return false;
      return frontMatter(fs.readFileSync(file, 'utf8'))?.sample === true;
    });
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A one-line `+n -n lines` (or "new file" / "unchanged") summary of how `next`
 * differs from the file currently on disk, using a line-multiset comparison
 * rather than a real diff — good enough for a preview, not a patch.
 *
 * @param {string} root repository root.
 * @param {string} relative repo-relative path.
 * @param {string} next the file's about-to-be-written contents.
 * @returns {string} colorized summary text.
 */
export function diffSummary(root, relative, next) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) return green(`new file, ${next.split('\n').length - 1} lines`);
  const current = fs.readFileSync(file, 'utf8');
  if (current === next) return dim('unchanged');
  const counts = new Map();
  for (const line of current.split('\n')) counts.set(line, (counts.get(line) || 0) + 1);
  let added = 0;
  for (const line of next.split('\n')) {
    const seen = counts.get(line) || 0;
    if (seen > 0) counts.set(line, seen - 1);
    else added += 1;
  }
  let removed = 0;
  for (const seen of counts.values()) removed += seen;
  return `${green(`+${added}`)} ${red(`-${removed}`)} lines`;
}

/**
 * Write every rendered file under `target`, creating directories as needed.
 * @param {string} target directory to write into.
 * @param {Record<string, string>} files path -> contents.
 */
export function writeFiles(target, files) {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(target, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf8');
  }
}
