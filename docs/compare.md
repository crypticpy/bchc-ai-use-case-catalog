# Compare and print

Two entries in two browser tabs is how people compare things when a site does not help them.
They lose the third tab, they miss the field one entry left blank, and they end up quoting the
one they happened to read last. This is the feature that replaces the tabs: a shortlist of up to
three entries, a field-by-field table that leads with what is *different*, and a print stylesheet
that turns that table into the one-page brief someone actually forwards.

Nothing here needs configuration. It reads `_data/schema.yml` like everything else, so a field or
a group you add shows up in the comparison on the next build with no code change.

## What a reader sees

**On the catalog.** Every card grows a **Compare** checkbox in its footer. Ticking it opens a tray
along the bottom of the window showing the shortlist and a **Compare 2** button. The shortlist
holds three at most — a fourth pick is refused out loud rather than silently pushing someone's
first choice off the end. It survives navigation and a closed browser (`localStorage`), so a
reader can filter, read an entry, come back, and still have their picks.

**On `/compare/`.** One column per entry, one row per schema field, grouped into the same sections
the entry page uses. Rows every entry answered identically are folded away behind
*"Show the N they have in common"*, because a table that opens on twenty matching rows buries the
three that decide anything. A value that is a filter links back into the filtered catalog: *show
me everything else that answered this way* is the next question after comparing.

The URL carries the shortlist as `?e=slug,slug`, so the page pastes into an email or a chat and
the person who opens it sees the same table. Removing a column rewrites both the URL and the saved
shortlist.

**Printed.** The **Print / save as PDF** button prints the table alone: no header, no footer, no
buttons, no tray. Every link prints its own URL after the text, and a stamp at the foot names the
site and the date. An entry page prints the same way — the sidebar unsticks, the "copy link" and
share controls disappear, and the fact strip is kept whole across a page break.

## What it is built from

| File | Job |
|---|---|
| `entries.json` | A Liquid page at the site root that emits every published entry with every schema field. This is the whole data model of the compare view — see the comment at the top of the file for the shape. |
| `assets/js/lib/compare-table.js` | The pure half: shortlist rules, the table model, which rows are "the same". No DOM, no storage, no `location`. |
| `assets/js/lib/compare-store.js` | The `localStorage` shortlist (`catalog:compare`), wrapped so a browser that refuses storage costs nothing. |
| `assets/js/compare.js` | The tray. Injects the per-card toggles and the tray itself; loaded by `_layouts/catalog.html`. |
| `assets/js/compare-page.js` | The `/compare/` renderer; loaded by `_layouts/compare.html`. |
| `assets/css/components/compare.css` | The tray, the toggles and the table. |
| `assets/css/components/print.css` | The `@media print` rules shared by the compare page and entry pages. |
| `_includes/print-stamp.html` | "Printed from *site* on *date*" plus the source URL. Print-only. |
| `test/scripts/compare.test.mjs` | The model, the tray and the page, in `node --test` + jsdom. |

`_includes/entry-card.html` is deliberately **not** on that list. The toggle is injected from
JavaScript onto the card's existing `data-entry-id` / `data-entry-title` attributes, which means a
reader without JavaScript sees the catalog exactly as it always was and never meets a control that
does nothing. The same rule explains why the print button on `/compare/` ships with `hidden` and is
revealed by the script.

## Notes for whoever changes it

- **Do not name a field.** Rows, groups, chip labels, tones and short labels all come from
  `entries.json`, which comes from the schema. If you find yourself writing a field key in
  `compare-table.js`, the answer belongs in `_data/schema.yml` instead.
- **`entries.json` grows with the catalog.** It carries every field of every entry — roughly 3 KB
  per entry uncompressed, so about 900 KB at 300 entries. It is fetched only when someone opens
  `/compare/`, and it compresses well, but past a few hundred entries it wants splitting or
  trimming to the fields the table actually renders.
- **Markdown, image and file fields are excluded** from `entries.json`. A write-up does not compare
  in a table cell, and shipping every entry's body would multiply the file's size for a column
  nobody can read side by side.
- **"Same" compares resolved values, order included.** Two entries that answered a multiselect with
  the same values in a different order count as different: the order is the submitter's own
  emphasis, and flattening it would hide a real difference.
- **Three columns is a decision, not a limit of the code** (`COMPARE_MAX` in `compare-table.js`).
  Four does not fit a phone, a printed page, or a reader's working memory.
- **Every cell carries a `headers` attribute.** The table has three levels of header — the group
  band, the field label and the entry column — and for that WCAG asks each cell to name its own
  headers by id rather than rely on `scope`. If you add a level or a cell, give the header an id
  and reference it; `test/scripts/compare.test.mjs` fails otherwise.
