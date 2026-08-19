// The compare shortlist, persisted between pages and visits.
//
// One key, `catalog:compare`, holding `[{slug, title}]` — the title so the tray can
// name an entry whose card is not on the current page (filtered out, or another page
// entirely) without fetching anything. Nothing else is stored and nothing leaves the
// browser.
//
// Every read and write goes through a try/catch: Safari's private mode and a locked-
// down browser profile both throw on `localStorage`, and a compare tray is not worth
// a broken catalog page.

import { COMPARE_MAX, parseSlugs } from './compare-table.js';

export const STORE_KEY = 'catalog:compare';

/** @returns {Storage|null} localStorage, or null when the browser refuses it */
function storage(win) {
  try {
    return (win || globalThis).localStorage || null;
  } catch {
    return null;
  }
}

/**
 * The saved shortlist, cleaned to the same rules the URL uses.
 * @param {Window|{localStorage: Storage}} [win] injected for tests.
 * @returns {Array<{slug: string, title: string}>}
 */
export function readShortlist(win) {
  const store = storage(win);
  if (!store) return [];
  let raw;
  try {
    raw = JSON.parse(store.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const items = raw
    .map((item) => ({ slug: String((item && item.slug) || ''), title: String((item && item.title) || '') }))
    .filter((item) => item.slug);
  const order = parseSlugs(
    items.map((i) => i.slug),
    COMPARE_MAX
  );
  return order.map((slug) => items.find((i) => i.slug === slug));
}

/**
 * Replace the saved shortlist. Writing an empty list removes the key rather than
 * leaving `[]` behind, so a reader who clears the tray leaves no trace.
 * @param {Array<{slug: string, title: string}>} items
 * @param {Window|{localStorage: Storage}} [win] injected for tests.
 * @returns {void}
 */
export function writeShortlist(items, win) {
  const store = storage(win);
  if (!store) return;
  try {
    if (!items.length) store.removeItem(STORE_KEY);
    else store.setItem(STORE_KEY, JSON.stringify(items.map((i) => ({ slug: i.slug, title: i.title }))));
  } catch {
    /* full or blocked: the tray still works for this page load */
  }
}
