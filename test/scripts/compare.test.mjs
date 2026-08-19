/**
 * The compare feature, both halves.
 *
 * The pure half (assets/js/lib/compare-table.js) decides what a comparison SAYS:
 * which entries are in the shortlist, which rows earn a place, and which of them
 * every column already agrees on. It is tested directly.
 *
 * The DOM half (assets/js/compare.js, assets/js/compare-page.js) is tested through
 * jsdom against the same markup the layouts ship — the tray is injected onto cards
 * that know nothing about compare, so the card contract (`data-entry-id`,
 * `data-entry-title`) is exactly what these fixtures assert.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

import {
  COMPARE_MAX,
  buildTable,
  parseSlugs,
  serializeSlugs,
  siteBase,
  toggleSlug,
} from '../../assets/js/lib/compare-table.js';
import { STORE_KEY, readShortlist, writeShortlist } from '../../assets/js/lib/compare-store.js';

/* ------------------------------------------------------------------ fixtures */

/**
 * A miniature /entries.json. The keys and groups here are invented on purpose:
 * nothing in the source names a real field, so this fixture proves the schema —
 * not the code — decides what a comparison contains.
 */
const INDEX = {
  groups: [
    { key: 'about', title: 'About', description: 'The basics' },
    { key: 'build', title: 'How it was built', description: '' },
    { key: 'ghost', title: 'Nobody answered this', description: '' },
  ],
  fields: [
    {
      key: 'area',
      label: 'Area',
      group: 'about',
      type: 'select',
      facet: true,
      short: { 'Disease control': 'Disease' },
    },
    { key: 'stage', label: 'Stage', group: 'about', type: 'select', facet: true },
    { key: 'tools', label: 'Tools', group: 'build', type: 'multiselect', facet: true },
    { key: 'notes', label: 'Notes', group: 'build', type: 'text', facet: false },
    { key: 'repo', label: 'Repository', group: 'build', type: 'url', facet: false },
    { key: 'docs', label: 'Docs', group: 'build', type: 'links', facet: false },
    { key: 'owner', label: 'Owner', group: 'build', type: 'email', facet: false },
    { key: 'open', label: 'Open source', group: 'build', type: 'boolean', facet: false },
    { key: 'unused', label: 'Nobody answered', group: 'ghost', type: 'text', facet: false },
  ],
  entries: [
    {
      slug: 'alpha',
      url: '/catalog/alpha/',
      title: 'Alpha',
      summary: 'The first one',
      published: '2026-01-01',
      values: {
        area: 'Disease control',
        stage: 'Pilot',
        tools: ['Python', 'Azure'],
        notes: 'Runs nightly',
        repo: 'https://example.org/alpha',
        docs: [{ label: 'Write-up', url: 'https://example.org/alpha.pdf' }],
        owner: 'alpha@example.org',
        open: true,
      },
      slugs: { area: ['disease-control'], stage: ['pilot'], tools: ['python', 'azure'] },
    },
    {
      slug: 'beta',
      url: '/catalog/beta/',
      title: 'Beta',
      summary: 'The second one',
      published: '2026-02-01',
      values: { area: 'Disease control', stage: 'Live', tools: ['Python'], open: false },
      slugs: { area: ['disease-control'], stage: ['live'], tools: ['python'] },
    },
  ],
};

/* --------------------------------------------------------------- parseSlugs */

test('parseSlugs trims, lowercases, de-duplicates and caps', () => {
  assert.deepEqual(parseSlugs(' Alpha , beta,alpha,gamma,delta '), ['alpha', 'beta', 'gamma']);
});

test('parseSlugs rejects anything that is not slug-shaped', () => {
  assert.deepEqual(parseSlugs('../etc,a b,<script>,-lead,ok-1'), ['ok-1']);
});

test('parseSlugs accepts an array and survives nothing at all', () => {
  assert.deepEqual(parseSlugs(['a', 'b']), ['a', 'b']);
  assert.deepEqual(parseSlugs(null), []);
  assert.deepEqual(parseSlugs(undefined), []);
  assert.deepEqual(parseSlugs(''), []);
});

test('serializeSlugs round-trips a shortlist without the cap', () => {
  assert.equal(serializeSlugs(['a', 'b', 'c', 'd']), 'a,b,c,d');
});

/* --------------------------------------------------------------- toggleSlug */

test('toggleSlug adds, then removes, the same entry', () => {
  const added = toggleSlug(['a'], 'b');
  assert.deepEqual(added, { slugs: ['a', 'b'], action: 'added' });
  assert.deepEqual(toggleSlug(added.slugs, 'a'), { slugs: ['b'], action: 'removed' });
});

