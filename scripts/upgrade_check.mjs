#!/usr/bin/env node
/**
 * What a template upgrade would bring, before you merge it.
 *
 *   npm run upgrade:check -- --to v1.9.0  since the release in .phct-version.json
 *   npm run upgrade:check -- --from v1.1.0 --to v1.3.0
 *   npm run upgrade:check -- --remote upstream
 *
 * A fork of this template has two kinds of file in one repository: template
 * code, which a new release should replace outright, and the fork's own
 * configuration and content, which it must never touch. `.gitattributes`
 * encodes that split for git; this reads the same split back and sorts the
 * incoming diff into "take it" and "read it yourself", so a maintainer can see
 * the size of an upgrade without starting one.
 *
 * Read-only: it runs `git diff --name-status` and nothing else. It never
 * fetches, merges or writes. See docs/upgrading.md for the whole recipe.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { bold, cyan, dim, green, red } from './lib/setup-io.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the template's own releases are expected to live. */
const DEFAULT_REMOTE = 'template';

/**
 * The `merge=ours` patterns in `.gitattributes` — the fork's files, in the one
 * place that already had to be right for `git merge` to behave.
 *
 * @param {string} text the whole `.gitattributes`.
 * @returns {string[]} patterns, in file order.
 */
export function forkOwnedPatterns(text) {
  return forkOwnershipRules(text)
    .filter((rule) => rule.owned)
    .map((rule) => rule.pattern);
}

/**
 * Ordered ownership rules from .gitattributes. Later rules win, matching Git's
 * attribute semantics. `!merge` restores normal merging for template-owned
 * exceptions nested under a broad deployment-owned directory.
 *
 * @param {string} text
 * @returns {{pattern: string, owned: boolean}[]}
 */
export function forkOwnershipRules(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split(/\s+/))
    .filter((parts) =>
      parts.slice(1).some((attribute) => attribute === 'merge=ours' || attribute === '!merge')
    )
    .map(([pattern, ...attributes]) => ({
      pattern,
      owned: attributes.includes('merge=ours'),
    }));
}

/**
 * Does a repo-relative path match a `.gitattributes` pattern? Only the two
 * shapes the file actually uses are supported — an exact path and a `dir/**`
 * prefix — because a half-implemented glob engine that quietly mis-sorts one
 * path is worse than one that cannot be asked.
 *
 * @param {string} pattern
 * @param {string} file repo-relative, `/`-separated.
 * @returns {boolean}
 */
export function matchesPattern(pattern, file) {
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
  return pattern === file;
}

/**
 * Apply ordered .gitattributes ownership rules to a path.
 * String arrays remain supported for callers using forkOwnedPatterns().
 *
 * @param {({pattern: string, owned: boolean}|string)[]} rules
 * @param {string} file
 * @returns {boolean}
 */
export function isForkOwned(rules, file) {
  let owned = false;
  for (const rule of rules) {
    const pattern = typeof rule === 'string' ? rule : rule.pattern;
    if (matchesPattern(pattern, file)) owned = typeof rule === 'string' ? true : rule.owned;
  }
  return owned;
}

/**
 * Sort changed paths into the fork's files and the template's.
 *
 * @param {{status: string, file: string}[]} changes
 * @param {string[]} patterns from `forkOwnedPatterns`.
 * @returns {{yours: object[], template: object[]}}
 */
export function classify(changes, patterns) {
  const yours = [];
  const template = [];
  for (const change of changes) {
    (isForkOwned(patterns, change.file) ? yours : template).push(change);
  }
  return { yours, template };
}

/**
 * Parse `git diff --name-status` output.
 * @param {string} stdout
 * @returns {{status: string, file: string}[]}
 */
export function parseNameStatus(stdout) {
  return String(stdout ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('\t');
      // A rename is `R100\told\tnew`; the new name is what a merge would write.
      return { status: parts[0][0], file: parts[parts.length - 1] };
    });
}

/** `git` in the repository, or null when the command fails. */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/** Minimal flag parsing: `--from`, `--to`, `--remote`. */
export function parseArgs(argv) {
  const args = { from: '', to: '', remote: DEFAULT_REMOTE };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    const value = inline ?? argv[index + 1];
    if (!['--from', '--to', '--remote'].includes(flag)) continue;
    if (inline === undefined) index += 1;
    args[flag.slice(2)] = String(value ?? '').trim();
  }
  return args;
}

