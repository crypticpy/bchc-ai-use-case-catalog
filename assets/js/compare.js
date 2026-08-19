// The compare tray: pick two or three entries on the catalog, then read them side
// by side on /compare/.
//
// ES module, loaded by _layouts/catalog.html with <script type="module">. Everything
// it adds is INJECTED — _includes/entry-card.html knows nothing about compare, so a
// reader without JavaScript sees the catalog exactly as it has always been and never
// meets a control that does nothing.
//
// DATA-ATTRIBUTE CONTRACT (read only; all of it already exists)
//   Cards  [data-entry-grid] [data-entry][data-entry-id][data-entry-title]
//   Bar    .filter-bar — the mobile filter affordance the tray must sit above
//
// INJECTED
//   .compare-slot > button[data-compare-toggle="<slug>"][aria-pressed]  per card
//   .compare-tray[role=region][aria-label]                              once, in <body>
//     > [data-compare-list] chips, [data-compare-go] link, [data-compare-clear]
//     > [data-compare-live] sr-only role=status — the count, announced politely
//
// State lives in ./lib/compare-store.js (localStorage) and is mirrored into the
// /compare/ link as `?e=slug,slug`, so a shortlist pastes into an email and the
// person who opens it sees the same table.

import { COMPARE_MAX, serializeSlugs, siteBase, toggleSlug } from './lib/compare-table.js';
import { STORE_KEY, readShortlist, writeShortlist } from './lib/compare-store.js';

const BASE = siteBase(import.meta.url);