test('toggleSlug refuses a fourth pick rather than dropping an earlier one', () => {
  const { slugs, action } = toggleSlug(['a', 'b', 'c'], 'd', COMPARE_MAX);
  assert.equal(action, 'full');
  assert.deepEqual(slugs, ['a', 'b', 'c'], 'the reader keeps the three they chose');
});

test('toggleSlug ignores a value that is not a slug', () => {
  assert.deepEqual(toggleSlug(['a'], '  '), { slugs: ['a'], action: 'ignored' });
});

/* ----------------------------------------------------------------- siteBase */

test('siteBase finds the site root under a baseurl', () => {
  assert.equal(siteBase('https://example.org/my-site/assets/js/compare.js'), 'https://example.org/my-site/');
  assert.equal(siteBase('/assets/js/compare.js'), '/');
  assert.equal(siteBase('nonsense'), '/');
});

/* ---------------------------------------------------------------- buildTable */

test('buildTable keeps the shortlist order and reports what is gone', () => {
  const model = buildTable(INDEX, ['beta', 'nope', 'alpha']);
  assert.deepEqual(
    model.entries.map((e) => e.slug),
    ['beta', 'alpha']
  );
  assert.deepEqual(model.missing, ['nope']);
});

test('buildTable groups rows the way the schema groups them', () => {
  const model = buildTable(INDEX, ['alpha', 'beta']);
  assert.deepEqual(
    model.groups.map((g) => g.key),
    ['about', 'build'],
    'a group no entry answered disappears with its rows'
  );
  assert.deepEqual(
    model.groups[0].rows.map((r) => r.key),
    ['area', 'stage']
  );
});

test('buildTable drops a row no column answered', () => {
  const keys = buildTable(INDEX, ['alpha', 'beta'])
    .groups.flatMap((g) => g.rows)
    .map((r) => r.key);
  assert.ok(!keys.includes('unused'));
  assert.ok(keys.includes('notes'), 'one column answering is enough to keep the row');
});

test('buildTable flags only the rows every column agrees on', () => {
  const model = buildTable(INDEX, ['alpha', 'beta']);
  const rows = new Map(model.groups.flatMap((g) => g.rows).map((r) => [r.key, r]));
  assert.equal(rows.get('area').same, true);
  assert.equal(rows.get('stage').same, false);
  assert.equal(rows.get('tools').same, false, 'a longer list is a real difference');
  assert.equal(model.sameCount, 1);
  assert.equal(model.rowCount, rows.size);
});

test('buildTable never calls a single column "the same"', () => {
  const model = buildTable(INDEX, ['alpha']);
  assert.equal(model.sameCount, 0);
  assert.ok(model.groups.flatMap((g) => g.rows).every((r) => r.same === false));
});

test('buildTable renders each field type as its own kind of cell', () => {
  const rows = new Map(
    buildTable(INDEX, ['alpha', 'beta'])
      .groups.flatMap((g) => g.rows)
      .map((r) => [r.key, r])
  );
  assert.equal(rows.get('tools').cells[0].kind, 'chips');
  assert.deepEqual(
    rows.get('tools').cells[0].items.map((i) => i.slug),
    ['python', 'azure'],
    'a chip carries the facet slug so it can link back into the catalog'
  );
  assert.equal(rows.get('area').cells[0].items[0].short, 'Disease', "the schema's short label survives");
  assert.equal(rows.get('repo').cells[0].kind, 'link');
  assert.equal(rows.get('docs').cells[0].kind, 'links');
  assert.equal(rows.get('owner').cells[0].items[0].url, 'mailto:alpha@example.org');
  assert.equal(rows.get('open').cells[0].text, 'Yes');
  assert.equal(rows.get('open').cells[1].text, 'No');
  assert.equal(rows.get('notes').cells[1].kind, 'empty', 'an unanswered field is empty, not blank text');
});

test('buildTable survives an index that never loaded', () => {
  const model = buildTable(null, ['alpha']);
  assert.deepEqual(model.groups, []);
  assert.deepEqual(model.missing, ['alpha']);
});

/* --------------------------------------------------------------------- store */

