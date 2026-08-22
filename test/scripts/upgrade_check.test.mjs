/**
 * The upgrade path's one dangerous failure is a file sorted into the wrong
 * column: a fork's `_data/site.yml` listed as "take the template's version"
 * loses the fork's configuration on the next merge. So these tests hold
 * `.gitattributes` and `scripts/upgrade_check.mjs` to the same answer — the
 * script reads the split out of that file rather than keeping a second copy of
 * it, and here we check the split itself covers what a fork actually owns.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classify,
  consumedRelease,
  forkOwnershipRules,
  forkOwnedPatterns,
  isForkOwned,
  isImmutableUpdateRef,
  matchesPattern,
  parseArgs,
  parseNameStatus,
} from '../../scripts/upgrade_check.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const attributes = fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8');
const patterns = forkOwnedPatterns(attributes);
const rules = forkOwnershipRules(attributes);

test('.gitattributes says out loud that the driver has to be configured', () => {
  // Without `git config merge.ours.driver true` every rule in the file is
  // silently inert, which is the worst way for a safety net to fail.
  assert.match(attributes, /git config merge\.ours\.driver true/);
});

test('forkOwnedPatterns reads the rules and ignores the prose', () => {
  assert.ok(patterns.includes('_data/site.yml'));
  assert.ok(patterns.includes('catalog/**'));
  assert.ok(
    patterns.every((pattern) => !pattern.startsWith('#')),
    'a comment mentioning merge=ours is not a rule'
  );
});

test('every file the configurators write is the fork’s, not the template’s', () => {
  // These are exactly the paths renderFiles() produces; if a release
  // overwrote one, the fork would silently revert to the demo's settings.
  for (const file of [
    '_data/site.yml',
    '_data/theme.yml',
    '_data/schema.yml',
    '_data/navigation.yml',
    '_config.yml',
    '.github/ISSUE_TEMPLATE/new-entry.yml',
  ]) {
    assert.ok(
      patterns.some((pattern) => matchesPattern(pattern, file)),
      `${file} is not marked merge=ours in .gitattributes`
    );
  }
});

test('all governance and search data remains deployment-owned', () => {
  for (const file of ['_data/governance.yml', '_data/search.yml', '_data/derivatives.json']) {
    assert.equal(isForkOwned(rules, file), true, `${file} is not protected`);
  }
});

test('ordered rules return PHCT showcase assets to template ownership', () => {
  assert.equal(isForkOwned(rules, 'assets/images/bchc-logo.svg'), true);
  assert.equal(isForkOwned(rules, 'assets/images/showcase/catalog-home.webp'), false);
});

test('template code is not claimed by the fork', () => {
  for (const file of [
    '_layouts/default.html',
    '_includes/entry-card.html',
    '_plugins/search_index.rb',
    'scripts/new_entry_from_issue.mjs',
    'assets/js/configurator/core.js',
    '.github/workflows/new-entry.yml',
    'package.json',
    'docs/launch.md',
    '_data/modules.yml',
    '_data/showcase.yml',
    '_showcase/ai-use-case-catalog.md',
    'assets/images/showcase/catalog-home.webp',
  ]) {
    assert.ok(
      !isForkOwned(rules, file),
      `${file} is marked merge=ours, so a fork would never receive template fixes to it`
    );
  }
});

test('matchesPattern handles the two shapes the file uses', () => {
  assert.equal(matchesPattern('catalog/**', 'catalog/a/index.md'), true);
  assert.equal(matchesPattern('catalog/**', 'catalogue/a.md'), false);
  assert.equal(matchesPattern('_data/site.yml', '_data/site.yml'), true);
  assert.equal(matchesPattern('_data/site.yml', '_data/site.yml.bak'), false);
});

test('parseNameStatus keeps the destination of a rename', () => {
  const parsed = parseNameStatus('M\t_layouts/default.html\nA\tdocs/upgrading.md\nR100\told.md\tnew.md\n');
  assert.deepEqual(parsed, [
    { status: 'M', file: '_layouts/default.html' },
    { status: 'A', file: 'docs/upgrading.md' },
    // The new name is what a merge would write, so that is the one to classify.
    { status: 'R', file: 'new.md' },
  ]);
});

test('classify splits an upgrade into the two lists a maintainer acts on', () => {
  const { yours, template } = classify(
    parseNameStatus('M\t_data/site.yml\nM\t_layouts/default.html\nA\tcatalog/mine/index.md\n'),
    patterns
  );
  assert.deepEqual(
    yours.map((change) => change.file),
    ['_data/site.yml', 'catalog/mine/index.md']
  );
  assert.deepEqual(
    template.map((change) => change.file),
    ['_layouts/default.html']
  );
});

test('classify applies nested template exceptions', () => {
  const { yours, template } = classify(
    parseNameStatus('A\tassets/images/logo.svg\nM\tassets/images/showcase/catalog.webp\n'),
    rules
  );
  assert.deepEqual(
    yours.map((change) => change.file),
    ['assets/images/logo.svg']
  );
  assert.deepEqual(
    template.map((change) => change.file),
    ['assets/images/showcase/catalog.webp']
  );
});

test('parseArgs takes both spellings of a flag', () => {
  assert.deepEqual(parseArgs(['--from', 'v1.1.0', '--to=v1.3.0']), {
    from: 'v1.1.0',
    to: 'v1.3.0',
    remote: 'template',
  });
  assert.equal(parseArgs([]).remote, 'template');
  assert.equal(parseArgs(['--remote', 'upstream']).remote, 'upstream');
});

test('the downstream lock is authoritative over package.json', () => {
  assert.equal(consumedRelease('{"release":"v1.8.1"}', '{"version":"9.9.9"}'), 'v1.8.1');
  assert.equal(consumedRelease('', '{"version":"1.2.3"}'), 'v1.2.3');
});

test('updates require immutable tags or full commit SHAs', () => {
  assert.equal(isImmutableUpdateRef('v1.9.0-rc.1'), true);
  assert.equal(isImmutableUpdateRef('a'.repeat(40)), true);
  assert.equal(isImmutableUpdateRef('refs/phct-update/v1.9.0'), true);
  assert.equal(isImmutableUpdateRef('refs/phct-update/from/v1.7.0'), true);
  assert.equal(isImmutableUpdateRef('refs/phct-update/to/v1.9.0-rc.1'), true);
  assert.equal(isImmutableUpdateRef('refs/phct-update/to/main'), false);
  assert.equal(isImmutableUpdateRef('template/main'), false);
  assert.equal(isImmutableUpdateRef('abc1234'), false);
});
