/**
 * The `updated` stamp runs on every push to main, unattended, and commits back.
 * What it must never do is claim an edit that did not happen: stamp a new
 * entry (that is `published`), stamp the template's sample content, move a
 * date backwards, or touch anything but the entry file's own front matter. And
 * it must be a no-op the second time, so the commit it makes cannot start a
 * loop.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { changedEntryFiles, stampFrontMatter, stampUpdated, today } from '../../scripts/stamp_updated.mjs';

const ENTRY = `---
layout: entry
title: "Service request routing"   # keep the comment
slug: service-request-routing
summary: "One paragraph."
published: 2026-05-02
featured: false
---

Body text.
`;

/** A miniature repository with a git history: one entry added, then edited. */
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@example.org',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@example.org',
      },
    }).trim();
  const write = (relative, text) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text, 'utf8');
  };
  git('init', '-q', '-b', 'main');
  write('_data/schema.yml', 'entry:\n  path: "catalog"\nfields: []\n');
  write('catalog/service-request-routing/index.md', ENTRY);
  write('catalog/sample-one/index.md', ENTRY.replace('featured: false', 'featured: false\nsample: true'));
  git('add', '-A');
  git('commit', '-q', '-m', 'first');
  const first = git('rev-parse', 'HEAD');
  return { root, git, write, first, read: (relative) => fs.readFileSync(path.join(root, relative), 'utf8') };
}

test('stampFrontMatter inserts `updated` after `published`, keeping comments and order', () => {
  const { text, changed, reason } = stampFrontMatter(ENTRY, '2026-08-18');
  assert.equal(changed, true);
  assert.equal(reason, 'inserted');
  assert.match(text, /^published: 2026-05-02\nupdated: 2026-08-18\nfeatured: false$/m);
  assert.match(text, /# keep the comment/, 'the YAML is edited as text, not re-emitted');
  assert.match(text, /\n---\n\nBody text\.\n$/, 'the body is untouched');
});

test('stampFrontMatter replaces an older date and leaves today or later alone', () => {
  const older = ENTRY.replace('published: 2026-05-02', 'published: 2026-05-02\nupdated: 2026-06-01');
  const bumped = stampFrontMatter(older, '2026-08-18');
  assert.equal(bumped.reason, 'stamped');
  assert.match(bumped.text, /^updated: 2026-08-18$/m);
  assert.doesNotMatch(bumped.text, /2026-06-01/);

  const same = stampFrontMatter(bumped.text, '2026-08-18');
  assert.equal(same.changed, false, 'the stamp commit re-triggering a run changes nothing');
  assert.equal(same.reason, 'current');

  const future = ENTRY.replace('published: 2026-05-02', 'published: 2026-05-02\nupdated: 2027-01-01');
  assert.equal(stampFrontMatter(future, '2026-08-18').changed, false, 'a date is never moved backwards');
});

test('stampFrontMatter respects the schema’s key, quoted values, and refuses sample or bare files', () => {
  const quoted = ENTRY.replace('published: 2026-05-02', 'published: 2026-05-02\nlast_edited: "2026-01-01"');
  const out = stampFrontMatter(quoted, '2026-08-18', 'last_edited');
  assert.match(out.text, /^last_edited: 2026-08-18$/m);
  assert.doesNotMatch(out.text, /^updated:/m, 'the default key is not also written');

  assert.equal(
    stampFrontMatter(ENTRY.replace('featured: false', 'sample: true'), '2026-08-18').reason,
    'sample'
  );
  assert.equal(stampFrontMatter('# not an entry\n', '2026-08-18').reason, 'no-front-matter');
  assert.equal(
    stampFrontMatter('---\ntitle: x\n', '2026-08-18').reason,
    'no-front-matter',
    'unterminated front matter'
  );
});

test('stampFrontMatter keeps CRLF line endings and never doubles the key', () => {
  const crlf = ENTRY.replace('published: 2026-05-02', 'published: 2026-05-02\nupdated: 2026-01-02').replace(
    /\n/g,
    '\r\n'
  );
  const out = stampFrontMatter(crlf, '2026-08-18');
  assert.equal(out.reason, 'stamped');
  assert.match(out.text, /\r\nupdated: 2026-08-18\r\n/);
  assert.doesNotMatch(out.text, /2026-01-02/);
  assert.equal(out.text.match(/^updated:/gm).length, 1, 'one updated line, not a stale twin');
  assert.doesNotMatch(out.text, /[^\r]\n/, 'still CRLF throughout');
  assert.match(
    stampFrontMatter(ENTRY.replace(/\n/g, '\r\n'), '2026-08-18').text,
    /\r\nupdated: 2026-08-18\r\n/
  );
});

test('changedEntryFiles lists modified entry files only — not added ones, not attachments', () => {
  const r = repo();
  r.write('catalog/service-request-routing/index.md', ENTRY.replace('One paragraph.', 'Two paragraphs.'));
  r.write('catalog/service-request-routing/screenshots/a.png', 'png');
  r.write('catalog/brand-new/index.md', ENTRY.replace('service-request-routing', 'brand-new'));
  r.write('_data/schema.yml', 'entry:\n  path: "catalog"\nfields: [{ key: x }]\n');
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'edits');
  const second = r.git('rev-parse', 'HEAD');
  assert.deepEqual(changedEntryFiles(r.root, r.first, second, 'catalog'), [
    'catalog/service-request-routing/index.md',
  ]);
  // A slug rename plus an edit in one push: without --no-renames git reports
  // it as R and the edit would go unstamped.
  fs.renameSync(path.join(r.root, 'catalog/sample-one'), path.join(r.root, 'catalog/sample-two'));
  r.write(
    'catalog/sample-two/index.md',
    r.read('catalog/sample-two/index.md').replace('sample-one', 'sample-two')
  );
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'rename');
  const third = r.git('rev-parse', 'HEAD');
  assert.deepEqual(changedEntryFiles(r.root, second, third, 'catalog'), []);
  assert.deepEqual(changedEntryFiles(r.root, r.first, third, 'catalog'), [
    'catalog/service-request-routing/index.md',
  ]);
  assert.deepEqual(
    changedEntryFiles(r.root, '0'.repeat(40), second, 'catalog'),
    [],
    'a branch creation has no baseline'
  );
  assert.deepEqual(
    changedEntryFiles(r.root, r.first, r.first, 'catalog'),
    [],
    'nothing between a commit and itself'
  );
});