(function () {
  const grid = document.querySelector('[data-entry-grid]');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('[data-entry]'));
  if (!cards.length) return;

  /** @type {Array<{slug: string, title: string}>} */
  let items = readShortlist();

  /* ---------------------------------------------------------------- tray DOM */

  const tray = document.createElement('div');
  tray.className = 'compare-tray';
  tray.setAttribute('role', 'region');
  tray.setAttribute('aria-label', 'Compare shortlist');
  tray.hidden = true;
  // The mobile filter bar is fixed to the bottom edge on the catalog; the tray
  // stacks above it rather than over it.
  if (document.querySelector('.filter-bar')) tray.classList.add('compare-tray--above-bar');

  const inner = document.createElement('div');
  inner.className = 'compare-tray-inner';
  tray.appendChild(inner);

  const heading = document.createElement('p');
  heading.className = 'compare-tray-title';
  inner.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'compare-tray-list';
  list.setAttribute('role', 'list');
  list.dataset.compareList = '';
  inner.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'compare-tray-actions';
  inner.appendChild(actions);

  const go = document.createElement('a');
  go.className = 'btn-primary btn-sm';
  go.dataset.compareGo = '';
  // render() rewrites both; a name and an href from the start keep the (hidden)
  // tray's link from ever being an empty or uncrawlable anchor in the static DOM.
  go.textContent = 'Compare';
  go.href = BASE + 'compare/';
  actions.appendChild(go);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn-secondary btn-sm';
  clear.dataset.compareClear = '';
  clear.textContent = 'Clear';
  actions.appendChild(clear);

  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.dataset.compareLive = '';
  tray.appendChild(live);

  document.body.appendChild(tray);

  /* ------------------------------------------------------------- card toggles */

  /** @type {Map<string, HTMLButtonElement>} */
  const toggles = new Map();

  cards.forEach((card) => {
    const slug = card.dataset.entryId;
    const title = card.dataset.entryTitle || slug;
    if (!slug || toggles.has(slug)) return;

    const slot = document.createElement('div');
    slot.className = 'compare-slot';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'compare-toggle';
    button.dataset.compareToggle = slug;
    button.setAttribute('aria-pressed', 'false');
    // The card title's ::after covers the whole card as the click target; the
    // toggle has to sit above it or it can never be clicked.
    const box = document.createElement('span');
    box.className = 'compare-toggle-box';
    box.setAttribute('aria-hidden', 'true');
    button.appendChild(box);
    const label = document.createElement('span');
    label.textContent = 'Compare';
    button.appendChild(label);
    const named = document.createElement('span');
    named.className = 'sr-only';
    named.textContent = ' ' + title;
    button.appendChild(named);

    button.addEventListener('click', () => choose(slug, title));
    slot.appendChild(button);
    card.appendChild(slot);
    toggles.set(slug, button);
  });

  /* -------------------------------------------------------------------- state */

  /**
   * Toggle one entry and say what happened. A refused fourth pick is announced
   * rather than swallowed, and the reader keeps the three they chose.
   * @param {string} slug
   * @param {string} title
   * @returns {void}
   */
  function choose(slug, title) {
    const before = items.map((i) => i.slug);
    const { slugs, action } = toggleSlug(before, slug, COMPARE_MAX);
    if (action === 'full') {
      render('Compare holds ' + COMPARE_MAX + ' at a time. Remove one first.');
      return;
    }
    if (action === 'ignored') return;
    const known = new Map(items.map((i) => [i.slug, i.title]));
    known.set(slug, title);
    items = slugs.map((s) => ({ slug: s, title: known.get(s) || s }));
    writeShortlist(items);
    render(action === 'added' ? title + ' added to compare.' : title + ' removed from compare.');
  }

  /**
   * Remove one entry from the tray and put focus somewhere that still exists —
   * the entry's own card toggle when it is on this page, the tray's Clear button
   * otherwise.
   * @param {string} slug
   * @returns {void}
   */
  function drop(slug) {
    const gone = items.find((i) => i.slug === slug);
    items = items.filter((i) => i.slug !== slug);
    writeShortlist(items);
    render((gone ? gone.title : 'Entry') + ' removed from compare.');
    const back = toggles.get(slug);
    if (back) back.focus();
    else if (items.length) clear.focus();
  }

  clear.addEventListener('click', () => {
    items = [];
    writeShortlist(items);
    render('Compare cleared.');
  });

  // Another tab changed the shortlist: follow it rather than fight it.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== STORE_KEY) return;
    items = readShortlist();
    render('');
  });

  /* ------------------------------------------------------------------- render */

  /**
   * Paint the tray and the pressed state of every card toggle.
   *
   * The live region only ever carries a message the reader's own action caused —
   * a boot render with a saved shortlist must not interrupt whatever a screen
   * reader is already reading.
   * @param {string} announcement text for the polite live region ('' says nothing).
   * @returns {void}
   */
  function render(announcement) {
    const slugs = items.map((i) => i.slug);
    toggles.forEach((button, slug) => {
      const on = slugs.includes(slug);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.classList.toggle('is-on', on);
    });

    tray.hidden = items.length === 0;
    document.body.classList.toggle('has-compare-tray', items.length > 0);
    if (!items.length) {
      list.replaceChildren();
      if (announcement) live.textContent = announcement;
      return;
    }

    heading.textContent = items.length + ' of ' + COMPARE_MAX + ' selected';

    list.replaceChildren();
    items.forEach((item) => {
      const li = document.createElement('li');
      const chip = document.createElement('span');
      chip.className = 'compare-tray-chip';
      const name = document.createElement('span');
      name.className = 'compare-tray-name';
      name.textContent = item.title;
      chip.appendChild(name);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'compare-tray-remove';
      const glyph = document.createElement('span');
      glyph.setAttribute('aria-hidden', 'true');
      glyph.textContent = '×';
      remove.appendChild(glyph);
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = 'Remove ' + item.title + ' from compare';
      remove.appendChild(sr);
      remove.addEventListener('click', () => drop(item.slug));
      chip.appendChild(remove);
      li.appendChild(chip);
      list.appendChild(li);
    });

    const ready = items.length > 1;
    go.href = BASE + 'compare/?e=' + encodeURIComponent(serializeSlugs(slugs));
    go.textContent = ready ? 'Compare ' + items.length : 'Pick one more';
    go.classList.toggle('is-muted', !ready);
    // A link to a one-column comparison is a dead end, so it stops being a link.
    if (ready) go.removeAttribute('aria-disabled');
    else {
      go.setAttribute('aria-disabled', 'true');
      go.removeAttribute('href');
    }

    if (announcement)
      live.textContent = announcement + ' ' + items.length + ' of ' + COMPARE_MAX + ' selected.';
  }

  render('');
})();
