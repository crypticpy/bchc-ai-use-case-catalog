/**
 * The showcase example switcher (assets/js/example-switcher.js). The <details>
 * element does the opening, closing and keyboard operation itself — the two
 * behaviours the script adds are the ones a menu needs and the element does not
 * have: Escape closes it and puts focus back on the summary, and a click
 * outside closes it. The markup is the one _includes/demo-banner.html renders.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'example-switcher.js'), 'utf8');

const MARKUP = `
  <div data-component="demo-banner">
    <p>Everything on this site is sample data</p>
    <details class="example-switcher" data-component="example-switcher">
      <summary class="example-switcher-summary">Example: AI use case catalog</summary>
      <ul class="example-switcher-menu">
        <li><a class="example-switcher-link" href="/examples/cohort-portal">Program / cohort portal</a></li>
      </ul>
    </details>
  </div>
  <main><a href="/somewhere/">Elsewhere on the page</a></main>
`;

const booted = [];
test.after(() => booted.forEach((dom) => dom.window.close()));

/** A booted banner with the switcher open. */
function boot() {
  const dom = new JSDOM(`<!doctype html><body>${MARKUP}</body>`, {
    url: 'https://example.org/examples/ai-use-cases/',
    runScripts: 'outside-only',
  });
  booted.push(dom);
  dom.window.eval(SOURCE);
  const document = dom.window.document;
  const switcher = document.querySelector('[data-component="example-switcher"]');
  switcher.open = true;
  return { window: dom.window, document, switcher, summary: switcher.querySelector('summary') };
}

/** @param {object} ctx @param {string} key */
function press(ctx, key) {
  ctx.document.dispatchEvent(new ctx.window.KeyboardEvent('keydown', { key, bubbles: true }));
}

test('Escape closes the menu and returns focus to the summary', () => {
  const ctx = boot();
  ctx.summary.focus();
  ctx.document.querySelector('.example-switcher-link').focus();
  press(ctx, 'Escape');
  assert.equal(ctx.switcher.open, false);
  assert.equal(
    ctx.document.activeElement,
    ctx.summary,
    'focus was left inside a menu that is no longer visible'
  );
});

test('another key leaves the menu alone', () => {
  const ctx = boot();
  press(ctx, 'a');
  assert.equal(ctx.switcher.open, true);
});

test('a click outside closes the menu', () => {
  const ctx = boot();
  ctx.document.querySelector('main a').click();
  assert.equal(ctx.switcher.open, false);
});

test('a click inside keeps it open — following a link is not closing a menu', () => {
  const ctx = boot();
  ctx.document.querySelector('.example-switcher-link').click();
  assert.equal(ctx.switcher.open, true);
});

test('the page it is not on: no switcher, no listeners, no error', () => {
  const dom = new JSDOM('<!doctype html><body><p>An ordinary page.</p></body>', {
    runScripts: 'outside-only',
  });
  booted.push(dom);
  dom.window.eval(SOURCE);
  dom.window.document.body.click();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
});