test('stampUpdated writes the date into the edited entry and nowhere else, and is idempotent', () => {
  const r = repo();
  r.write('catalog/service-request-routing/index.md', ENTRY.replace('One paragraph.', 'Two paragraphs.'));
  r.write(
    'catalog/sample-one/index.md',
    r.read('catalog/sample-one/index.md').replace('One paragraph.', 'Edited.')
  );
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'edits');
  const second = r.git('rev-parse', 'HEAD');

  const planned = stampUpdated(r.root, { before: r.first, after: second, date: '2026-08-18', dryRun: true });
  assert.deepEqual(planned.stamped, ['catalog/service-request-routing/index.md']);
  assert.deepEqual(planned.skipped, [{ file: 'catalog/sample-one/index.md', reason: 'sample' }]);
  assert.doesNotMatch(
    r.read('catalog/service-request-routing/index.md'),
    /updated:/,
    '--dry-run writes nothing'
  );

  const done = stampUpdated(r.root, { before: r.first, after: second, date: '2026-08-18' });
  assert.deepEqual(done.stamped, planned.stamped);
  assert.match(r.read('catalog/service-request-routing/index.md'), /^updated: 2026-08-18$/m);
  assert.doesNotMatch(r.read('catalog/sample-one/index.md'), /updated:/);

  // The workflow commits that and, with a bot token, may run again on it.
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'chore(entries): stamp updated');
  const third = r.git('rev-parse', 'HEAD');
  const again = stampUpdated(r.root, { before: second, after: third, date: '2026-08-18' });
  assert.deepEqual(again.stamped, []);
  assert.deepEqual(again.skipped, [{ file: 'catalog/service-request-routing/index.md', reason: 'current' }]);
});

test('the CLI stamps with just the two shas — no --date needed — and reports through GITHUB_OUTPUT', () => {
  const r = repo();
  r.write('catalog/service-request-routing/index.md', ENTRY.replace('One paragraph.', 'Two paragraphs.'));
  r.git('add', '-A');
  r.git('commit', '-q', '-m', 'edits');
  const second = r.git('rev-parse', 'HEAD');
  const script = path.resolve('scripts/stamp_updated.mjs');
  const outputFile = path.join(r.root, 'output.txt');
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: r.root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputFile },
    });

  const dry = run(r.first, second, '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would stamp catalog\/service-request-routing\/index\.md \(\d{4}-\d{2}-\d{2}\)/);

  const dated = run(r.first, second, '--date', '2026-08-18');
  assert.equal(dated.status, 0, dated.stderr);
  assert.match(dated.stdout, /^stamped catalog\/service-request-routing\/index\.md \(2026-08-18\)$/m);
  assert.match(
    fs.readFileSync(outputFile, 'utf8'),
    /^count<<GHEOF_count_[0-9a-f]+\n1\n/m,
    'heredoc-safe outputs'
  );
  assert.match(fs.readFileSync(outputFile, 'utf8'), /catalog\/service-request-routing\/index\.md/);

  assert.equal(run(r.first).status, 2, 'one sha is a usage error');
  assert.equal(run(r.first, second, '--date', 'yesterday').status, 2, 'so is a malformed date');
});

test('today is a UTC calendar date', () => {
  assert.equal(today(new Date('2026-08-18T23:59:59Z')), '2026-08-18');
  assert.equal(today(new Date('2026-08-19T00:00:00Z')), '2026-08-19');
});