export function isImmutableUpdateRef(value) {
  return /^(?:v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|[0-9a-f]{40}|refs\/phct-update\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.test(
    value ?? ''
  );
}

/** The immutable PHCT release this deployment last consumed. */
export function consumedRelease(lockText, packageText) {
  try {
    const release = JSON.parse(lockText)?.release;
    if (/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(release ?? '')) return release;
  } catch {
    // Old forks predate the lock file; package.json remains a safe fallback.
  }
  try {
    const version = JSON.parse(packageText)?.version ?? '';
    return version ? `v${version}` : '';
  } catch {
    return '';
  }
}

function currentRelease() {
  const lockPath = path.join(ROOT, '.phct-version.json');
  return consumedRelease(
    fs.existsSync(lockPath) ? fs.readFileSync(lockPath, 'utf8') : '',
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
}

function main(argv) {
  const args = parseArgs(argv);
  const from = args.from || currentRelease();
  const to = args.to;

  if (!to) {
    console.error(`\n${red('Name an immutable PHCT release with --to.')}`);
    console.error(`  Example: ${cyan('npm run upgrade:check -- --to v1.9.0')}\n`);
    return 2;
  }
  if (!isImmutableUpdateRef(to)) {
    console.error(`\n${red(`Refusing moving or abbreviated update reference ${JSON.stringify(to)}.`)}`);
    console.error('  Use an exact semantic-version tag or full 40-character commit SHA.\n');
    return 2;
  }

  if (git(['rev-parse', '--git-dir']) === null) {
    console.error('Not a git repository.');
    return 1;
  }
  if (git(['rev-parse', '--verify', `${from}^{commit}`]) === null) {
    console.error(`\n${red(`Cannot find ${from}.`)}`);
    console.error(`  .phct-version.json says this deployment is on ${currentRelease() || 'no release'}.`);
    console.error(`  Fetch the template's tags first:  ${cyan(`git fetch ${args.remote} --tags`)}`);
    console.error(`  Or name a starting point:         ${cyan('npm run upgrade:check -- --from v1.2.0')}\n`);
    return 1;
  }
  if (git(['rev-parse', '--verify', `${to}^{commit}`]) === null) {
    console.error(`\n${red(`Cannot find ${to}.`)}`);
    console.error(`  Add the template as a remote:  ${cyan(`git remote add ${args.remote} <template url>`)}`);
    console.error(`  then                           ${cyan(`git fetch ${args.remote}`)}\n`);
    console.error('  docs/upgrading.md has the whole recipe.\n');
    return 1;
  }

  // Two dots, not three. A repository created with "Use this template" shares
  // no history with the template, so `from...to` has no merge base and would
  // fail — reported as "nothing to upgrade", which is the one wrong answer this
  // must never give. Both refs name points on the template's own history
  // anyway, so comparing the two trees directly is also the question being
  // asked: what did the template change between these releases?
  const changes = parseNameStatus(git(['diff', '--name-status', from, to]) ?? '');
  if (changes.length === 0) {
    console.log(green(`\nNothing to upgrade — ${from} and ${to} have the same files.\n`));
    return 0;
  }

  const attributes = path.join(ROOT, '.gitattributes');
  const rules = fs.existsSync(attributes) ? forkOwnershipRules(fs.readFileSync(attributes, 'utf8')) : [];
  const { yours, template } = classify(changes, rules);

  console.log(bold(`\n${from} → ${to}: ${changes.length} files changed\n`));

  console.log(bold(`  Template code (${template.length}) — take the template's version`));
  for (const change of template) console.log(`    ${dim(change.status)} ${change.file}`);
  if (template.length === 0) console.log(dim('    none'));

  console.log('');
  console.log(bold(`  Yours (${yours.length}) — kept as they are; read these diffs yourself`));
  for (const change of yours) console.log(`    ${dim(change.status)} ${change.file}`);
  if (yours.length === 0) console.log(dim('    none'));

  // Without the driver, every `merge=ours` line in .gitattributes is inert and
  // the "Yours" list above is exactly the set of files that will conflict.
  if (git(['config', '--get', 'merge.ours.driver']) === null) {
    console.log(`\n  ${red('merge.ours.driver is not set in this clone.')}`);
    console.log(`  Until it is, .gitattributes does nothing and all ${yours.length} of your files conflict:`);
    console.log(`    ${cyan('git config merge.ours.driver true')}`);
  }

  console.log(`\n  Read what changed:  ${cyan(`git log --oneline ${from}..${to} -- CHANGELOG.md`)}`);
  console.log(`  Then upgrade:       ${cyan(`git merge ${to}`)}`);
  console.log(dim('\n  Nothing was fetched, merged or written. See docs/upgrading.md.\n'));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