test('the store keeps titles, drops junk and re-applies the cap', () => {
  const win = { localStorage: fakeStorage() };
  writeShortlist(
    [
      { slug: 'a', title: 'A' },
      { slug: 'b', title: 'B' },
    ],
    win
  );
  assert.deepEqual(readShortlist(win), [
    { slug: 'a', title: 'A' },
    { slug: 'b', title: 'B' },
  ]);

  win.localStorage.setItem(STORE_KEY, JSON.stringify([{ slug: 'a' }, { title: 'no slug' }, { slug: 'b' }]));
  assert.deepEqual(
    readShortlist(win).map((i) => i.slug),
    ['a', 'b']
  );

  win.localStorage.setItem(STORE_KEY, 'not json');
  assert.deepEqual(readShortlist(win), []);
});

test('clearing the shortlist removes the key rather than leaving an empty list', () => {
  const win = { localStorage: fakeStorage() };
  writeShortlist([{ slug: 'a', title: 'A' }], win);
  writeShortlist([], win);
  assert.equal(win.localStorage.getItem(STORE_KEY), null);
});

test('a browser that refuses localStorage does not break the tray', () => {
  const hostile = {
    get localStorage() {
      throw new Error('denied');
    },
  };
  assert.deepEqual(readShortlist(hostile), []);
  assert.doesNotThrow(() => writeShortlist([{ slug: 'a', title: 'A' }], hostile));
});

/** @returns {Storage} a Storage-shaped object backed by a Map */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

/* ----------------------------------------------------------------- DOM setup */

const booted = [];
test.after(() => booted.forEach((dom) => dom.window.close()));

let bootCount = 0;

/**
 * A page with the compare scripts running against it.
 * @param {{html: string, url: string, module: string, store?: object[], index?: object|null}} options
 *   `module` is the script under test, relative to assets/js/; `store` seeds the
 *   saved shortlist; `index` is what /entries.json answers (null = a failed fetch).
 * @returns {Promise<{dom: object, doc: Document, win: object}>}
 */
async function boot({ html, url, module, store, index }) {
  const dom = new JSDOM('<!doctype html><body>' + html + '</body>', { url, pretendToBeVisual: true });
  booted.push(dom);
  const win = dom.window;
  if (store) win.localStorage.setItem(STORE_KEY, JSON.stringify(store));

  globalThis.window = win;
  globalThis.document = win.document;
  globalThis.localStorage = win.localStorage;
  globalThis.fetch = () =>
    index
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(index) })
      : Promise.reject(new Error('offline'));

  bootCount += 1;
  await import('../../assets/js/' + module + '?boot=' + bootCount);
  // The compare page paints from a promise; one turn of the microtask queue is
  // all it needs, and waiting on a timer would make the test slower and flakier.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return { dom, doc: win.document, win };
}

const CARDS = `
  <ul data-entry-grid>
    <li data-entry data-entry-id="alpha" data-entry-title="Alpha"><h3>Alpha</h3></li>
    <li data-entry data-entry-id="beta" data-entry-title="Beta"><h3>Beta</h3></li>
    <li data-entry data-entry-id="gamma" data-entry-title="Gamma"><h3>Gamma</h3></li>
    <li data-entry data-entry-id="delta" data-entry-title="Delta"><h3>Delta</h3></li>
  </ul>`;

/* ------------------------------------------------------------------ the tray */

test('the tray injects one toggle per card and stays out of the way until asked', async () => {
  const { doc } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  const toggles = doc.querySelectorAll('[data-compare-toggle]');
  assert.equal(toggles.length, 4);
  assert.equal(toggles[0].getAttribute('aria-pressed'), 'false');
  assert.equal(
    toggles[0].closest('[data-entry]').dataset.entryId,
    'alpha',
    'the toggle lands on its own card'
  );
  assert.ok(toggles[0].textContent.includes('Alpha'), 'the accessible name says which entry');

  const tray = doc.querySelector('.compare-tray');
  assert.ok(tray, 'the tray exists from the start so it can be announced when it fills');
  assert.equal(tray.hidden, true);
  assert.equal(tray.getAttribute('role'), 'region');
  assert.equal(tray.getAttribute('aria-label'), 'Compare shortlist');
});

test('a page with no catalog grid gets no tray at all', async () => {
  const { doc } = await boot({
    html: '<p>Just a page</p>',
    url: 'https://example.org/about/',
    module: 'compare.js',
  });
  assert.equal(doc.querySelector('.compare-tray'), null);
});

