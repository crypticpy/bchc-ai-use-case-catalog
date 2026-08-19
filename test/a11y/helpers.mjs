/**
 * Plumbing for the assistive-technology flow tests (./flows.test.mjs).
 *
 * These tests drive a real browser with the keyboard only — no `element.click()`
 * anywhere — because the things they check (focus order, a visible focus ring,
 * what a live region says, whether a flow dead-ends) only exist in a real
 * layout with real key events. `page.click()` would give a mouse focus state,
 * where `:focus-visible` does not apply and half the assertions become vacuous.
 *
 * Skipped unless RUN_FLOW_TESTS=1 (`npm run test:flows`), like test/build:
 * `npm test` has to stay a sub-second pure-JS gate that needs neither a browser
 * nor a served build.
 *
 * Chrome and puppeteer are not repo dependencies (`npm ci` runs in six other
 * workflows; neither belongs in that install). Resolution order:
 *   PUPPETEER_MODULE_PATH  an explicit path to a puppeteer entry point
 *   `import('puppeteer')`  a normal install, wherever it resolves from
 * and the browser binary comes from PUPPETEER_EXECUTABLE_PATH / CHROME_PATH
 * when set — the same variables quality.yml already exports for pa11y.
 */

import assert from 'node:assert/strict';
import process from 'node:process';

/** The served build under test. Defaults to the port quality.yml serves on. */
export const BASE = (
  process.env.FLOW_BASE_URL ||
  process.env.QUALITY_BASE_URL ||
  'http://127.0.0.1:4173'
).replace(/\/+$/, '');

export const ENABLED = process.env.RUN_FLOW_TESTS === '1';

/** `skip` reason for `describe`, or false when the suite should run. */
export const SKIP = ENABLED ? false : 'set RUN_FLOW_TESTS=1 and serve a build (`npm run test:flows`)';

const url = (path) => `${BASE}${path}`;

/**
 * Fail with an actionable message rather than a module-resolution stack: this
 * only runs when someone asked for the suite, so "not installed" is a setup
 * error, never a reason to quietly pass.
 * @returns {Promise<import('puppeteer').PuppeteerNode>}
 */
async function loadPuppeteer() {
  const explicit = process.env.PUPPETEER_MODULE_PATH;
  const from = explicit ? new URL(`file://${explicit}`).href : 'puppeteer';
  try {
    const module = await import(from);
    return module.default ?? module;
  } catch (error) {
    throw new Error(
      `the flow tests need puppeteer. Install it (\`npm install --no-save puppeteer\`) ` +
        `or point PUPPETEER_MODULE_PATH at one. Tried "${from}".`,
      { cause: error }
    );
  }
}

/** Whether the served build answers, so a missing server fails once and clearly. */
export async function assertServed() {
  let response;
  try {
    response = await fetch(`${BASE}/`);
  } catch (error) {
    throw new Error(`nothing is serving ${BASE}. Build and serve _site first.`, { cause: error });
  }
  assert.ok(response.ok, `${BASE}/ answered ${response.status}`);
}

