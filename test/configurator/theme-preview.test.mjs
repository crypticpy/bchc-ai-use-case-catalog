import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  RADIUS_SCALES,
  RADIUS_STEPS,
  themeVars,
  previewCopy,
} from '../../assets/js/configurator/theme-preview.js';

const themeInclude = readFileSync(
  fileURLToPath(new URL('../../_includes/theme.html', import.meta.url)),
  'utf8'
);

test('RADIUS_SCALES mirror the case in _includes/theme.html', () => {
  // The include keeps the hairline step in its own assign (`th_rxs`) and the
  // five sm…2xl steps in `th_r`; RADIUS_SCALES is the two concatenated, in the
  // order RADIUS_STEPS names them.
  const scale = (branch) => {
    const line = themeInclude.match(new RegExp(`${branch}.*`))?.[0] ?? '';
    const xs = line.match(/th_rxs = '([^']+)'/)?.[1];
    const rest = line.match(/th_r = '([^']+)'/)?.[1]?.split('|');
    return xs && rest ? [xs, ...rest] : null;
  };
  assert.deepEqual(RADIUS_STEPS, ['xs', 'sm', 'md', 'lg', 'xl', '2xl']);
  assert.deepEqual(RADIUS_SCALES.sharp, scale("when 'sharp'"));
  assert.deepEqual(RADIUS_SCALES.round, scale("when 'round'"));
  assert.deepEqual(RADIUS_SCALES.soft, scale('else'));
});

test('themeVars writes rgb triplets, quoted fonts and the radius scale', () => {
  const css = themeVars({
    primary: '#1D4E89',
    primaryDark: '#12305A',
    secondary: '#0F6357',
    accent: '#E07A2F',
    headingFont: 'Source Sans 3',
    bodyFont: 'Inter',
    radius: 'round',
  });
  assert.match(css, /--c-primary: 29 78 137;/);
  assert.match(css, /--c-primary-dark: 18 48 90;/);
  assert.match(css, /--c-secondary: 15 99 87;/);
  assert.match(css, /--c-accent: 224 122 47;/);
  assert.match(css, /--font-heading: "Source Sans 3";/);
  assert.match(css, /--font-body: "Inter";/);
  assert.match(css, /--radius-xs: 0\.375rem;.*--radius-sm: 0\.75rem;.*--radius-2xl: 2\.5rem;/);
});

test('themeVars skips invalid colours and unknown radius rather than emitting junk', () => {
  const css = themeVars({ primary: 'blue', secondary: '#12', accent: '', radius: 'wobbly' });
  assert.equal(css, '');
  assert.equal(themeVars(), '');
  // Only the six-digit form the colour inputs produce is accepted (isHexColor).
  assert.equal(themeVars({ primary: '#fff' }), '');
  assert.equal(themeVars({ primary: '#ffffff' }), '--c-primary: 255 255 255;');
});

test('themeVars escapes font names so a quote cannot break out of the declaration', () => {
  const css = themeVars({ headingFont: 'Fake"; color: red; --x: "' });
  assert.equal(css, '--font-heading: "Fake\\"; color: red; --x: \\"";');
});

test('previewCopy prefers the answers and falls back to neutral copy', () => {
  const own = previewCopy(
    { siteName: 'Field Guide', orgName: 'Acme', orgShort: 'ACME', logoText: 'AC', heroTitle: 'Hello' },
    { singular: 'guide', plural: 'guides' }
  );
  assert.equal(own.mark, 'AC');
  assert.equal(own.org, 'Acme');
  assert.equal(own.site, 'Field Guide');
  assert.equal(own.title, 'Hello');
  assert.equal(own.plural, 'guides');
  assert.match(own.lead, /guides/);

  const bare = previewCopy();
  assert.equal(bare.mark, 'Your');
  assert.equal(bare.org, 'Your organization');
  assert.equal(bare.singular, 'entry');
  assert.match(bare.lead, /entries/);
});

test('previewCopy derives the mark from orgShort before the site name and caps it at four characters', () => {
  assert.equal(previewCopy({ siteName: 'Catalog', orgShort: 'BCHCX' }).mark, 'BCHC');
  assert.equal(previewCopy({ siteName: 'Catalog' }).mark, 'Cata');
});