test('picking an entry fills the tray, the store and the card', async () => {
  const { doc, win } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  doc.querySelector('[data-compare-toggle="alpha"]').click();

  const tray = doc.querySelector('.compare-tray');
  assert.equal(tray.hidden, false);
  assert.equal(doc.querySelector('[data-compare-toggle="alpha"]').getAttribute('aria-pressed'), 'true');
  assert.equal(doc.querySelectorAll('[data-compare-list] li').length, 1);
  assert.deepEqual(JSON.parse(win.localStorage.getItem(STORE_KEY)), [{ slug: 'alpha', title: 'Alpha' }]);
  assert.ok(doc.querySelector('[data-compare-live]').textContent.includes('Alpha added'));

  const go = doc.querySelector('[data-compare-go]');
  assert.equal(go.hasAttribute('href'), false, 'one entry is not a comparison, so it is not a link');
  assert.equal(go.getAttribute('aria-disabled'), 'true');
});

test('two entries turn the tray into a shareable link', async () => {
  const { doc } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  doc.querySelector('[data-compare-toggle="alpha"]').click();
  doc.querySelector('[data-compare-toggle="beta"]').click();

  const go = doc.querySelector('[data-compare-go]');
  assert.ok(go.getAttribute('href').endsWith('compare/?e=alpha%2Cbeta'));
  assert.equal(go.textContent, 'Compare 2');
  assert.equal(go.hasAttribute('aria-disabled'), false);
});

test('a fourth pick is refused out loud, not swallowed', async () => {
  const { doc } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  ['alpha', 'beta', 'gamma', 'delta'].forEach((slug) =>
    doc.querySelector('[data-compare-toggle="' + slug + '"]').click()
  );

  assert.equal(doc.querySelectorAll('[data-compare-list] li').length, COMPARE_MAX);
  assert.equal(doc.querySelector('[data-compare-toggle="delta"]').getAttribute('aria-pressed'), 'false');
  assert.ok(doc.querySelector('[data-compare-live]').textContent.includes('Remove one first'));
});

test('un-picking and clearing empty the tray again', async () => {
  const { doc, win } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  doc.querySelector('[data-compare-toggle="alpha"]').click();
  doc.querySelector('[data-compare-toggle="alpha"]').click();
  assert.equal(doc.querySelector('.compare-tray').hidden, true);

  doc.querySelector('[data-compare-toggle="beta"]').click();
  doc.querySelector('[data-compare-clear]').click();
  assert.equal(doc.querySelector('.compare-tray').hidden, true);
  assert.equal(win.localStorage.getItem(STORE_KEY), null);
});

test('a shortlist saved on another page comes back quietly', async () => {
  const { doc } = await boot({
    html: CARDS,
    url: 'https://example.org/catalog/',
    module: 'compare.js',
    store: [
      { slug: 'alpha', title: 'Alpha' },
      { slug: 'zeta', title: 'Zeta from another page' },
    ],
  });
  assert.equal(doc.querySelector('.compare-tray').hidden, false);
  assert.equal(
    doc.querySelectorAll('[data-compare-list] li').length,
    2,
    'an entry with no card here still shows'
  );
  assert.equal(doc.querySelector('[data-compare-toggle="alpha"]').getAttribute('aria-pressed'), 'true');
  assert.equal(
    doc.querySelector('[data-compare-live]').textContent,
    '',
    'arriving is not an event a screen reader should be interrupted for'
  );
});

test('removing a chip returns focus to the card it came from', async () => {
  const { doc } = await boot({ html: CARDS, url: 'https://example.org/catalog/', module: 'compare.js' });
  doc.querySelector('[data-compare-toggle="alpha"]').click();
  doc.querySelector('[data-compare-list] button').click();
  assert.equal(doc.activeElement, doc.querySelector('[data-compare-toggle="alpha"]'));
});

/* ------------------------------------------------------------ the /compare/ page */

const PAGE = `
  <button type="button" data-compare-print hidden>Print</button>
  <p role="status" data-compare-status></p>
  <div data-compare-app data-entries-url="/entries.json" data-catalog-url="/catalog/"></div>
  <div data-compare-empty>Pick two to compare</div>`;

test('the compare page builds a table from the URL', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
  });

  const table = doc.querySelector('.compare-table');
  assert.ok(table);
  assert.equal(doc.querySelector('[data-compare-empty]').hidden, true);
  assert.deepEqual(
    [...table.querySelectorAll('thead .compare-head-title')].map((a) => a.textContent),
    ['Alpha', 'Beta']
  );
  assert.deepEqual(
    [...table.querySelectorAll('[data-compare-group]')].map((b) => b.dataset.compareGroup),
    ['about', 'build']
  );
  assert.equal(
    doc.querySelector('[data-compare-print]').hidden,
    false,
    'the print control appears once there is something to print'
  );

  const wrap = doc.querySelector('.compare-table-wrap');
  assert.equal(wrap.getAttribute('role'), 'region');
  assert.equal(wrap.tabIndex, 0, 'a box that scrolls sideways must be reachable by keyboard');
  assert.ok(wrap.getAttribute('aria-label'));
});

