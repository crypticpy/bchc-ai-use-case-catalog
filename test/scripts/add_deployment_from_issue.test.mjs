/**
 * "Also deployed by" (scripts/add_deployment_from_issue.mjs). Anyone can open
 * the issue this runs on and every path writes to a file in the checkout — so
 * what is tested here is: the slug can never leave the entry directory, the
 * only edit is the one key the schema points at, a resubmission updates its own
 * row instead of adding a second, an address that is not one is refused before
 * it can be published, and every dead end ends with a sentence a non-coder can
 * act on rather than silence.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkAnswers,
  mergeDeployment,
  readDeploymentForm,
  resolveEntryFile,
  spliceKey,
} from '../../scripts/add_deployment_from_issue.mjs';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/add_deployment_from_issue.mjs'
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

const SCHEMA = `entry:
  path: "catalog"
  deployments_key: "also_deployed_by"
fields:
  - key: also_deployed_by
    label: "Also deployed by"
    type: links
    form: false
`;

/** The issue body GitHub renders from .github/ISSUE_TEMPLATE/also-deployed-by.yml. */
function form({
  slug = 'service-request-routing',
  org = 'Multnomah County Health Department',
  url = 'https://www.multco.us/health',
  email = '_No response_',
  note = '_No response_',
} = {}) {
  return [
    '### Entry slug',
    '',
    slug,
    '',
    '### Organization',
    '',
    org,
    '',
    '### Link',
    '',
    url,
    '',
    '### Contact email',
    '',
    email,
    '',
    '### Anything worth knowing?',
    '',
    note,
    '',
  ].join('\n');
}

/** A miniature repository: a schema, one real entry, one sample entry. */
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'also-deployed-'));
  const write = (relative, text) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text, 'utf8');
  };
  write('_data/schema.yml', SCHEMA);
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

/* ----------------------------------------------------- readDeploymentForm */

test('readDeploymentForm reads the five answers the form collects', () => {
  const parsed = readDeploymentForm(
    form({ email: 'team@multco.us', note: 'We retrained it on our own transcripts.' })
  );
  assert.deepEqual(parsed, {
    slug: 'service-request-routing',
    org: 'Multnomah County Health Department',
    url: 'https://www.multco.us/health',
    email: 'team@multco.us',
    note: 'We retrained it on our own transcripts.',
  });
});

test('readDeploymentForm treats the unanswered optional boxes as empty, not as the words', () => {
  const parsed = readDeploymentForm(form());
  assert.equal(parsed.email, '');
  assert.equal(parsed.note, '');
});

test('readDeploymentForm normalises a slug someone pasted as a path', () => {
  assert.equal(
    readDeploymentForm(form({ slug: '/Service-Request-Routing/' })).slug,
    'service-request-routing'
  );
});

test('readDeploymentForm strips a mailto: someone pasted into the email box', () => {
  assert.equal(readDeploymentForm(form({ email: 'mailto:team@multco.us' })).email, 'team@multco.us');
});

