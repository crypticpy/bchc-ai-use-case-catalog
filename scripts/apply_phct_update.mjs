#!/usr/bin/env node
/** Apply one immutable PHCT release diff to an unrelated downstream history. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { forkOwnershipRules, isForkOwned, isImmutableUpdateRef } from './upgrade_check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Parse `git diff --name-status -z --find-renames` without losing rename sources.
 *
 * @param {string} output
 * @returns {{status: string, oldPath?: string, path: string}[]}
 */
export function parseNameStatusZ(output) {
  const fields = String(output ?? '').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];

  for (let index = 0; index < fields.length;) {
    const rawStatus = fields[index++];
    const status = rawStatus[0];
    if (!'ACDMRT'.includes(status)) {
      throw new Error(`Unsupported parent diff status ${JSON.stringify(rawStatus)}.`);
    }
    if (status === 'R' || status === 'C') {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (!oldPath || !newPath) throw new Error(`Incomplete ${status} record in parent diff.`);
      changes.push({ status, oldPath, path: newPath });
    } else {
      const file = fields[index++];
      if (!file) throw new Error(`Incomplete ${status} record in parent diff.`);
      changes.push({ status, path: file });
    }
  }

  return changes;
}

/**
 * Turn the parent diff into exact, ownership-aware filesystem operations.
 * Template-owned paths take the target release byte-for-byte. Deployment-owned
 * paths are left untouched and are checked again by the checksum gate.
 *
 * @param {{status: string, oldPath?: string, path: string}[]} changes
 * @param {{pattern: string, owned: boolean}[]} rules
 */
export function planUpdate(changes, rules) {
  const take = new Set();
  const remove = new Set();
  const preserve = new Set();

  function planPath(file, operation) {
    if (isForkOwned(rules, file)) {
      preserve.add(file);
      return;
    }
    (operation === 'remove' ? remove : take).add(file);
  }

  for (const change of changes) {
    if (change.status === 'R') planPath(change.oldPath, 'remove');
    if (change.status !== 'C' && change.status !== 'R') {
      planPath(change.path, change.status === 'D' ? 'remove' : 'take');
    } else {
      planPath(change.path, 'take');
    }
  }

  for (const file of take) remove.delete(file);
  return {
    take: [...take].sort(),
    remove: [...remove].sort(),
    preserve: [...preserve].sort(),
  };
}

function assertRef(root, ref, label) {
  if (!isImmutableUpdateRef(ref)) {
    throw new Error(`${label} must be an immutable semantic-version tag, update ref, or full SHA.`);
  }
  git(root, ['rev-parse', '--verify', `${ref}^{commit}`]);
}

/**
 * Apply the exact parent diff without assuming that the GitHub-template clone
 * shares commit ancestry with PHCT.
 *
 * @param {{root?: string, from: string, to: string}} options
 */
export function applyUpdate({ root = ROOT, from, to }) {
  assertRef(root, from, 'Starting reference');
  assertRef(root, to, 'Target reference');

  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  const rules = forkOwnershipRules(attributes);
  const changes = parseNameStatusZ(
    git(root, ['diff', '--name-status', '-z', '--find-renames', from, to, '--'])
  );
  const plan = planUpdate(changes, rules);

  for (const file of plan.remove) {
    git(root, ['rm', '--quiet', '--force', '--ignore-unmatch', '--', file]);
  }
  for (const file of plan.take) {
    git(root, ['checkout', '--quiet', to, '--', file]);
  }

  const unmerged = git(root, ['diff', '--name-only', '--diff-filter=U', '--']).trim();
  if (unmerged) throw new Error(`Update left unresolved paths:\n${unmerged}`);

  return { changes, ...plan };
}

function parseArgs(argv) {
  const args = { from: '', to: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inline] = argv[index].split('=');
    if (!['--from', '--to'].includes(flag)) continue;
    args[flag.slice(2)] = String(inline ?? argv[++index] ?? '').trim();
  }
  return args;
}

function main(argv) {
  const { from, to } = parseArgs(argv);
  if (!from || !to) {
    console.error('Usage: node scripts/apply_phct_update.mjs --from <immutable-ref> --to <immutable-ref>');
    return 2;
  }

  try {
    const result = applyUpdate({ from, to });
    console.log(
      `Applied ${result.take.length + result.remove.length} template-owned changes from ${from} to ${to}; preserved ${result.preserve.length} deployment-owned paths.`
    );
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