test('every cell names the group, row and column header it sits under', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
  });

  const table = doc.querySelector('.compare-table');
  // Three levels of `th` (group, row, column) is a complex table: `scope` alone
  // leaves a screen reader guessing, and WCAG H43 asks for explicit ids.
  const ids = [...table.querySelectorAll('th')].map((th) => th.id);
  assert.ok(ids.every(Boolean), 'every th needs an id once any cell uses headers, the empty corner included');
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');

  const cells = [...table.querySelectorAll('td')];
  assert.ok(cells.length);
  cells.forEach((td) => {
    const referenced = td.getAttribute('headers').split(' ');
    assert.equal(referenced.length, 3);
    referenced.forEach((id) => assert.ok(doc.getElementById(id), `headers points at a real th: ${id}`));
  });

  // The column header a cell claims is the column it is actually in.
  const firstRow = table.querySelector('.compare-row');
  assert.deepEqual(
    [...firstRow.querySelectorAll('td')].map((td) => td.getAttribute('headers').split(' ')[2]),
    [...table.querySelectorAll('thead .compare-head')].map((th) => th.id)
  );
});

test('the table leads with differences and keeps the agreements one click away', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
  });

  const same = doc.querySelectorAll('[data-compare-same]');
  assert.equal(same.length, 1);
  assert.equal(same[0].hidden, true);

  const toggle = doc.querySelector('.compare-toolbar button');
  assert.ok(toggle.textContent.startsWith('Show the 1'));
  toggle.click();
  assert.equal(doc.querySelector('[data-compare-same]').hidden, false);
  assert.equal(doc.querySelector('.compare-toolbar button').getAttribute('aria-pressed'), 'true');
});

test('a facet cell links back into the filtered catalog', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
  });
  const chips = [...doc.querySelectorAll('.compare-chips a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(chips.slice(0, 4), [
    '/catalog/?area=disease-control',
    '/catalog/?area=disease-control',
    '/catalog/?stage=pilot',
    '/catalog/?stage=live',
  ]);
  assert.ok(chips.includes('/catalog/?tools=azure'), 'every value in a multiselect gets its own link');
});

test('removing a column rewrites the URL and the saved shortlist', async () => {
  const { doc, win } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
  });
  doc.querySelector('.compare-head-remove').click();
  assert.equal(win.location.search, '?e=beta');
  assert.deepEqual(JSON.parse(win.localStorage.getItem(STORE_KEY)), [{ slug: 'beta', title: 'Beta' }]);
  assert.equal(doc.querySelector('.compare-table'), null, 'one column is not a comparison');
  assert.equal(doc.querySelector('[data-compare-empty]').hidden, false);
  assert.equal(
    doc.querySelector('[data-compare-print]').hidden,
    true,
    'nothing left to print, so the button goes away again'
  );
});

test('the URL wins over the saved shortlist, so a shared link shows the same table', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: INDEX,
    store: [{ slug: 'gamma', title: 'Gamma' }],
  });
  assert.deepEqual(
    [...doc.querySelectorAll('.compare-head-title')].map((a) => a.textContent),
    ['Alpha', 'Beta']
  );
});

test('the saved shortlist is used when the URL asks for nothing', async () => {
  const { doc, win } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/',
    module: 'compare-page.js',
    index: INDEX,
    store: [
      { slug: 'beta', title: 'stale name' },
      { slug: 'alpha', title: 'Alpha' },
    ],
  });
  assert.deepEqual(
    [...doc.querySelectorAll('.compare-head-title')].map((a) => a.textContent),
    ['Beta', 'Alpha'],
    "the build's own title replaces whatever the tray saved"
  );
  assert.equal(win.location.search, '?e=beta%2Calpha');
});

test('an entry that is no longer published is named, not silently dropped', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta,ghost',
    module: 'compare-page.js',
    index: INDEX,
  });
  assert.ok(doc.querySelector('.compare-note').textContent.includes('no longer published'));
});

test('a comparison that cannot load says so instead of showing an empty page', async () => {
  const { doc } = await boot({
    html: PAGE,
    url: 'https://example.org/compare/?e=alpha,beta',
    module: 'compare-page.js',
    index: null,
  });
  assert.ok(doc.querySelector('[data-compare-status]').textContent.includes('could not be loaded'));
  assert.equal(doc.querySelector('.compare-table'), null);
});