/** A headless Chrome. The caller closes it. */
export async function launch() {
  const puppeteer = await loadPuppeteer();
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  return puppeteer.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/**
 * A page at `path`, already loaded and settled.
 *
 * Reduced motion is emulated throughout: every scroll the site does is
 * `behavior: 'smooth'` otherwise, and a test that presses a key while the page
 * is still gliding reads the wrong element under the cursor.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {string} path site-relative, e.g. `/catalog/`.
 * @param {{width?: number, height?: number}} [viewport]
 */
export async function openPage(browser, path, { width = 1440, height = 900 } = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(url(path), { waitUntil: 'networkidle2' });
  return page;
}

/**
 * What a screen reader would have to work with at the current focus.
 * @typedef {object} Stop
 * @property {string} tag
 * @property {string} id
 * @property {string} role explicit `role`, or '' — not the implicit one.
 * @property {string} name accessible name, as far as HTML can tell.
 * @property {string} text trimmed text content, for recognising a control.
 * @property {string} href
 * @property {string} pressed `aria-pressed`, or ''.
 * @property {boolean} submits it is the form's submit control.
 * @property {boolean} onBody focus fell back to `<body>`: nothing is focused.
 * @property {boolean} visible has a box and is not `visibility: hidden`.
 * @property {boolean} focusVisible matches `:focus-visible`.
 * @property {boolean} ring `:focus-visible` actually draws something.
 * @property {boolean} concealed sits inside `[hidden]`, `[inert]` or `aria-hidden`.
 * @property {string[]} within ids of the sections/landmarks it belongs to.
 */

/** @returns {Promise<Stop>} a description of `document.activeElement`. */
export function focusStop(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!node || node === document.body || node === document.documentElement) {
      return { onBody: true, tag: 'body', id: '', role: '', name: '', text: '', href: '' };
    }
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    const label =
      node.getAttribute('aria-label') ||
      (node.labels && node.labels[0] ? node.labels[0].textContent : '') ||
      (node.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ') ||
      node.textContent ||
      node.getAttribute('title') ||
      '';
    const clean = (value) => String(value).replace(/\s+/g, ' ').trim();
    // A focus ring is an outline or a box-shadow (Tailwind's `ring-*` is the
    // latter). Either counts; neither means the stop is invisible to a sighted
    // keyboard user even though focus is on it.
    const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
    return {
      onBody: false,
      tag: node.tagName.toLowerCase(),
      id: node.id || '',
      role: node.getAttribute('role') || '',
      name: clean(label).slice(0, 120),
      text: clean(node.textContent).slice(0, 120),
      href: node.getAttribute('href') || '',
      pressed: node.getAttribute('aria-pressed') || '',
      submits: node.matches('button[type="submit"], input[type="submit"]'),
      visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden',
      focusVisible: node.matches(':focus-visible'),
      ring: outlined || style.boxShadow !== 'none',
      concealed: Boolean(node.closest('[hidden], [inert], [aria-hidden="true"]')),
      within: [...document.querySelectorAll('main, dialog, section[id], nav')]
        .filter((wrap) => wrap.contains(node))
        .map((wrap) => wrap.id || wrap.tagName.toLowerCase()),
    };
  });
}

/** Press Tab (or Shift+Tab) once and describe where focus landed. */
export async function tab(page, { back = false } = {}) {
  if (back) await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  if (back) await page.keyboard.up('Shift');
  return focusStop(page);
}

/**
 * Tab forward until `match` accepts a stop.
 * @param {(stop: Stop) => boolean} match
 * @param {{max?: number, what?: string, back?: boolean}} [options] `what` names
 *   the target in the failure message.
 * @returns {Promise<{stop: Stop, trail: Stop[]}>}
 */
export async function tabUntil(page, match, { max = 60, what = 'the target', back = false } = {}) {
  const trail = [];
  for (let i = 0; i < max; i += 1) {
    const stop = await tab(page, { back });
    trail.push(stop);
    if (!stop.onBody && match(stop)) return { stop, trail };
  }
  assert.fail(
    `never reached ${what} in ${max} tab stops. Trail:\n` +
      trail.map((s, n) => `  ${n + 1}. <${s.tag}${s.id ? '#' + s.id : ''}> ${s.name}`).join('\n')
  );
}

/** Human-readable one-liner for an assertion message. */
export const describeStop = (stop) =>
  stop.onBody ? '<body> (nothing focused)' : `<${stop.tag}${stop.id ? '#' + stop.id : ''}> "${stop.name}"`;

/**
 * Every keyboard stop must be operable and announceable: on screen, not inside
 * something hidden from assistive technology, with a name to read out and a
 * focus ring to see. Run over any trail; this is the "no dead ends" assertion.
 * @param {Stop[]} trail
 * @param {string} flow name used in the failure message.
 */
export function assertUsableStops(trail, flow) {
  for (const stop of trail) {
    if (stop.onBody) continue;
    const at = `${flow}: ${describeStop(stop)}`;
    assert.ok(stop.visible, `${at} takes focus but has no box on screen`);
    assert.ok(!stop.concealed, `${at} takes focus inside a hidden/inert/aria-hidden container`);
    assert.notEqual(stop.name, '', `${at} takes focus with no accessible name`);
    assert.ok(stop.ring, `${at} takes keyboard focus without a visible focus ring`);
  }
}

/** Text content of `selector`, or '' when it is not there. */
export function textOf(page, selector) {
  return page.evaluate(
    (sel) => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    selector
  );
}

/**
 * Wait for a live region to say something new.
 * @param {string} selector the region.
 * @param {string} [was] the text it held before the interaction.
 * @returns {Promise<string>} what it says now.
 */
export async function waitForAnnouncement(page, selector, was = '') {
  await page.waitForFunction(
    (sel, before) => {
      const text = document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return text !== '' && text !== before;
    },
    { timeout: 10000 },
    selector,
    was
  );
  return textOf(page, selector);
}

/** The `role`/`aria-live` a container declares, for the "announced twice" check. */
export function liveness(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    return { role: node.getAttribute('role'), live: node.getAttribute('aria-live') };
  }, selector);
}
