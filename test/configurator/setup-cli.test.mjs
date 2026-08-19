/**
 * The pure halves of `npm run setup`: the flag table and the repository/YAML
 * readers. Neither prompts, so both can be exercised without a terminal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { helpText, parseArgs, FLAGS } from '../../scripts/lib/setup-args.mjs';
import {
  entryPathFrom,
  frontMatter,
  listSampleEntries,
  repositoryFromGitUrl,
  schemaFieldKeys,
} from '../../scripts/lib/setup-io.mjs';

/** parseArgs without the console noise. */
const parse = (argv) => {
  const warnings = [];
  const args = parseArgs(argv, { warn: (message) => warnings.push(message) });
  return { args, warnings };
};

/* --- flags ---------------------------------------------------------------- */

test('every flag defaults to off', () => {
  const { args, warnings } = parse([]);
  assert.deepEqual(args, { preset: null, yes: false, dryRun: false, out: null, help: false });
  assert.deepEqual(warnings, []);
});

test('values are accepted both separated and inline', () => {
  assert.equal(parse(['--preset', 'blank']).args.preset, 'blank');
  assert.equal(parse(['--preset=blank']).args.preset, 'blank');
  assert.equal(parse(['--out', 'build']).args.out, 'build');
  assert.equal(parse(['--out=build']).args.out, 'build');
});

test('a flag value is never mistaken for another flag position', () => {
  // The old hand-rolled loop consumed argv[++i] blindly; make sure the value
  // is taken and the next token is still parsed as a flag.
  const { args } = parse(['--preset', 'cohort-portal', '--dry-run']);
  assert.equal(args.preset, 'cohort-portal');
  assert.equal(args.dryRun, true);
});

test('aliases are honoured', () => {
  assert.equal(parse(['-y']).args.yes, true);
  assert.equal(parse(['--dry']).args.dryRun, true);
  assert.equal(parse(['-h']).args.help, true);
});

test('--out implies --yes so a scripted run never blocks on a prompt', () => {
  const { args } = parse(['--out=/tmp/x']);
  assert.equal(args.yes, true);
});

test('unknown flags, missing values and stray values are reported, not guessed at', () => {
  assert.match(parse(['--nope']).warnings[0], /unknown argument/);
  assert.deepEqual(parse(['--preset']).args.preset, null);
  assert.match(parse(['--preset']).warnings[0], /needs a value/);
  assert.match(parse(['--yes=please']).warnings[0], /takes no value/);
  assert.equal(parse(['--yes=please']).args.yes, true);
});

test('--help lists every flag, with the preset ids inline', () => {
  const text = helpText(['blank', 'ai-use-cases']);
  for (const flag of FLAGS) assert.ok(text.includes(flag.name), `${flag.name} is missing from --help`);
  assert.match(text, /blank \| ai-use-cases/);
});

/* --- git remotes ---------------------------------------------------------- */

test('owner/repo is read out of every git remote spelling', () => {
  assert.equal(repositoryFromGitUrl('git@github.com:bigcities/ai-catalog.git'), 'bigcities/ai-catalog');
  assert.equal(repositoryFromGitUrl('https://github.com/bigcities/ai-catalog.git'), 'bigcities/ai-catalog');
  assert.equal(repositoryFromGitUrl('https://github.com/bigcities/ai-catalog'), 'bigcities/ai-catalog');
  assert.equal(
    repositoryFromGitUrl('ssh://git@github.com/bigcities/ai-catalog.git\n'),
    'bigcities/ai-catalog'
  );
});

test('non-GitHub and malformed remotes yield null rather than a wrong default', () => {
  assert.equal(repositoryFromGitUrl('git@gitlab.com:bigcities/ai-catalog.git'), null);
  assert.equal(repositoryFromGitUrl('https://github.com/bigcities'), null);
  assert.equal(repositoryFromGitUrl(''), null);
  assert.equal(repositoryFromGitUrl(undefined), null);
  // "notgithub.com" must not pass for github.com.
  assert.equal(repositoryFromGitUrl('https://notgithub.com/a/b'), null);
});

/* --- schema and front matter --------------------------------------------- */

test('the entry path comes from the parsed schema, quoting and all', () => {
  assert.equal(entryPathFrom({ entry: { path: 'projects' } }), 'projects');
  assert.equal(entryPathFrom({ entry: { path: '  projects  ' } }), 'projects');
  assert.equal(entryPathFrom({ entry: {} }), 'catalog');
  assert.equal(entryPathFrom(null), 'catalog');
});

test('field keys come from the parsed schema, not from a line pattern', () => {
  const schema = {
    fields: [{ key: 'title' }, { key: 'summary' }, { label: 'no key' }, { key: 'agency' }],
  };
  assert.deepEqual(schemaFieldKeys(schema), ['title', 'summary', 'agency']);
  assert.deepEqual(schemaFieldKeys(null), []);
});

test('front matter is parsed as YAML, so a "sample:" mention in the body is not a match', () => {
  assert.deepEqual(frontMatter('---\nslug: a\nsample: true\n---\n\nBody'), { slug: 'a', sample: true });
  assert.equal(frontMatter('---\nslug: a\n---\nsample: true\n').sample, undefined);
  assert.equal(frontMatter('no front matter'), null);
  assert.equal(frontMatter('---\nunterminated: true\n'), null);
});

test('listSampleEntries only returns folders whose front matter says sample: true', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-io-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const entry = (slug, body) => {
    fs.mkdirSync(path.join(root, 'catalog', slug), { recursive: true });
    fs.writeFileSync(path.join(root, 'catalog', slug, 'index.md'), body);
  };
  entry('shipped', '---\nslug: shipped\nsample: true\n---\nBody\n');
  entry('mine', '---\nslug: mine\n---\nWe are not a sample: true\n');
  entry('quoted', '---\nslug: quoted\nsample: "true"\n---\nBody\n');
  fs.mkdirSync(path.join(root, 'catalog', 'empty'), { recursive: true });

  assert.deepEqual(
    listSampleEntries(root, 'catalog').map((dir) => path.basename(dir)),
    ['shipped']
  );
  assert.deepEqual(listSampleEntries(root, 'nowhere'), []);
});
