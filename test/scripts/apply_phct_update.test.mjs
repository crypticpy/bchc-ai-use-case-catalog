import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applyUpdate, parseNameStatusZ, planUpdate } from '../../scripts/apply_phct_update.mjs';
import { forkOwnershipRules } from '../../scripts/upgrade_check.mjs';

const SCRIPT = fileURLToPath(new URL('../../scripts/apply_phct_update.mjs', import.meta.url));

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

test('NUL name-status parsing retains both sides of renames and copies', () => {
  assert.deepEqual(parseNameStatusZ('M\0app.js\0R100\0old.md\0new.md\0C090\0a.txt\0b.txt\0'), [
    { status: 'M', path: 'app.js' },
    { status: 'R', oldPath: 'old.md', path: 'new.md' },
    { status: 'C', oldPath: 'a.txt', path: 'b.txt' },
  ]);
});

test('the update plan takes template files and leaves deployment files alone', () => {
  const rules = forkOwnershipRules('config/** merge=ours\nconfig/template/** !merge\n');
  const plan = planUpdate(
    [
      { status: 'M', path: 'app.js' },
      { status: 'D', path: 'old.js' },
      { status: 'M', path: 'config/site.yml' },
      { status: 'A', path: 'config/template/schema.yml' },
      { status: 'R', oldPath: 'before.md', path: 'after.md' },
    ],
    rules
  );
  assert.deepEqual(plan.take, ['after.md', 'app.js', 'config/template/schema.yml']);
  assert.deepEqual(plan.remove, ['before.md', 'old.js']);
  assert.deepEqual(plan.preserve, ['config/site.yml']);
});

test('the CLI runs when invoked through a symlinked path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-update-cli-'));
  const link = path.join(root, 'apply-update.mjs');
  fs.symlinkSync(SCRIPT, link);
  const result = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: node scripts\/apply_phct_update\.mjs/);
});

test('an unrelated GitHub-template history receives the exact parent diff without conflicts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-update-test-'));
  git(root, 'init', '--quiet', '--initial-branch=main');
  git(root, 'config', 'user.name', 'PHCT test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitattributes'), 'config/** merge=ours\n');
  fs.writeFileSync(path.join(root, 'app.txt'), 'parent v1\n');
  fs.writeFileSync(path.join(root, 'old.txt'), 'remove me\n');
  fs.writeFileSync(path.join(root, 'config', 'site.yml'), 'parent: v1\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'parent v1');
  git(root, 'tag', 'v1.0.0');
  const baselineTree = git(root, 'rev-parse', 'v1.0.0^{tree}');

  fs.writeFileSync(path.join(root, 'app.txt'), 'parent v2\n');
  fs.rmSync(path.join(root, 'old.txt'));
  fs.writeFileSync(path.join(root, 'added.txt'), 'new in parent\n');
  fs.writeFileSync(path.join(root, 'config', 'site.yml'), 'parent: v2\n');
  fs.writeFileSync(path.join(root, 'config', 'parent-only.yml'), 'do not import\n');
  git(root, 'add', '--all');
  git(root, 'commit', '--quiet', '-m', 'parent v2');
  git(root, 'tag', 'v1.1.0');

  const childRoot = git(root, 'commit-tree', baselineTree, '-m', 'template snapshot');
  git(root, 'branch', 'downstream', childRoot);
  git(root, 'checkout', '--quiet', 'downstream');
  fs.writeFileSync(path.join(root, 'config', 'site.yml'), 'bchc: true\n');
  git(root, 'add', '.');
  git(root, 'commit', '--quiet', '-m', 'customize downstream');

  assert.throws(() => git(root, 'merge-base', 'HEAD', 'v1.1.0'));
  const result = applyUpdate({ root, from: 'v1.0.0', to: 'v1.1.0' });

  assert.equal(fs.readFileSync(path.join(root, 'app.txt'), 'utf8'), 'parent v2\n');
  assert.equal(fs.readFileSync(path.join(root, 'added.txt'), 'utf8'), 'new in parent\n');
  assert.equal(fs.existsSync(path.join(root, 'old.txt')), false);
  assert.equal(fs.readFileSync(path.join(root, 'config', 'site.yml'), 'utf8'), 'bchc: true\n');
  assert.equal(fs.existsSync(path.join(root, 'config', 'parent-only.yml')), false);
  assert.deepEqual(result.preserve, ['config/parent-only.yml', 'config/site.yml']);
  assert.equal(git(root, 'diff', '--name-only', '--diff-filter=U'), '');
});
