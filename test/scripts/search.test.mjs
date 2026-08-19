/**
 * Catalog search behaviour, driven through a real DOM.
 *
 * The fixture pairs a trimmed /catalog/ results header with a card grid (see
 * test/fixtures/search-page.html) and a search index in the exact shape
 * _plugins/search_index.rb emits, so these tests exercise the shipped markup,
 * the shipped lunr build and the shipped index contract together.
 *
 * jsdom cannot perform navigation, so "clicking a row goes somewhere" is
 * asserted as: the row carries the deep link, and the click attempts a
 * navigation (jsdom reports that as a jsdomError).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'search-page.html'), 'utf8');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'search-index.json'), 'utf8'));
const LUNR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'lunr.min.js'), 'utf8');
const SEARCH = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'search.js'), 'utf8');

/**
 * A booted catalog page with search wired up.
 * @param {{index?: object, fetch?: Function, noLunr?: boolean}} [options]
 *   index overrides the payload /search.json resolves with; fetch replaces the
 *   whole stub (to fail, hang, or count calls); noLunr boots without the
 *   library, the way a blocked CDN-free build would if the bundle 404'd.
 * @returns {Promise<object>}
 */
async function boot(options = {}) {
  const navigations = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/navigation/i.test(error.message)) navigations.push(error.message);
  });
  const dom = new JSDOM('<!doctype html><body>' + HTML + '</body>', {
    url: 'https://example.org/catalog/',
    runScripts: 'outside-only',
    virtualConsole,
  });
  const { window } = dom;
  const requests = [];
  window.fetch =
    options.fetch ||
    ((url, init) => {
      requests.push({ url, init });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(options.index || INDEX) });
    });

  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
  });

  if (!options.noLunr) window.eval(LUNR);
  window.eval(SEARCH);

  const document = window.document;
  const input = document.querySelector('[data-filter="search"]');
  return {
    window,
    document,
    input,
    requests,
    navigations,
    listbox: document.querySelector('[data-search-results]'),
    live: document.querySelector('[data-search-live]'),
    status: document.querySelector('[data-search-status]'),
    floor: document.querySelector('[data-search-floor]'),
    more: document.querySelector('[data-search-more]'),
    rows: () => Array.from(document.querySelectorAll('[data-search-results] [role="option"]')),
    slots: () =>
      Array.from(document.querySelectorAll('[data-entry-id]'))
        .filter((card) => !card.querySelector('[data-match-slot]').hidden)
        .map((card) => [card.dataset.entryId, card.querySelector('[data-match-slot]').textContent]),
    /**
     * Type a query and wait for the debounce plus the index promise chain.
     * @param {string} value
     */
    type: async (value) => {
      input.focus();
      input.value = value;
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      await settle(window);
    },
    key: (key) => input.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true })),
  };
}

/**
 * Let the 120ms debounce fire and every chained promise resolve.
 * @param {object} window
 */
function settle(window) {
  return new Promise((resolve) => window.setTimeout(() => setTimeout(resolve, 0), 200));
}

test('an empty box publishes no match set and keeps the listbox closed', async () => {
  const page = await boot();
  await page.type('');

  assert.equal(page.window.__searchMatches, null);
  assert.equal(page.listbox.hidden, true);
  assert.equal(page.input.getAttribute('aria-expanded'), 'false');
});

test('a query fetches the index once and reuses it', async () => {
  const page = await boot();
  await page.type('notice');
  await page.type('permit');

  assert.equal(page.requests.filter((r) => r.url === '/search.json').length, 1);
});

test('the index is fetched at low priority with a timeout', async () => {
  const page = await boot();
  await page.type('notice');
  const init = page.requests[0].init;

  assert.equal(init.priority, 'low');
  assert.ok(init.signal, 'expected an abort signal');
});

test('a title match narrows the grid to the entries that clear the floor', async () => {
  const page = await boot();
  await page.type('notice');

  // Every entry mentions "notice" somewhere, but only one is about notices.
  assert.deepEqual([...page.window.__searchMatches], ['notice-translation']);
  assert.equal(page.window.__searchOrder[0], 'notice-translation');
});

test('the weaker matches are offered behind a button that names the query', async () => {
  const page = await boot();
  await page.type('notice');

  assert.equal(page.floor.hidden, false);
  assert.equal(page.more.textContent, 'Show 3 more that mention “notice”');

  page.more.dispatchEvent(new page.window.Event('click', { bubbles: true }));
  await settle(page.window);

  assert.equal(page.window.__searchMatches.size, 4);
  assert.equal(page.floor.hidden, true);
});

test('lifting the floor does not re-query or reopen the listbox', async () => {
  const page = await boot();
  await page.type('notice');
  const before = page.requests.length;
  page.listbox.hidden = true;

  page.more.dispatchEvent(new page.window.Event('click', { bubbles: true }));
  await settle(page.window);

  assert.equal(page.requests.length, before);
  assert.equal(page.listbox.hidden, true);
  assert.equal(page.window.location.search, '');
});

