/**
 * Grid ordering for the catalog. Split out of assets/js/filters.js: the sort
 * menu's five modes are a self-contained rule set over the cards' data
 * attributes (see _includes/entry-card.html for what each one carries).
 */

/**
 * 2 for a deprecated entry, 1 for one nobody has re-confirmed inside the site's
 * verification window, 0 otherwise. `data-entry-stale` and `data-entry-deprecated`
 * are written by _includes/entry-card.html at build time (see the `verification`
 * and `deprecated_entry` filters) — the browser never re-derives the dates, so a
 * page served from a stale CDN copy cannot disagree with what it shows.
 * @param {HTMLElement} el a card element.
 * @returns {0|1|2}
 */
function staleness(el) {
  if (!el || !el.hasAttribute) return 0;
  // Deprecated (the schema's review status, written the same way at build time)
  // outranks stale: an entry nobody stands behind any more sorts after one that
  // merely has not been re-confirmed.
  if (el.hasAttribute('data-entry-deprecated')) return 2;
  return el.hasAttribute('data-entry-stale') ? 1 : 0;
}

/**
 * Build a comparator over indices into `cards` for the chosen sort.
 * Unknown values (including the default "newest") fall back to newest-first.
 *
 * Two modes demote stale entries; three deliberately do not. "Newest" and
 * "relevance" are the modes a reader lands on without choosing, so they are
 * where the catalog gets to express a preference for entries somebody still
 * stands behind. "A–Z", "recently updated" and the per-field sorts are explicit
 * requests for one specific order, and quietly reordering those would look like
 * a bug — an A–Z list that is not A–Z has no defence.
 *
 * @param {string} sort 'newest' | 'updated' | 'az' | 'relevance' | 'field:<key>'.
 * @param {HTMLElement[]} cards the card elements, in document order.
 * @param {string[]} [relevanceOrder] entry ids ranked by search relevance.
 * @returns {(a: number, b: number) => number}
 */
export function comparatorFor(sort, cards, relevanceOrder = []) {
  if (sort === 'az')
    return (a, b) => (cards[a].dataset.entryTitle || '').localeCompare(cards[b].dataset.entryTitle || '');
  if (sort === 'updated')
    return (a, b) =>
      (cards[b].dataset.entryUpdated || cards[b].dataset.entryDate || '').localeCompare(
        cards[a].dataset.entryUpdated || cards[a].dataset.entryDate || ''
      );
  if (sort === 'relevance') {
    const order = Array.isArray(relevanceOrder) ? relevanceOrder : [];
    // Anything the query did not rank sinks below everything it did.
    const rank = (i) => {
      const r = order.indexOf(cards[i].dataset.entryId);
      return r === -1 ? 1e6 : r;
    };
    // Staleness is the tiebreak, never the lead: a stale entry that answers the
    // query still beats a fresh one that does not. In practice it only bites
    // inside the unranked 1e6 tier, where the query expressed no opinion at all.
    return (a, b) => rank(a) - rank(b) || staleness(cards[a]) - staleness(cards[b]);
  }
  if (sort.indexOf('field:') === 0) {
    const attr = 'data-sort-' + sort.slice(6);
    return (a, b) => (cards[a].getAttribute(attr) || '').localeCompare(cards[b].getAttribute(attr) || '');
  }
  // Default "newest". Staleness leads here because it cannot fight the date it
  // sits in front of: every stale entry is by definition older than the window,
  // so this only ever moves an entry down past fresher ones — the same direction
  // the date was already sending it, and never past a card of its own vintage.
  return (a, b) =>
    staleness(cards[a]) - staleness(cards[b]) ||
    (cards[b].dataset.entryDate || '').localeCompare(cards[a].dataset.entryDate || '');
}

/**
 * Re-append every card to the grid in `comparator` order, skipping the DOM
 * write when the order has not changed.
 * @param {HTMLElement} grid the `[data-entry-grid]` list.
 * @param {HTMLElement[]} cards the card elements.
 * @param {(a: number, b: number) => number} comparator from `comparatorFor`.
 * @param {string} previous the signature returned by the last call.
 * @returns {string} the new signature, to pass back next time.
 */
export function applyOrder(grid, cards, comparator, previous) {
  const idx = cards.map((_, i) => i).sort(comparator);
  const signature = idx.join(',');
  if (signature === previous) return signature;
  const frag = document.createDocumentFragment();
  idx.forEach((i) => frag.appendChild(cards[i]));
  grid.appendChild(frag);
  return signature;
}
