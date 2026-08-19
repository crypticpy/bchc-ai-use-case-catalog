/**
 * `@apply` emits declarations in *stylesheet* order, not in the order the class names are
 * written. `.prose-body { @apply prose prose-slate … }` therefore handed every
 * `--tw-prose-*` variable to slate: the config looked right, the build was clean, and every
 * authored page on the site rendered in Tailwind's stock grey with links at 1.70:1 against
 * the body text and no underline. The same shadowing gave `prose`'s own 65ch measure
 * priority over the themed one.
 *
 * The bug is invisible in review, so it gets a test. This builds the real stylesheet with
 * the same command `npm run build:css` runs, then asserts the themed values actually win.
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

/**
 * The values tailwind.config.js asks for, so this test never needs updating alongside it.
 * Read as text rather than imported: the config's `tailwindcss/defaultTheme` specifier is
 * resolved by Tailwind's own loader, not by Node's ESM resolver. Same trick as
 * schema-parity.test.mjs.
 */
const themed = Object.fromEntries(
  [
    ...readFileSync(join(repo, 'tailwind.config.js'), 'utf8').matchAll(
      /'(--tw-prose-[a-z-]+)':\s*'([^']+)'/g
    ),
  ].map((m) => [m[1], m[2]])
);

/** Build assets/css/tailwind.css exactly as `npm run build:css` does, unminified. */
function buildStylesheet() {
  const out = join(mkdtempSync(join(tmpdir(), 'prose-test-')), 'site.css');
  execFileSync(join(repo, 'node_modules/.bin/tailwindcss'), ['-i', 'assets/css/tailwind.css', '-o', out], {
    cwd: repo,
    stdio: 'pipe',
  });
  return readFileSync(out, 'utf8');
}

const root = postcss.parse(buildStylesheet());

/** Every `.prose-body { … }` block, in source order — the descendant rules are not it. */
const proseBodyRules = [];
root.walkRules((rule) => {
  if (rule.selector === '.prose-body') proseBodyRules.push(rule);
});

/** The declaration that actually wins: same specificity throughout, so it is the last one. */
function winner(prop) {
  let value;
  for (const rule of proseBodyRules) {
    rule.walkDecls(prop, (decl) => {
      value = decl.value;
    });
  }
  return value;
}

test('.prose-body carries the brand prose variables, not a colour scheme’s', () => {
  assert.ok(proseBodyRules.length > 0, '.prose-body did not survive the build');
  assert.ok(Object.keys(themed).length >= 10, 'the typography() block no longer parses as text');
  assert.equal(winner('--tw-prose-links'), 'rgb(var(--c-primary))');
  for (const [prop, expected] of Object.entries(themed)) {
    assert.equal(winner(prop), expected, `${prop} is overwritten later in the stylesheet`);
  }
});

test('.prose-body measures by the --measure token, not by `ch`', () => {
  assert.equal(winner('max-width'), 'var(--measure)');
});

test('no themed prose variable is ever set to a literal colour', () => {
  // The general form of the bug: any `prose-<scheme>` modifier added later re-declares
  // these as hex. The variables the config deliberately leaves to the plugin's own theme
  // (`--tw-prose-lead`, `-captions`, `-kbd`, and every `-invert-*`) are not our contract.
  for (const rule of proseBodyRules) {
    rule.walkDecls((decl) => {
      if (!(decl.prop in themed)) return;
      assert.doesNotMatch(decl.value, /#[0-9a-f]{3,8}\b/i, `${decl.prop} is a literal colour`);
    });
  }
});