test('editing the query puts the floor back', async () => {
  const page = await boot();
  await page.type('notice');
  page.more.dispatchEvent(new page.window.Event('click', { bubbles: true }));
  await settle(page.window);
  await page.type('notices');

  assert.equal(page.floor.hidden, false);
});

test('a body hit names its section and deep-links to the anchor', async () => {
  const page = await boot();
  await page.type('reviewer');
  const row = page.rows().find((li) => li.dataset.url.includes('notice-translation'));

  assert.ok(row, 'expected a row for the entry whose body matched');
  assert.match(row.textContent, /How to reuse|What it does/);
  assert.match(row.dataset.url, /^\/catalog\/notice-translation\/#(how-to-reuse|what-it-does)$/);
});

test('the snippet marks the matched term without using innerHTML', async () => {
  const page = await boot();
  await page.type('bilingual');
  const mark = page.listbox.querySelector('mark');

  assert.ok(mark, 'expected the matched term to be marked');
  assert.equal(mark.textContent.toLowerCase(), 'bilingual');
  assert.equal(mark.children.length, 0);
});

test('cards get the section and snippet that put them in the grid', async () => {
  const page = await boot();
  await page.type('bilingual');

  assert.deepEqual(
    page.slots().map(([id]) => id),
    ['notice-translation']
  );
  assert.match(page.slots()[0][1], /What it does/);
});

test('card annotations are cleared when the query is cleared', async () => {
  const page = await boot();
  await page.type('bilingual');
  await page.type('');

  assert.deepEqual(page.slots(), []);
});

test('arrow keys move aria-activedescendant through the options', async () => {
  const page = await boot();
  await page.type('notice');
  assert.ok(page.rows().length > 1);
  assert.equal(page.input.hasAttribute('aria-activedescendant'), false);

  page.key('ArrowDown');
  assert.equal(page.input.getAttribute('aria-activedescendant'), page.rows()[0].id);
  assert.equal(page.rows()[0].getAttribute('aria-selected'), 'true');

  page.key('ArrowUp');
  assert.equal(page.input.getAttribute('aria-activedescendant'), page.rows().at(-1).id);
});

test('the listbox announces how many suggestions are open, and clears on close', async () => {
  const page = await boot();
  await page.type('notice');

  assert.match(page.live.textContent, /^\d+ suggestions\. Use the up and down arrow keys/);

  page.key('Escape');
  assert.equal(page.live.textContent, '');
  assert.equal(page.listbox.hidden, true);
});

test('a suggestion navigates on click, not only on mousedown', async () => {
  const page = await boot();
  await page.type('notice');
  const row = page.rows()[0];

  row.dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true }));
  assert.deepEqual(page.navigations, [], 'mousedown must not navigate — it only holds focus');

  row.dispatchEvent(new page.window.MouseEvent('click', { bubbles: true }));
  assert.equal(page.navigations.length, 1);
});

test('Enter follows the highlighted option', async () => {
  const page = await boot();
  await page.type('notice');
  page.key('ArrowDown');
  page.key('Enter');

  assert.equal(page.navigations.length, 1);
});

test('a failed load is retried rather than memoized', async () => {
  let calls = 0;
  const page = await boot({
    fetch: () => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ ok: false, status: 503 });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) });
    },
  });
  await page.type('notice');

  assert.equal(calls, 2, 'expected the failed attempt to be retried, not cached');
  assert.deepEqual([...page.window.__searchMatches], ['notice-translation']);
  assert.equal(page.status.textContent, '', 'the warning should clear once the index arrives');
});

test('an index that never loads reports itself instead of failing silently', async () => {
  const page = await boot({ fetch: () => Promise.resolve({ ok: false, status: 503 }) });
  await page.type('notice');

  assert.equal(page.status.classList.contains('hidden'), false);
  assert.match(page.status.textContent, /unavailable/i);
  assert.equal(page.window.__searchMatches, null);
  assert.equal(page.listbox.hidden, true);
});

test('a stale answer cannot overwrite a newer query', async () => {
  const page = await boot();
  await page.type('notice');
  assert.deepEqual([...page.window.__searchMatches], ['notice-translation']);

  // Type again without settling, then let both runs finish: the second query
  // is the one that must win, whichever promise resolves last.
  page.input.value = 'permit';
  page.input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  page.input.value = 'grant';
  page.input.dispatchEvent(new page.window.Event('input', { bubbles: true }));
  await settle(page.window);

  assert.deepEqual([...page.window.__searchMatches], ['grant-finder']);
});

test('non-entry docs appear as suggestions but never filter the grid', async () => {
  const page = await boot();
  await page.type('kickoff');

  assert.ok(page.rows().some((li) => li.dataset.url.includes('/cohorts/')));
  assert.deepEqual([...page.window.__searchMatches], []);
});

test('a query with no hits closes the listbox and empties the grid', async () => {
  const page = await boot();
  await page.type('zzzzqqqq');

  assert.equal(page.listbox.hidden, true);
  assert.deepEqual([...page.window.__searchMatches], []);
});

test('without lunr the box reports itself unavailable instead of throwing', async () => {
  const page = await boot({ noLunr: true });

  assert.equal(page.status.classList.contains('hidden'), false);
  assert.match(page.status.textContent, /unavailable/i);
});
