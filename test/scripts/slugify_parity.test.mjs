/**
 * The JS and Ruby slug implementations must agree, character for character.
 *
 * They name the same things from different halves of the pipeline: the JS one
 * (assets/js/configurator/strings.js, re-exported by scripts/lib/issue_body.mjs)
 * previews a slug on /submit/ and names an entry folder; the Ruby one
 * (scripts/lib/slugify.rb) names cohort event ids. A divergence is invisible
 * until someone submits a title with an accent in it, and by then the URL is
 * published. So both run over one fixture list here.
 *
 * Modelled on the Ruby round trip in test/scripts/yaml.test.mjs, including its
 * skip when `ruby` is not on PATH.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { slugify } from '../../scripts/lib/issue_body.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const CASES = [
  // Plain ASCII, the shape most titles have.
  'Overdose Spike: Brief Generator!',
  'ALL CAPS',
  '2024 Cohort',
  '  spaced  out  ',
  '---leading and trailing---',
  // Accents and other Latin marks: folded to the base letter, never dropped.
  'Köln Gesundheitsamt',
  'Ciudad de México — Salud',
  'Mairie de Saint-Étienne',
  'Ñandú',
  'Réunion de cohorte',
  // Letters NFKD leaves whole: mapped to an ASCII spelling, not dropped.
  'Straße Gesundheitsamt',
  'Łódź — Øresund',
  'Ærø kommune / Œuvre',
  // Punctuation that is not a hyphen but reads like one.
  'Data — sharing – agreement',
  "Mayor's office / IT",
  // Compatibility decomposition (NFKD): a ligature and a full-width letter.
  'ﬁnance ofﬁce',
  'ＡＩ ＴＯＯＬ',
  // Nothing survives these; both sides must agree that the answer is "".
  '京都市',
  '🚑🚨',
  '',
];

test('the JS and Ruby slug implementations agree on every fixture', (t) => {
  const ruby = spawnSync(
    'ruby',
    [
      '-r',
      path.join(ROOT, 'scripts', 'lib', 'slugify.rb'),
      '-rjson',
      '-e',
      'print JSON.generate(JSON.parse(STDIN.read).map { |s| CatalogTemplate::Slugify.call(s) })',
    ],
    { input: JSON.stringify(CASES), encoding: 'utf8' }
  );

  if (ruby.error) {
    // Ruby is not on PATH everywhere; CI always has it.
    assert.equal(ruby.error.code, 'ENOENT', String(ruby.error));
    t.skip('ruby is not on PATH, so the parity half of this test did not run');
    return;
  }
  assert.equal(ruby.status, 0, ruby.stderr);

  const fromRuby = JSON.parse(ruby.stdout);
  const fromJs = CASES.map(slugify);
  CASES.forEach((value, i) => {
    assert.equal(fromRuby[i], fromJs[i], `slugify(${JSON.stringify(value)})`);
  });
});