test('a "### " heading inside the note cannot forge an earlier answer', () => {
  const parsed = readDeploymentForm(form({ note: 'We adapted it.\n\n### Organization\n\nSomeone Else' }));
  assert.equal(parsed.org, 'Multnomah County Health Department');
  assert.match(parsed.note, /### Organization/);
});

/* ------------------------------------------------------------ checkAnswers */

test('checkAnswers passes a complete, well-shaped submission', () => {
  assert.equal(
    checkAnswers({ org: 'County', url: 'https://example.gov', email: 'a@example.gov', note: 'Short.' }),
    ''
  );
});

test('checkAnswers names the one box that is missing', () => {
  assert.match(checkAnswers({ org: '', url: 'https://x.gov', email: '', note: '' }), /\*\*Organization\*\*/);
  assert.match(checkAnswers({ org: 'County', url: '', email: '', note: '' }), /\*\*Link\*\*/);
});

test('checkAnswers refuses a link that is not a web address', () => {
  for (const url of ['example.gov', 'javascript:alert(1)', 'https://x.gov two']) {
    assert.match(
      checkAnswers({ org: 'County', url, email: '', note: '' }),
      /has to start with/,
      `${url} should be refused`
    );
  }
});

test('checkAnswers refuses an email that is not one, but allows an empty box', () => {
  assert.match(
    checkAnswers({ org: 'County', url: 'https://x.gov', email: 'nobody', note: '' }),
    /not an email address/
  );
  assert.equal(checkAnswers({ org: 'County', url: 'https://x.gov', email: '', note: '' }), '');
});

test('checkAnswers asks for a shorter note rather than truncating one', () => {
  const long = 'a'.repeat(401);
  assert.match(checkAnswers({ org: 'County', url: 'https://x.gov', email: '', note: long }), /shorten it/);
});

/* ------------------------------------------------------- resolveEntryFile */

test('resolveEntryFile reports the repo-relative path of the entry', () => {
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

test('resolveEntryFile asks for the slug rather than guessing when the box is empty', () => {
  const { root } = repo();
  assert.match(resolveEntryFile(root, '', 'catalog').reason, /\*\*Entry slug\*\* box is empty/);
});

/* -------------------------------------------------------- mergeDeployment */

test('mergeDeployment appends to a field that has no value yet', () => {
  const { items, action } = mergeDeployment(undefined, { label: 'County', url: 'https://x.gov' });
  assert.equal(action, 'added');
  assert.deepEqual(items, [{ label: 'County', url: 'https://x.gov' }]);
});

test('mergeDeployment keeps the optional keys only when they carry something', () => {
  const { items } = mergeDeployment([], {
    label: 'County',
    url: 'https://x.gov',
    email: '',
    note: 'A note.',
  });
  assert.deepEqual(items, [{ label: 'County', url: 'https://x.gov', note: 'A note.' }]);
});

test('mergeDeployment updates the same organization in place, whatever its case', () => {
  const existing = [
    { label: 'Elsewhere City', url: 'https://elsewhere.gov' },
    { label: 'County', url: 'https://old.example.gov' },
  ];
  const { items, action } = mergeDeployment(existing, {
    label: 'COUNTY',
    url: 'https://new.example.gov',
    note: 'Moved.',
  });
  assert.equal(action, 'updated');
  assert.equal(items.length, 2);
  assert.deepEqual(items[1], { label: 'COUNTY', url: 'https://new.example.gov', note: 'Moved.' });
});

test('mergeDeployment recognises a resubmission by its link when the name was retyped', () => {
  const existing = [{ label: 'County of Somewhere', url: 'https://somewhere.gov' }];
  const { items, action } = mergeDeployment(existing, {
    label: 'Somewhere County',
    url: 'https://SOMEWHERE.gov',
  });
  assert.equal(action, 'updated');
  assert.equal(items.length, 1);
});

test('mergeDeployment normalises a bare-string item instead of dropping it', () => {
  // `check_front_matter.rb`'s `check_links` and `_includes/field-value.html`'s
  // `fv_l.url | default: fv_l` both already accept a bare URL string as
  // shorthand for `{label: url, url: url}` — mergeDeployment must not silently
  // delete one just because it arrived as a string rather than a mapping.
  const { items } = mergeDeployment(['https://city.example.gov/thing'], {
    label: 'County',
    url: 'https://x.gov',
  });
  assert.deepEqual(items, [
    { label: 'https://city.example.gov/thing', url: 'https://city.example.gov/thing' },
    { label: 'County', url: 'https://x.gov' },
  ]);
});

test('a resubmission of a string item is recognised by its URL and updates it in place', () => {
  const existing = ['https://city.example.gov/thing'];
  const { items, action } = mergeDeployment(existing, {
    label: 'City of Example',
    url: 'https://city.example.gov/thing',
    note: 'Now the canonical listing.',
  });
  assert.equal(action, 'updated');
  assert.deepEqual(items, [
    { label: 'City of Example', url: 'https://city.example.gov/thing', note: 'Now the canonical listing.' },
  ]);
});

test('mergeDeployment ignores non-string, non-object junk already in the list', () => {
  const { items } = mergeDeployment([null, 42, ['nested']], { label: 'County', url: 'https://x.gov' });
  assert.deepEqual(items, [{ label: 'County', url: 'https://x.gov' }]);
});

/* --------------------------------------------------------------- spliceKey */

test('spliceKey replaces only the target block and leaves every other line alone', () => {
  const frontMatter = [
    'title: "T"   # a comment',
    'also_deployed_by:',
    '  - label: Old',
    '    url: https://old.example.gov',
    'published: 2024-05-02',
  ].join('\n');
  const out = spliceKey(frontMatter, 'also_deployed_by', [{ label: 'New', url: 'https://new.example.gov' }]);
  assert.match(out, /title: "T" {3}# a comment/);
  assert.match(out, /^published: 2024-05-02$/m);
  assert.doesNotMatch(out, /Old/);
  assert.match(out, /- label: New/);
});

test('spliceKey rewrites the block at the position it already occupied, not the end', () => {
  const frontMatter = [
    'title: "T"',
    'also_deployed_by:',
    '  - label: Old',
    '    url: https://old.example.gov',
    'summary: "One paragraph."',
    'published: 2024-05-02',
  ].join('\n');
  const out = spliceKey(frontMatter, 'also_deployed_by', [{ label: 'New', url: 'https://new.example.gov' }]);
  const lines = out.split('\n');
  // A one-item addition must read as a small diff at the key's original spot —
  // between `title` and `summary` — not a deletion at that spot plus an
  // unrelated addition after `published`.
  assert.equal(lines[0], 'title: "T"');
  assert.equal(lines[1], 'also_deployed_by:');
  assert.match(lines[2], /- label: New/);
  assert.equal(lines.at(-2), 'summary: "One paragraph."');
  assert.equal(lines.at(-1), 'published: 2024-05-02');
});

test('spliceKey appends the key when the front matter does not carry it yet', () => {
  const out = spliceKey('title: "T"', 'also_deployed_by', [{ label: 'New', url: 'https://x.gov' }]);
  assert.equal(out.split('\n')[0], 'title: "T"');
  assert.match(out, /also_deployed_by:/);
});

test('spliceKey does not mistake a key that merely starts with the same letters', () => {
  const frontMatter = ['also_deployed_by_someone: yes', 'title: "T"'].join('\n');
  const out = spliceKey(frontMatter, 'also_deployed_by', []);
  assert.match(out, /^also_deployed_by_someone: yes$/m);
});

/* ------------------------------------------------------------ end to end */

test('a complete submission writes the item and reports a branch named after the issue', () => {
  const { root, read } = repo();
  const result = run(
    root,
    form({ email: 'team@multco.us', note: 'We run it in review mode rather than auto-routing.' })
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.outputs.get('outcome'), 'added');
  assert.equal(result.outputs.get('action'), 'added');
  assert.equal(result.outputs.get('slug'), 'service-request-routing');
  assert.equal(result.outputs.get('file'), 'catalog/service-request-routing/index.md');
  assert.equal(result.outputs.get('branch'), 'also-deployed/service-request-routing-42');
  assert.equal(result.outputs.get('entry_url'), '/catalog/service-request-routing/');
  assert.equal(result.outputs.get('org'), 'Multnomah County Health Department');

  const after = read('catalog/service-request-routing/index.md');
  assert.match(after, /^also_deployed_by:$/m);
  // Quoting is scripts/lib/yaml.mjs's business — assert the value, not its quotes.
  assert.match(after, /- label: "?Multnomah County Health Department"?$/m);
  assert.match(after, /url: "https:\/\/www\.multco\.us\/health"/);
  assert.match(after, /email: "team@multco\.us"/);
  assert.match(after, /note: "?We run it in review mode rather than auto-routing\."?$/m);
  // Line-surgical: the comment and every other line survive.
  assert.match(after, /# keep the comment/);
  assert.match(after, /^published: 2024-05-02$/m);
  assert.match(after, /Body text\./);
});

test('an optional box left empty produces no key at all', () => {
  const { root, read } = repo();
  run(root, form());
  const after = read('catalog/service-request-routing/index.md');
  assert.doesNotMatch(after, /email:/);
  assert.doesNotMatch(after, /note:/);
});

test('the schema decides which key is written', () => {
  const { root, write, read } = repo();
  write(
    '_data/schema.yml',
    SCHEMA.replace('deployments_key: "also_deployed_by"', 'deployments_key: "running_it_too"').replace(
      '- key: also_deployed_by',
      '- key: running_it_too'
    )
  );
  const result = run(root, form());
  assert.equal(result.outputs.get('outcome'), 'added');
  assert.match(read('catalog/service-request-routing/index.md'), /^running_it_too:$/m);
});

test('a second identical submission changes nothing and says why', () => {
  const { root } = repo();
  run(root, form());
  const again = run(root, form());
  assert.equal(again.status, 0);
  assert.equal(again.outputs.get('outcome'), 'none');
  assert.match(again.outputs.get('reason'), /already lists \*\*Multnomah County Health Department\*\*/);
});

test('a corrected resubmission updates the same row instead of adding a second', () => {
  const { root, read } = repo();
  run(root, form());
  const again = run(root, form({ note: 'We moved it into production in March.' }));
  assert.equal(again.outputs.get('outcome'), 'added');
  assert.equal(again.outputs.get('action'), 'updated');
  const after = read('catalog/service-request-routing/index.md');
  assert.equal(after.match(/- label: "?Multnomah County Health Department/g).length, 1);
  assert.match(after, /note: "?We moved it into production in March\."?$/m);
});

test('a pre-existing bare-string item survives when the bot adds a new organization', () => {
  const { root, write, read } = repo();
  write(
    'catalog/service-request-routing/index.md',
    ENTRY.replace(
      'featured: false',
      'featured: false\nalso_deployed_by:\n  - "https://city.example.gov/thing"'
    )
  );
  const result = run(root, form({ org: 'Elsewhere City', url: 'https://elsewhere.gov' }));
  assert.equal(result.outputs.get('outcome'), 'added');
  assert.equal(result.outputs.get('action'), 'added');
  const after = read('catalog/service-request-routing/index.md');
  // The string item is neither lost nor left as a bare string — normalised to
  // the mapping shape the other items already use.
  assert.match(
    after,
    /- label: "?https:\/\/city\.example\.gov\/thing"?\n\s+url: "?https:\/\/city\.example\.gov\/thing"?/
  );
  assert.match(after, /- label: "?Elsewhere City"?$/m);

  // Resubmitting the same URL is recognised as the existing row, not a
  // duplicate.
  const again = run(root, form({ org: 'City of Example', url: 'https://city.example.gov/thing' }));
  assert.equal(again.outputs.get('outcome'), 'added');
  assert.equal(again.outputs.get('action'), 'updated');
  const final = read('catalog/service-request-routing/index.md');
  assert.equal((final.match(/url: "?https:\/\/city\.example\.gov\/thing"?/g) || []).length, 1);
});

test('a second organization is appended alongside the first', () => {
  const { root, read } = repo();
  run(root, form());
  run(root, form({ org: 'Elsewhere City', url: 'https://elsewhere.gov' }));
  const after = read('catalog/service-request-routing/index.md');
  assert.match(after, /- label: "?Multnomah County Health Department"?$/m);
  assert.match(after, /- label: "?Elsewhere City"?$/m);
});

test('an email that is not one is refused before it can be published', () => {
  const { root, read } = repo();
  const before = read('catalog/service-request-routing/index.md');
  const result = run(root, form({ email: 'reach me on teams' }));
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /not an email address/);
  assert.equal(read('catalog/service-request-routing/index.md'), before);
});

test('a link that is not a web address is refused', () => {
  const { root } = repo();
  const result = run(root, form({ url: 'ask us internally' }));
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /has to start with/);
});

test('an empty issue says so instead of failing the run', () => {
  const { root } = repo();
  const result = run(root, '');
  assert.equal(result.status, 0);
  assert.match(result.outputs.get('reason'), /The issue is empty/);
});

test('a missing entry is a no-change that explains how to find the slug', () => {
  const { root } = repo();
  const result = run(root, form({ slug: 'never-published' }));
  assert.equal(result.status, 0);
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /There is no entry at/);
  assert.match(result.outputs.get('reason'), /last part of its address/);
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

test('a schema with no deployments pointer says the feature is not configured', () => {
  const { root, write, read } = repo();
  const before = read('catalog/service-request-routing/index.md');
  write('_data/schema.yml', 'entry:\n  path: "catalog"\nfields: []\n');
  const result = run(root, form());
  assert.equal(result.status, 0);
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /entry\.deployments_key/);
  assert.equal(read('catalog/service-request-routing/index.md'), before);
});

test('a pointer at a field that is not a links field is reported, not obeyed', () => {
  const { root, write } = repo();
  write(
    '_data/schema.yml',
    'entry:\n  path: "catalog"\n  deployments_key: "summary"\nfields:\n  - key: summary\n    label: Summary\n    type: textarea\n'
  );
  const result = run(root, form());
  assert.equal(result.outputs.get('outcome'), 'none');
  assert.match(result.outputs.get('reason'), /not a\s+`links` field/);
});

test('an issue number that is not a number still produces a usable branch', () => {
  const { root } = repo();
  const result = run(root, form(), { issueNumber: '7; rm -rf /' });
  assert.match(result.outputs.get('branch'), /^also-deployed\/service-request-routing-[a-z0-9]+$/);
});
