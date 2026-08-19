/**
 * Two things this build can lose silently.
 *
 * 1. **Badge tones.** They used to be a class composed at render time
 *    (`badge-{{ tone }}`), invisible to Tailwind's scanner, kept alive only by a
 *    `safelist` regex in tailwind.config.js. The safelist is gone and the tones are
 *    `.badge[data-tone="…"]`, which survives purge only because `badge` is a literal
 *    class in the markup. That is a subtle contract: if someone renames the base class
 *    or moves the tone table out of a rule that mentions it, every badge on the site
 *    silently loses its pill and nothing else fails. Hence: build the real stylesheet
 *    and look for all six tones.
 *
 * 2. **Theme tokens.** Radius, motion and easing are `_data/theme.yml → _includes/theme.html`
 *    custom properties. A Tailwind name that resolves to a literal instead of a `var()`
 *    is a token that quietly stopped following the theme.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

const repo = fileURLToPath(new URL('../..', import.meta.url));

/** The tones _includes/badge.html accepts — read from the include so the two cannot drift. */
const TONES = readFileSync(join(repo, '_includes/badge.html'), 'utf8')
  .match(/assign bd_tones = '([a-z,-]+)'/)[1]
  .split(',');

/** Build assets/css/tailwind.css exactly as `npm run build:css` does, unminified. */
function buildStylesheet() {
  const out = join(mkdtempSync(join(tmpdir(), 'tokens-test-')), 'site.css');
  execFileSync(join(repo, 'node_modules/.bin/tailwindcss'), ['-i', 'assets/css/tailwind.css', '-o', out], {
    cwd: repo,
    stdio: 'pipe',
  });
  return readFileSync(out, 'utf8');
}

const css = buildStylesheet();
const root = postcss.parse(css);

/** Every selector in the built stylesheet, split on commas and trimmed. */
const selectors = new Set();
root.walkRules((rule) => rule.selectors.forEach((s) => selectors.add(s.trim())));

test('tailwind.config.js carries no safelist', () => {
  const config = readFileSync(join(repo, 'tailwind.config.js'), 'utf8');
  assert.doesNotMatch(
    config.replace(/\/\/[^\n]*/g, ''),
    /safelist\s*:/,
    'a safelist is back — the tone table should survive purge on its own'
  );
});

test('every badge tone survives the build without a safelist', () => {
  assert.ok(TONES.length === 7, `expected seven tones, badge.html lists ${TONES.length}`);
  assert.ok(selectors.has('.badge'), 'the .badge base class was purged');
  for (const tone of TONES) {
    assert.ok(
      selectors.has(`.badge[data-tone="${tone}"]`),
      `.badge[data-tone="${tone}"] was purged — badges of that tone render unstyled`
    );
  }
});

test('an unknown tone still gets a pill', () => {
  // The base rule sets the ground/text/ring from --tone-* with defaults, so a badge whose
  // data-tone matches nothing in the table is a legible neutral pill rather than bare text.
  const base = [];
  root.walkRules((rule) => {
    if (rule.selectors.includes('.badge')) base.push(rule);
  });
  const decls = base.flatMap((rule) => rule.nodes.filter((n) => n.type === 'decl'));
  const fallbacks = decls.filter((d) => /var\(--tone-[a-z-]+,\s*/.test(d.value));
  assert.ok(fallbacks.length >= 3, 'the .badge base rule no longer defaults --tone-bg/--tone-fg/--tone-ring');
});

test('radius, motion and easing reach the components as theme custom properties', () => {
  // The semantic aliases are consumed with `@apply`, so the utility class itself is
  // purged and only its declarations survive, inlined into the component. Assert on
  // those: a literal here means the token stopped following _data/theme.yml.
  const expectations = [
    ['.focus-target', 'border-radius', /var\(--radius-xs\)/], // rounded-hairline
    ['.card', 'border-radius', /var\(--radius-xl\)/], // rounded-card
    ['.btn', 'transition-duration', /var\(--motion-fast\)/], // duration-fast
    ['.card-hover', 'transition-duration', /var\(--motion-base\)/], // duration-base
    ['.btn', 'transition-timing-function', /var\(--ease-brand\)/], // ease-brand
    ['.filter-pill', 'transition-duration', /var\(--motion-fast\)/], // legacy duration-120
  ];
  for (const [selector, prop, value] of expectations) {
    const found = [];
    root.walkRules((rule) => {
      if (!rule.selectors.some((s) => s.trim() === selector)) return;
      rule.walkDecls(prop, (decl) => found.push(decl.value));
    });
    assert.ok(found.length > 0, `${selector} declares no ${prop} — did it get purged or renamed?`);
    assert.match(found.at(-1), value, `${selector}'s ${prop} no longer reads its theme token`);
  }
});

test('_includes/theme.html emits every token the config asks for', () => {
  const template = readFileSync(join(repo, '_includes/theme.html'), 'utf8');
  const config = readFileSync(join(repo, 'tailwind.config.js'), 'utf8');
  const wanted = new Set(
    [...config.matchAll(/var\((--(?:radius|motion|ease|measure)[a-z0-9-]*)\)/g)].map((m) => m[1])
  );
  assert.ok(wanted.size >= 10, 'the config stopped referencing theme tokens by var()');
  for (const token of wanted) {
    assert.match(template, new RegExp(`${token}:`), `_includes/theme.html never emits ${token}`);
  }
});

test('the card title is one fluid ramp, not a step at 340px', () => {
  // tailwind-css P5.3: the title used to jump 16px -> 18px the moment a card crossed
  // 340px, which is visible when the filter rail closes. A clamp on cqi replaces both
  // steps, so nothing inside a @container block may set .entry-title's font-size again.
  const fluid = [];
  const stepped = [];
  root.walkRules((rule) => {
    if (!rule.selectors.some((s) => s.trim() === '.entry-title')) return;
    rule.walkDecls('font-size', (decl) => {
      const inContainer = rule.parent && rule.parent.type === 'atrule' && rule.parent.name === 'container';
      (inContainer ? stepped : fluid).push(decl.value);
    });
  });
  assert.ok(
    fluid.some((v) => /clamp\(/.test(v) && /cqi/.test(v)),
    '.entry-title no longer sizes itself from the card with a clamp on cqi'
  );
  assert.deepEqual(stepped, [], 'a @container step is setting .entry-title font-size again');
});

test('the mobile sheet\u2019s Clear button has a disabled resting state', () => {
  // filters.js disables that one button rather than hiding it (the footer is a fixed
  // two-button row), so it needs a look that reads as unavailable. Without this rule
  // a disabled Clear is indistinguishable from a live one.
  assert.ok(
    selectors.has('.filter-sheet-foot .btn-secondary:disabled'),
    'the disabled style for the sheet footer\u2019s Clear button was purged or renamed'
  );
  const markup = readFileSync(join(repo, '_includes/filter-sheet.html'), 'utf8');
  assert.match(
    markup,
    /data-filter-clear data-filter-clear-persist/,
    'the sheet\u2019s Clear button lost data-filter-clear-persist, so filters.js will hide it again'
  );
});
