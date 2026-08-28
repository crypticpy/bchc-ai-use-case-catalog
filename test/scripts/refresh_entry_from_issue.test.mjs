/**
 * The refresh answer (scripts/refresh_entry_from_issue.mjs). Anyone can open the
 * issue this runs on, and the "yes" path writes to a file in the checkout — so
 * what is tested here is: the slug can never leave the entry directory, the only
 * edit is one date on one line, "no" never fabricates a diff, and every dead end
 * ends with a sentence a non-coder can act on rather than silence.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  noChangeReason,
  readRefreshForm,
  resolveEntryFile,
} from '../../scripts/refresh_entry_from_issue.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/refresh_entry_from_issue.mjs'
);

const ENTRY = `---
layout: entry
title: "Service request routing"   # keep the comment
slug: service-request-routing
summary: "One paragraph."
published: 2024-05-02
featured: false
---

Body text.
`;

/** The issue body GitHub renders from .github/ISSUE_TEMPLATE/refresh-entry.yml. */
function form({
  slug = 'service-request-routing',
  accurate = 'Yes — everything on the page is still correct',
  changes = '_No response_',
} = {}) {
  return [
    '### Entry slug',
    '',
    slug,
    '',
    '### Is the entry still accurate as published?',
    '',
    accurate,
    '',
    '### What changed?',
    '',
    changes,
    '',
  ].join('\n');
}

/** A miniature repository: a schema, one real entry, one sample entry. */
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'refresh-'));
  const write = (relative, text) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text, 'utf8');
  };
  write('_data/schema.yml', 'entry:\n  path: "catalog"\n  submitter_key: "submitter_github"\nfields: []\n');
  write('catalog/service-request-routing/index.md', ENTRY);
  write('catalog/demo-entry/index.md', ENTRY.replace('featured: false', 'featured: false\nsample: true'));
  return { root, write, read: (relative) => fs.readFileSync(path.join(root, relative), 'utf8') };
}

/** Read a $GITHUB_OUTPUT file the way the Actions runner does. */
function parseOutputs(raw) {
  const outputs = new Map();
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const heredoc = /^([A-Za-z0-9_-]+)<<(.+)$/.exec(lines[i]);
    if (!heredoc) continue;
    const [, key, delimiter] = heredoc;
    const buffer = [];
    i += 1;
    while (i < lines.length && lines[i] !== delimiter) {
      buffer.push(lines[i]);
      i += 1;
    }
    outputs.set(key, buffer.join('\n'));
  }
  return outputs;
}

function run(root, body, { issueNumber = '42' } = {}) {
  const outputFile = path.join(root, `outputs-${Math.random().toString(36).slice(2)}.txt`);
  fs.writeFileSync(outputFile, '');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ISSUE_BODY: body, ISSUE_NUMBER: issueNumber, GITHUB_OUTPUT: outputFile },
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    outputs: parseOutputs(fs.readFileSync(outputFile, 'utf8')),
  };
}

/* -------------------------------------------------------- readRefreshForm */

test('readRefreshForm reads the three answers the form collects', () => {
  const parsed = readRefreshForm(form({ changes: 'The tool was retired in March.' }));
  assert.deepEqual(parsed, {
    slug: 'service-request-routing',
    accurate: true,
    changes: 'The tool was retired in March.',
  });
});

test('readRefreshForm hears "No" as no', () => {
  assert.equal(readRefreshForm(form({ accurate: 'No — something has changed' })).accurate, false);
});

test('readRefreshForm reports an unanswered dropdown rather than assuming yes', () => {
  assert.equal(readRefreshForm(form({ accurate: '_No response_' })).accurate, null);
  assert.equal(readRefreshForm(form({ accurate: 'maybe' })).accurate, null);
});

test('readRefreshForm treats an unanswered textarea as empty, not as the words', () => {
  assert.equal(readRefreshForm(form()).changes, '');
});

test('readRefreshForm normalises a slug someone pasted as a path', () => {
  assert.equal(readRefreshForm(form({ slug: '/Service-Request-Routing/' })).slug, 'service-request-routing');
});

