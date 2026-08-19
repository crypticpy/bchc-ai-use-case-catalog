/**
 * Which entry-model field rows are open, and the element ids that identify a
 * row. Kept in its own module so the row renderer and the "Add a field" form
 * can both reach the set without importing each other.
 *
 * Expansion is keyed by field key, not by index, so it survives a re-render
 * that adds, removes or reorders rows.
 */

const expanded = new Set();

/** The element id prefix for one field's row. Keys are snake_case; be defensive anyway. */
export function rowIdFor(key) {
  return `schema-field-${String(key).replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** The id of a field row's expand/collapse button — where error links point. */
export function fieldToggleId(key) {
  return `${rowIdFor(key)}-toggle`;
}

/** Open a field's row on the next render (used when validation blames it). */
export function expandField(key) {
  expanded.add(String(key));
}

/** Is this field's row open? */
export function isExpanded(key) {
  return expanded.has(String(key));
}

/** Record the open/closed state of a field's row. */
export function setExpanded(key, open) {
  if (open) expanded.add(String(key));
  else expanded.delete(String(key));
}
