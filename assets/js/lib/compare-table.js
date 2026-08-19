// The pure half of the compare view: the shortlist rules and the table model.
//
// Nothing here touches the DOM, `localStorage` or `location` — assets/js/compare.js
// owns all three — so the rules that decide what a comparison SAYS are unit-tested
// in node (test/scripts/compare.test.mjs) instead of in a browser.
//
// Everything is driven by /entries.json, which is generated from _data/schema.yml
// (see the comment at the top of `entries.json`). No field key, group key or option
// value is named in this file: a schema that gains a field, a group or an option
// gains a row, a section or a chip with no change here.

/** Most entries a shortlist may hold. Three columns is what a page — and a reader — holds. */
export const COMPARE_MAX = 3;

/** Field types whose values are a list of controlled/short values, rendered as chips. */
const CHIP_TYPES = new Set(['multiselect', 'list']);

/**
 * Clean a shortlist: trimmed, de-duplicated, slug-shaped, capped.
 * @param {string|string[]|null|undefined} value a `?e=` parameter or an array of slugs.
 * @param {number} [max] cap (COMPARE_MAX).
 * @returns {string[]}
 */
export function parseSlugs(value, max = COMPARE_MAX) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const out = [];
  for (const item of raw) {
    const slug = String(item ?? '')
      .trim()
      .toLowerCase();
    // Slug shape only: the value is echoed into a URL and used as a lookup key.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    if (out.includes(slug)) continue;
    out.push(slug);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * The `?e=` value for a shortlist.
 * @param {string[]} slugs
 * @returns {string}
 */
export function serializeSlugs(slugs) {
  return parseSlugs(slugs, Number.MAX_SAFE_INTEGER).join(',');
}

/**
 * Add or remove one entry. Adding past the cap is REFUSED rather than silently
 * dropping someone's earlier pick — the caller announces `full` to the reader.
 * @param {string[]} slugs current shortlist.
 * @param {string} slug the entry toggled.
 * @param {number} [max] cap (COMPARE_MAX).
 * @returns {{slugs: string[], action: 'added'|'removed'|'full'|'ignored'}}
 */
export function toggleSlug(slugs, slug, max = COMPARE_MAX) {
  const list = parseSlugs(slugs, Number.MAX_SAFE_INTEGER);
  const [clean] = parseSlugs([slug], 1);
  if (!clean) return { slugs: list, action: 'ignored' };
  if (list.includes(clean)) return { slugs: list.filter((s) => s !== clean), action: 'removed' };
  if (list.length >= max) return { slugs: list, action: 'full' };
  return { slugs: list.concat(clean), action: 'added' };
}

/**
 * One cell's renderable model. `kind` decides the element, never the field key.
 * @typedef {{kind: 'empty'|'text'|'chips'|'links'|'link'|'email'|'date'|'boolean',
 *            items: Array<{label: string, short: string, tone: string, slug: string, url: string}>,
 *            text: string, key: string}} CompareCell
 */

/** @param {*} value @returns {*[]} the value as a non-empty array */
function asList(value) {
  if (value === null || value === undefined || value === '') return [];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((v) => v !== null && v !== undefined && v !== '');
}

/**
 * Renderable model for one field value.
 * @param {object} field a `fields` entry from /entries.json.
 * @param {*} value the raw front matter value.
 * @param {string[]} slugs the facet slugs for the same value, positionally aligned.
 * @returns {CompareCell}
 */
function cellFor(field, value, slugs) {
  const list = asList(value);
  const empty = { kind: 'empty', items: [], text: '', key: '' };
  if (!list.length) return empty;

  const short = field.short || {};
  const tone = field.tone || {};
  const type = field.type || 'text';

  if (type === 'links') {
    const items = list
      .map((item) => {
        const url = String((item && item.url) || item || '');
        const label = String((item && item.label) || url);
        return { label, short: label, tone: 'neutral', slug: '', url };
      })
      .filter((i) => i.url);
    return items.length
      ? {
          kind: 'links',
          items,
          text: items.map((i) => i.label).join(', '),
          key: items.map((i) => i.url).join('|'),
        }
      : empty;
  }

  if (type === 'url') {
    const url = String(list[0]);
    return {
      kind: 'link',
      items: [{ label: url, short: url, tone: 'neutral', slug: '', url }],
      text: url,
      key: url,
    };
  }

  if (type === 'email') {
    const address = String(list[0]);
    return {
      kind: 'email',
      items: [{ label: address, short: address, tone: 'neutral', slug: '', url: 'mailto:' + address }],
      text: address,
      key: address,
    };
  }

  if (type === 'boolean') {
    const yes = list[0] === true || list[0] === 'true' || list[0] === 'Yes';
    return { kind: 'boolean', items: [], text: yes ? 'Yes' : 'No', key: yes ? 'yes' : 'no' };
  }

  if (type === 'date') {
    const text = String(list[0]);
    return { kind: 'date', items: [], text, key: text };
  }

  if (type === 'select' || CHIP_TYPES.has(type)) {
    const items = list.map((raw, i) => {
      const label = String(raw);
      return {
        label,
        short: String(short[label] ?? label),
        tone: String(tone[label] ?? 'neutral'),
        slug: String(slugs[i] ?? ''),
        url: '',
      };
    });
    return {
      kind: 'chips',
      items,
      text: items.map((i) => i.label).join(', '),
      key: items.map((i) => i.label).join('|'),
    };
  }

  const text = list.map((v) => String(v)).join(', ');
  return { kind: 'text', items: [], text, key: text };
}

/**
 * The comparison model: entries in the order asked for, rows grouped the way the
 * schema groups them, each row flagged `same` when every column agrees.
 *
 * Rows no column answered are dropped (a labelled void helps nobody); groups left
 * with no rows disappear with them.
 *
 * @param {object} index the parsed /entries.json.
 * @param {string[]} slugs the shortlist, in reading order.
 * @returns {{entries: object[], missing: string[],
 *            groups: Array<{key: string, title: string, description: string,
 *                           rows: Array<{key: string, label: string, type: string, facet: boolean,
 *                                        same: boolean, cells: CompareCell[]}>}>,
 *            rowCount: number, sameCount: number}}
 */
export function buildTable(index, slugs) {
  const data = index || {};
  const byId = new Map((data.entries || []).map((e) => [e.slug, e]));
  const entries = [];
  const missing = [];
  for (const slug of parseSlugs(slugs, Number.MAX_SAFE_INTEGER)) {
    const found = byId.get(slug);
    if (found) entries.push(found);
    else missing.push(slug);
  }

  const groups = [];
  let rowCount = 0;
  let sameCount = 0;
  const fieldsByGroup = new Map();
  for (const field of data.fields || []) {
    const key = field.group || 'other';
    if (!fieldsByGroup.has(key)) fieldsByGroup.set(key, []);
    fieldsByGroup.get(key).push(field);
  }

  for (const group of data.groups || []) {
    const rows = [];
    for (const field of fieldsByGroup.get(group.key) || []) {
      const cells = entries.map((entry) =>
        cellFor(field, (entry.values || {})[field.key], (entry.slugs || {})[field.key] || [])
      );
      if (cells.every((c) => c.kind === 'empty')) continue;
      // "Same" compares the resolved values, so two entries that answered a
      // multiselect in a different order are still different — the order is the
      // submitter's own emphasis and flattening it would hide a real difference.
      const same = cells.length > 1 && cells.every((c) => c.kind === cells[0].kind && c.key === cells[0].key);
      rows.push({
        key: field.key,
        label: field.label || field.key,
        type: field.type || 'text',
        facet: Boolean(field.facet),
        same,
        cells,
      });
      rowCount += 1;
      if (same) sameCount += 1;
    }
    if (rows.length)
      groups.push({
        key: group.key,
        title: group.title || group.key,
        description: group.description || '',
        rows,
      });
  }

  return { entries, missing, groups, rowCount, sameCount };
}

/**
 * The site root a script under `/assets/js/` was served from, so a page can find
 * `/entries.json` and `/compare/` under any `baseurl` without the markup telling it.
 * @param {string} scriptSrc the `src` of the compare script.
 * @returns {string} an absolute-or-relative base ending in `/`.
 */
export function siteBase(scriptSrc) {
  const src = String(scriptSrc || '');
  const cut = src.indexOf('/assets/js/');
  if (cut === -1) return '/';
  return src.slice(0, cut + 1);
}