test('a "### " heading inside the write-up cannot forge an earlier answer', () => {
  const parsed = readRefreshForm(
    form({ accurate: 'No — something has changed', changes: 'It moved.\n\n### Entry slug\n\nsomething-else' })
  );
  assert.equal(parsed.slug, 'service-request-routing');
  assert.match(parsed.changes, /### Entry slug/);
});

/* ------------------------------------------------------- resolveEntryFile */

test('resolveEntryFile finds the entry and reports its repo-relative path', () => {
  const { root } = repo();
  const resolved = resolveEntryFile(root, 'service-request-routing', 'catalog');
  assert.equal(resolved.relative, 'catalog/service-request-routing/index.md');
  assert.equal(resolved.error, '');
  assert.equal(resolved.reason, '');
});

test('resolveEntryFile refuses a slug that is not a slug', () => {
  const { root } = repo();
  for (const bad of ['../../etc/passwd', 'a/b', 'Upper', 'has space', '.']) {
    const resolved = resolveEntryFile(root, bad, 'catalog');
    assert.match(resolved.error, /Refusing to/, `${bad} should be refused`);
    assert.equal(resolved.file, '');
  }
});

test('resolveEntryFile explains how to find the slug when there is no such entry', () => {
  const { root } = repo();
  const resolved = resolveEntryFile(root, 'no-such-entry', 'catalog');
  assert.equal(resolved.error, '');
  assert.match(resolved.reason, /There is no entry at `catalog\/no-such-entry\/index\.md`/);
  assert.match(resolved.reason, /last part of its address/);
});

test('resolveEntryFile asks for the slug rather than guessing when the box is empty', () => {
  const { root } = repo();
  const resolved = resolveEntryFile(root, '', 'catalog');
  assert.match(resolved.reason, /\*\*Entry slug\*\* box is empty/);
});

/* --------------------------------------------------------- noChangeReason */

test('noChangeReason says which of the three dead ends this was', () => {
  assert.match(
    noChangeReason('current', 'catalog/x/index.md', '2026-08-17'),
    /already carries a confirmation date/
  );
  assert.match(noChangeReason('sample', 'catalog/x/index.md', '2026-08-17'), /sample content/);
  assert.match(
    noChangeReason('no-front-matter', 'catalog/x/index.md', '2026-08-17'),
    /maintainer needs to look/
  );
});

/* ------------------------------------------------------------ end to end */

test('"yes" stamps verified with today and reports a branch named after the issue', () => {
  const { root, read } = repo();
  const result = run(root, form());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.get('outcome'), 'confirmed');
  assert.equal(result.outputs.get('slug'), 'service-request-routing');
  assert.equal(result.outputs.get('file'), 'catalog/service-request-routing/index.md');
  assert.equal(result.outputs.get('branch'), 'refresh/service-request-routing-42');

  const date = result.outputs.get('date');
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  const after = read('catalog/service-request-routing/index.md');
  assert.match(after, new RegExp(`^verified: ${date}$`, 'm'));
  // Line-surgical: the comment and every other line survive.
  assert.match(after, /# keep the comment/);
  assert.match(after, /^published: 2024-05-02$/m);
  assert.match(after, /Body text\./);
});

test('the schema decides which key is stamped', () => {
  const { root, write, read } = repo();
  write('_data/schema.yml', 'entry:\n  path: "catalog"\n  verified_key: "reconfirmed"\nfields: []\n');
  const result = run(root, form());
  assert.equal(result.outputs.get('outcome'), 'confirmed');
  assert.match(read('catalog/service-request-routing/index.md'), /^reconfirmed: \d{4}-\d{2}-\d{2}$/m);
});

test('a second identical answer changes nothing and says why', () => {
  const { root } = repo();
  run(root, form());
  const again = run(root, form());
  assert.equal(again.status, 0);
  assert.equal(again.outputs.get('outcome'), 'none');
  assert.match(again.outputs.get('reason'), /already carries a confirmation date/);
});

test('"no" with notes routes them to the maintainers and writes nothing', () => {
  const { root, read } = repo();
  const before = read('catalog/service-request-routing/index.md');
  const result = run(
    root,
    form({ accurate: 'No — something has changed', changes: 'The pilot went to production in March.' })
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.get('outcome'), 'changes');
  assert.equal(result.outputs.get('changes'), 'The pilot went to production in March.');
  assert.equal(result.outputs.get('file'), 'catalog/service-request-routing/index.md');
  // The "no" path never opens a pull request itself, but it reports the same
  // branch name a prior "yes" on this issue would have used, so the workflow
  // can find and close a stale confirmation left open by a retracted answer.
  assert.equal(result.outputs.get('branch'), 'refresh/service-request-routing-42');
  assert.equal(read('catalog/service-request-routing/index.md'), before);
});

test('"no" with an empty box asks for the one thing that is missing', () => {
  const { root } = repo();
  const result = run(root, form({ accurate: 'No — something has changed' }));
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /\*\*What changed\?\*\* box is empty/);
});

test('an unanswered dropdown is a no-change with an instruction, not a guess', () => {
  const { root, read } = repo();
  const before = read('catalog/service-request-routing/index.md');
  const result = run(root, form({ accurate: '_No response_' }));
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /pick one of the two options/);
  assert.equal(read('catalog/service-request-routing/index.md'), before);
});

test('an empty issue says so instead of failing the run', () => {
  const { root } = repo();
  const result = run(root, '');
  assert.equal(result.status, 0);
  assert.match(result.outputs.get('reason'), /The issue is empty/);
});

test('sample content is left alone and says why', () => {
  const { root, read } = repo();
  const before = read('catalog/demo-entry/index.md');
  const result = run(root, form({ slug: 'demo-entry' }));
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /sample content/);
  assert.equal(read('catalog/demo-entry/index.md'), before);
});

test('a traversal slug fails the step with an error the workflow can quote', () => {
  const { root } = repo();
  const result = run(root, form({ slug: '../../../etc' }));
  assert.equal(result.status, 1);
  assert.match(result.outputs.get('error'), /Refusing to use/);
  assert.equal(result.outputs.has('outcome'), false);
});

test('a missing entry is a no-change, not a failure', () => {
  const { root } = repo();
  const result = run(root, form({ slug: 'never-published' }));
  assert.equal(result.status, 0);
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /There is no entry at/);
});

test('an issue number that is not a number still produces a usable branch', () => {
  const { root } = repo();
  const result = run(root, form(), { issueNumber: '7; rm -rf /' });
  assert.match(result.outputs.get('branch'), /^refresh\/service-request-routing-[a-z0-9]+$/);
});
