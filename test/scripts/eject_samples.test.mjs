/**
 * `npm run eject:samples` is the step that turns the template's demo into a
 * fork's own catalog, so the things these tests pin are the ones that would be
 * expensive to get wrong: it must never delete an entry the fork wrote, it must
 * leave the feature data files parseable and still self-documenting, and it
 * must turn the demo banner off — the banner is what tells visitors the content
 * is fake, and content that is no longer fake with the banner still up is the
 * same bug in reverse.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

import {
  cohortYears,
  ejectSamples,
  ejectSummary,
  emptiedYaml,
  headerComment,
  manifestWithoutEntries,
  siteYamlWithModuleOff,
  siteYamlWithoutDemo,
} from '../../scripts/eject_samples.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** A miniature repository with one sample entry, one real one and a cohort. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eject-'));
  const write = (relative, text) => {
    fs.mkdirSync(path.join(root, path.dirname(relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), text, 'utf8');
  };
  write('_data/schema.yml', 'entry:\n  path: "catalog"\nfields: []\n');
  write(
    '_data/site.yml',
    '# Site configuration\nname: "Demo"\ndemo: true\nmodules:\n  catalog: true\n  governance: true   # the policies page\n'
  );
  write(
    '_data/events.yml',
    '# Site-wide events.\n# Cohort events live elsewhere.\n- id: one\n  name: "A call"\n'
  );
  write('_data/resources.yml', '# Curated resource groups.\n- group: "Start here"\n  items: []\n');
  write('_data/cohorts/2026.yml', 'title: "Cohort 2026"\nevents: []\n');
  write('cohorts/2026/index.md', '---\nlayout: cohort\nyear: "2026"\n---\n');
  write('catalog/sample-one/index.md', '---\ntitle: "Sample"\nsample: true\n---\n');
  write('catalog/ours/index.md', '---\ntitle: "Ours"\n---\n');
  write('_data/metrics.json', '{ "generated": "2026-08-18", "quarters": [] }\n');
  write('_data/showcase.yml', 'title: "The template"\nexamples: []\n');
  write('_showcase/cohort-portal/catalog/a-project/index.md', '---\ntitle: "A project"\nsample: true\n---\n');
  write('assets/images/showcase/cohort-portal-home.png', 'png');
  write(
    '_data/derivatives.json',
    JSON.stringify(
      {
        '/catalog/sample-one/screenshots/01.png': {
          w: 1280,
          h: 800,
          base: '/catalog/sample-one/screenshots/01',
        },
        '/catalog/ours/screenshots/01.png': { w: 1280, h: 800, base: '/catalog/ours/screenshots/01' },
      },
      null,
      2
    ) + '\n'
  );
  return { root, exists: (relative) => fs.existsSync(path.join(root, relative)) };
}

test('headerComment keeps the explanation and drops the data', () => {
  assert.equal(headerComment('# one\n# two\n- id: x\n'), '# one\n# two\n');
  assert.equal(headerComment('- id: x\n# trailing\n'), '', 'only the leading block counts');
  assert.equal(headerComment(''), '');
});

test('an emptied data file still parses as an empty list', () => {
  const emptied = emptiedYaml('# What this is.\n- id: one\n- id: two\n');
  assert.equal(emptied, '# What this is.\n[]\n');
  assert.deepEqual(yaml.load(emptied), [], 'a Liquid `for` over it renders nothing, not an error');
});

test('siteYamlWithoutDemo rewrites one line and leaves the comments alone', () => {
  const before =
    '# Site configuration\nname: "Demo"\ndemo: true  # remove when yours\nmodules:\n  catalog: true\n';
  const after = siteYamlWithoutDemo(before);
  assert.match(after, /^demo: false$/m);
  assert.match(after, /^# Site configuration$/m, 'comments survive — this is not a YAML round trip');
  assert.equal(yaml.load(after).demo, false);
  assert.equal(siteYamlWithoutDemo('name: "Mine"\n'), null, 'a fork with no demo key needs no change');
  assert.equal(siteYamlWithoutDemo('demo: false\n'), null, 'already off is not a change');
});

test('a nested `demo: true` belonging to something else is not touched', () => {
  // Only a top-level key is the banner switch; an indented one is another
  // block's business.
  assert.equal(siteYamlWithoutDemo('features:\n  demo: true\n'), null);
});

test('siteYamlWithModuleOff flips one indented module line and keeps its comment', () => {
  const before = 'demo: true\nmodules:\n  catalog: true\n  governance: true   # the policies page\n';
  const after = siteYamlWithModuleOff(before, 'governance');
  assert.match(after, /^ {2}governance: false {3}# the policies page$/m);
  assert.match(after, /^ {2}catalog: true$/m, 'the other modules are untouched');
  assert.match(after, /^demo: true$/m, 'the demo flag is someone else’s job');
  assert.equal(yaml.load(after).modules.governance, false);
  assert.equal(siteYamlWithModuleOff(before, 'events'), null, 'a module that is not there is not a change');
  assert.equal(siteYamlWithModuleOff('modules:\n  governance: false\n', 'governance'), null, 'already off');
  assert.equal(
    siteYamlWithModuleOff('governance: true\n', 'governance'),
    null,
    'a top-level key is not a module'
  );
});

test('only entries marked sample are removed', () => {
  const repo = fixture();
  const result = ejectSamples(repo.root);
  assert.deepEqual(result.entries, ['catalog/sample-one']);
  assert.equal(repo.exists('catalog/sample-one'), false);
  assert.equal(repo.exists('catalog/ours/index.md'), true, 'a fork’s own entry is never touched');
});

test('a cohort loses its data file and the page that reads it, together', () => {
  const repo = fixture();
  const result = ejectSamples(repo.root);
  assert.deepEqual(result.cohorts, ['_data/cohorts/2026.yml', 'cohorts/2026']);
  assert.equal(repo.exists('_data/cohorts/2026.yml'), false);
  assert.equal(repo.exists('cohorts/2026'), false, 'an orphan page would render a cohort with no title');
});

test('the feature data files are emptied, not deleted', () => {
  const repo = fixture();
  ejectSamples(repo.root);
  const events = fs.readFileSync(path.join(repo.root, '_data', 'events.yml'), 'utf8');
  assert.deepEqual(yaml.load(events), []);
  assert.match(events, /^# Site-wide events\.$/m, 'the instructions for filling it in stay');
});

test('the demo banner is turned off', () => {
  const repo = fixture();
  const result = ejectSamples(repo.root);
  assert.equal(result.demo, true);
  const site = yaml.load(fs.readFileSync(path.join(repo.root, '_data', 'site.yml'), 'utf8'));
  assert.equal(site.demo, false);
  assert.equal(site.name, 'Demo', 'the rest of the configuration is untouched');
});

test('the governance module is switched off, because its data file is the shipped example', () => {
  const repo = fixture();
  const result = ejectSamples(repo.root);
  assert.deepEqual(result.modulesOff, ['governance']);
  const site = yaml.load(fs.readFileSync(path.join(repo.root, '_data', 'site.yml'), 'utf8'));
  assert.equal(site.modules.governance, false);
  assert.equal(site.modules.catalog, true);
  assert.equal(site.demo, false, 'both site.yml edits land in one write');
});

test('--dry-run reports exactly what a real run would do, and writes nothing', () => {
  const repo = fixture();
  const planned = ejectSamples(repo.root, { dryRun: true });
  assert.equal(repo.exists('catalog/sample-one/index.md'), true);
  assert.equal(repo.exists('_data/cohorts/2026.yml'), true);
  assert.deepEqual(yaml.load(fs.readFileSync(path.join(repo.root, '_data', 'events.yml'), 'utf8')).length, 1);
  assert.deepEqual(ejectSamples(repo.root), planned);
});

test('a second run is a no-op with nothing to report', () => {
  const repo = fixture();
  ejectSamples(repo.root);
  const again = ejectSamples(repo.root);
  assert.deepEqual(again, {
    entries: [],
    cohorts: [],
    emptied: [],
    removed: [],
    showcase: [],
    pruned: [],
    demo: false,
    modulesOff: [],
  });
  assert.deepEqual(ejectSummary(again), [], 'the CLI prints "nothing to remove" off this');
});

test('the summary names every kind of thing it removed', () => {
  const repo = fixture();
  const lines = ejectSummary(ejectSamples(repo.root)).join('\n');
  assert.match(lines, /1 sample entries/);
  assert.match(lines, /_data\/cohorts\/2026\.yml/);
  assert.match(lines, /_data\/events\.yml and _data\/resources\.yml/);
  assert.match(lines, /demo banner off/);
  assert.match(lines, /governance module off/);
  assert.match(lines, /Removed _data\/metrics\.json/);
  assert.match(lines, /showcase \(_showcase, _data\/showcase\.yml, assets\/images\/showcase\)/);
  assert.match(lines, /sample screenshots from _data\/derivatives\.json/);
});

test('the showcase goes with the samples: a fork’s home page is its catalog', () => {
  const repo = fixture();
  const planned = ejectSamples(repo.root, { dryRun: true });
  assert.deepEqual(planned.showcase, ['_showcase', '_data/showcase.yml', 'assets/images/showcase']);
  assert.equal(repo.exists('_showcase/cohort-portal/catalog/a-project/index.md'), true, 'dry run leaves it');
  ejectSamples(repo.root);
  assert.equal(repo.exists('_showcase'), false, 'the whole directory goes, not just its entries');
  assert.equal(repo.exists('_data/showcase.yml'), false);
  assert.equal(repo.exists('assets/images/showcase'), false, 'the landing’s screenshots go too');
});

test('the sample screenshots leave _data/derivatives.json; the fork’s own records stay', () => {
  const repo = fixture();
  const planned = ejectSamples(repo.root, { dryRun: true });
  assert.deepEqual(planned.pruned, ['_data/derivatives.json']);
  ejectSamples(repo.root);
  const manifest = JSON.parse(fs.readFileSync(path.join(repo.root, '_data', 'derivatives.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest), ['/catalog/ours/screenshots/01.png']);
  assert.equal(
    manifestWithoutEntries('{}\n', ['catalog/sample-one']),
    null,
    'nothing to drop is not a change'
  );
  assert.equal(manifestWithoutEntries('not json', ['catalog/sample-one']), null);
});

test('the shipping repository’s metrics file goes, and the governance page hides the block', () => {
  const repo = fixture();
  const planned = ejectSamples(repo.root, { dryRun: true });
  assert.deepEqual(planned.removed, ['_data/metrics.json']);
  assert.equal(repo.exists('_data/metrics.json'), true, 'dry run leaves it');
  ejectSamples(repo.root);
  assert.equal(repo.exists('_data/metrics.json'), false);
});

test('cohortYears lists the years that have a data file', () => {
  const repo = fixture();
  assert.deepEqual(cohortYears(repo.root), ['2026']);
  ejectSamples(repo.root);
  assert.deepEqual(cohortYears(repo.root), [], 'nothing left to eject');
});

// This one reads the repository itself, so it is a template invariant rather
// than a unit test: while the sample entries ship, the demo banner must be up.
// A copy that has ejected them (the normal state of a fork) is skipped, not
// failed — there is nothing left for the invariant to be about.
test('while the sample entries ship, the repository is in demo mode', (t) => {
  const planned = ejectSamples(ROOT, { dryRun: true });
  if (planned.entries.length === 0) {
    return t.skip('no sample entries in this checkout — the demo content has been removed');
  }
  const site = yaml.load(fs.readFileSync(path.join(ROOT, '_data', 'site.yml'), 'utf8'));
  assert.equal(site.demo, true, '_includes/demo-banner.html renders off this');
  assert.equal(planned.demo, true, 'ejecting would turn the banner off');
});
