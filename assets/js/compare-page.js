// The /compare/ table: two or three entries side by side, field by field.
//
// ES module, loaded by _layouts/compare.html. It reads /entries.json (built from
// _data/schema.yml by the root `entries.json` page) and renders rows in the schema's
// own group and weight order. No field key, group key or option value is named here —
// the model comes from ./lib/compare-table.js and the schema decides the rest.
//
// The shortlist comes from `?e=slug,slug` first (so a pasted link shows the same
// table to everyone on the call) and falls back to the tray's saved shortlist. Both
// stay in step: removing a column rewrites the URL and the store.
//
// MARKUP CONTRACT (_layouts/compare.html)
//   [data-compare-app][data-entries-url]   the mount point
//   [data-compare-empty]                   the "pick two" state, server-rendered
//   [data-compare-status] role=status      load failures and the polite count
//   [data-compare-print]                   Print / save as PDF

import { buildTable, parseSlugs, serializeSlugs } from './lib/compare-table.js';
import { readShortlist, writeShortlist } from './lib/compare-store.js';

(function () {
  const app = document.querySelector('[data-compare-app]');
  if (!app) return;

  const emptyState = document.querySelector('[data-compare-empty]');
  const status = document.querySelector('[data-compare-status]');
  const printButton = document.querySelector('[data-compare-print]');
  const indexUrl = app.dataset.entriesUrl || '/entries.json';

  /** @type {Array<{slug: string, title: string}>} */
  let shortlist = [];
  /** @type {object|null} */
  let index = null;
  /** Common rows start hidden: the page opens on what separates the entries. */
  let showSame = false;

  // Stays hidden until there is a comparison to print — `render` reveals it. A
  // button that prints the "pick two" panel is a button that wastes paper.
  if (printButton) printButton.addEventListener('click', () => window.print());

  /** @returns {string[]} the shortlist the URL asks for, or the saved one */
  function initialSlugs() {
    const asked = parseSlugs(new URLSearchParams(window.location.search).get('e'));
    if (asked.length) return asked;
    return readShortlist().map((i) => i.slug);
  }

  /**
   * Keep the URL, the store and the table saying the same thing.
   * `replaceState`: removing a column is a correction, not a place to go Back to.
   * @returns {void}
   */
  function sync() {
    const url = new URL(window.location.href);
    if (shortlist.length) url.searchParams.set('e', serializeSlugs(shortlist.map((i) => i.slug)));
    else url.searchParams.delete('e');
    window.history.replaceState({}, '', url);
    writeShortlist(shortlist);
  }

  /* --------------------------------------------------------------- rendering */

  /**
   * @param {string} tag element name.
   * @param {string|null} [text] text content (null leaves it empty).
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /* Header ids, so every cell can point at the group, row and column it sits in.
     One table per page, so a fixed prefix is unique enough. */
  const colId = (i) => 'cmp-col-' + i;
  const groupId = (key) => 'cmp-grp-' + key;
  const rowId = (groupKey, key) => 'cmp-row-' + groupKey + '-' + key;

  /**
   * One table cell's contents, chosen by the field's `type` — the same rules
   * _includes/field-value.html applies on the entry page.
   * @param {import('./lib/compare-table.js').CompareCell} cell
   * @param {{facet: boolean, key: string}} row
   * @param {string} catalogPath the entry folder, for facet links back to the catalog.
   * @param {string} headers space-separated ids of the group, row and column headers.
   * @returns {HTMLElement}
   */
  function cellNode(cell, row, catalogPath, headers) {
    const td = el('td', null, 'compare-cell');
    // `scope` alone is not enough here: the table has three levels of `th`
    // (group, row, column), and for those WCAG H43 asks every cell to name its
    // own headers by id.
    if (headers) td.setAttribute('headers', headers);
    if (cell.kind === 'empty') {
      const dash = el('span', '—', 'compare-empty-value');
      dash.setAttribute('aria-label', 'Not answered');
      td.appendChild(dash);
      return td;
    }

    if (cell.kind === 'chips') {
      const ul = el('ul', null, 'compare-chips');
      ul.setAttribute('role', 'list');
      cell.items.forEach((item) => {
        const li = document.createElement('li');
        const chipClass = item.tone === 'warn' ? 'chip-warn' : 'chip-plain';
        // A facet value links back into the filtered catalog: "show me everything
        // else that answered this way" is the next question after comparing.
        if (row.facet && item.slug) {
          const a = el('a', item.label, chipClass);
          a.href = catalogPath + '?' + encodeURIComponent(row.key) + '=' + encodeURIComponent(item.slug);
          li.appendChild(a);
        } else {
          li.appendChild(el('span', item.label, chipClass));
        }
        ul.appendChild(li);
      });
      td.appendChild(ul);
      return td;
    }

    if (cell.kind === 'link' || cell.kind === 'email' || cell.kind === 'links') {
      const ul = el('ul', null, 'compare-links');
      ul.setAttribute('role', 'list');
      cell.items.forEach((item) => {
        const li = document.createElement('li');
        // `link` is a bare URL field: its text already IS the href, so print.css
        // must not print the address a second time after it.
        const a = el(
          'a',
          item.label,
          cell.kind === 'link' ? 'compare-link compare-link--bare' : 'compare-link'
        );
        a.href = item.url;
        if (cell.kind !== 'email') {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.appendChild(el('span', ' (opens in a new tab)', 'sr-only'));
        }
        li.appendChild(a);
        ul.appendChild(li);
      });
      td.appendChild(ul);
      return td;
    }

    td.appendChild(el('span', cell.text));
    return td;
  }

  /**
   * Head row: one column per entry, its title linked, summary underneath, and a
   * remove button that is print-hidden.
   * @param {object[]} entries
   * @returns {HTMLElement}
   */
  function headRow(entries) {
    const tr = document.createElement('tr');
    const corner = el('th', '', 'compare-corner');
    corner.scope = 'col';
    // Empty, but still a `th`: in a `headers`-annotated table every `th` needs
    // an id or the markup reads as half-converted.
    corner.id = 'cmp-corner';
    tr.appendChild(corner);
    entries.forEach((entry, i) => {
      const th = el('th', null, 'compare-head');
      th.scope = 'col';
      th.id = colId(i);
      const link = el('a', entry.title, 'compare-head-title');
      link.href = entry.url;
      th.appendChild(link);
      if (entry.summary) th.appendChild(el('p', entry.summary, 'compare-head-summary'));
      const remove = el('button', null, 'compare-head-remove compare-no-print');
      remove.type = 'button';
      const glyph = el('span', 'Remove');
      glyph.setAttribute('aria-hidden', 'true');
      remove.appendChild(glyph);
      remove.appendChild(el('span', ' ' + entry.title + ' from this comparison', 'sr-only'));
      remove.addEventListener('click', () => {
        shortlist = shortlist.filter((i) => i.slug !== entry.slug);
        sync();
        render(entry.title + ' removed.');
      });
      th.appendChild(remove);
      tr.appendChild(th);
    });
    return tr;
  }

  /**
   * Paint the whole page for the current shortlist.
   * @param {string} [announcement] polite message for [data-compare-status].
   * @returns {void}
   */
  function render(announcement) {
    app.replaceChildren();
    const model = buildTable(
      index,
      shortlist.map((i) => i.slug)
    );
    // Titles from the index beat the ones the tray saved: the entry may have been
    // renamed since, and this file is the build's own answer.
    shortlist = model.entries.map((e) => ({ slug: e.slug, title: e.title }));

    if (emptyState) emptyState.hidden = model.entries.length > 1;
    if (printButton) printButton.hidden = model.entries.length < 2;
    if (model.entries.length < 2) {
      if (status && announcement) status.textContent = announcement;
      return;
    }

    const catalogPath = app.dataset.catalogUrl || '/catalog/';
    // Three columns cannot fit a phone, so the table scrolls sideways inside its
    // own box. A scrollable box has to be reachable and named, or a keyboard-only
    // reader can never move it and a screen-reader user never learns it is there.
    const wrap = el('div', null, 'compare-table-wrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Comparison table, scrollable');
    const table = el('table', null, 'compare-table');
    const caption = el('caption', model.entries.map((e) => e.title).join(' · '), 'sr-only');
    table.appendChild(caption);

    const thead = document.createElement('thead');
    thead.appendChild(headRow(model.entries));
    table.appendChild(thead);

    model.groups.forEach((group) => {
      const tbody = document.createElement('tbody');
      tbody.dataset.compareGroup = group.key;
      const groupRow = document.createElement('tr');
      groupRow.className = 'compare-group';
      const groupCell = el('th', group.title, 'compare-group-title');
      groupCell.scope = 'colgroup';
      groupCell.id = groupId(group.key);
      groupCell.colSpan = model.entries.length + 1;
      groupRow.appendChild(groupCell);
      tbody.appendChild(groupRow);

      group.rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = row.same ? 'compare-row is-same' : 'compare-row';
        if (row.same) tr.dataset.compareSame = '';
        const th = el('th', row.label, 'compare-label');
        th.scope = 'row';
        th.id = rowId(group.key, row.key);
        tr.appendChild(th);
        row.cells.forEach((cell, i) =>
          tr.appendChild(cellNode(cell, row, catalogPath, groupId(group.key) + ' ' + th.id + ' ' + colId(i)))
        );
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
    });

    wrap.appendChild(table);
    app.appendChild(toolbar(model));
    app.appendChild(wrap);
    applySameVisibility();

    if (model.missing.length) {
      app.appendChild(
        el(
          'p',
          model.missing.length +
            (model.missing.length === 1
              ? ' entry in this link is no longer published.'
              : ' entries in this link are no longer published.'),
          'compare-note'
        )
      );
    }

    if (status) {
      status.textContent = announcement
        ? announcement + ' Comparing ' + model.entries.length + '.'
        : 'Comparing ' +
          model.entries.length +
          '. ' +
          (model.rowCount - model.sameCount) +
          ' of ' +
          model.rowCount +
          ' fields differ.';
    }
  }

  /**
   * The differences/everything switch. Differences lead: a table that opens on
   * twenty identical rows buries the three that decide anything.
   * @param {ReturnType<typeof buildTable>} model
   * @returns {HTMLElement}
   */
  function toolbar(model) {
    const bar = el('div', null, 'compare-toolbar compare-no-print');
    const summary = el(
      'p',
      model.rowCount - model.sameCount + ' of ' + model.rowCount + ' fields differ',
      'compare-summary'
    );
    bar.appendChild(summary);
    if (model.sameCount) {
      const toggle = el('button', null, 'btn-secondary btn-sm');
      toggle.type = 'button';
      toggle.setAttribute('aria-pressed', showSame ? 'true' : 'false');
      toggle.textContent = showSame
        ? 'Hide the ' + model.sameCount + ' they have in common'
        : 'Show the ' + model.sameCount + ' they have in common';
      toggle.addEventListener('click', () => {
        showSame = !showSame;
        render('');
        const again = document.querySelector('.compare-toolbar button');
        if (again) again.focus();
      });
      bar.appendChild(toggle);
    }
    return bar;
  }

  /** Hide or show the rows every column agrees on, and any group left empty. */
  function applySameVisibility() {
    app.querySelectorAll('[data-compare-same]').forEach((row) => {
      row.hidden = !showSame;
    });
    app.querySelectorAll('[data-compare-group]').forEach((body) => {
      const visible = Array.from(body.querySelectorAll('.compare-row')).some((r) => !r.hidden);
      body.hidden = !visible;
    });
  }

  /* -------------------------------------------------------------------- boot */

  shortlist = initialSlugs().map((slug) => ({ slug, title: slug }));

  fetch(indexUrl, { headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then((data) => {
      index = data;
      // render first: it replaces the placeholder titles with the build's own,
      // and only then is the shortlist worth writing back to the store.
      render('');
      sync();
    })
    .catch(() => {
      if (status)
        status.textContent = 'The comparison data could not be loaded. Open the entries directly instead.';
    });
})();
