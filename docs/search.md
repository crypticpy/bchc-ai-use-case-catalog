# Search and browse

How someone finds one entry among hundreds. Four surfaces, all generated, none of them naming a
field key: full-text search, the filter rail, the facet landing pages, and the A–Z directory.

Read this when search is finding the wrong thing (or nothing), when you want a tag to have its own
shareable page, or when you are tuning `_data/search.yml`.

---

## The one file you tune

`_data/search.yml` holds three blocks and nothing else. Delete the file and the site still builds:
no synonyms, no aliases, and a landing page for every facet value.

```yaml
synonyms: # query-side word pairs, for words that are NOT in the taxonomy
  chatbot: ["chat assistant", "conversational"]

aliases: # <field key> -> <exact option value> -> words a reader might type
  ai_types:
    "Chat assistant": ["chatbot", "virtual assistant", "copilot"]

landing: # the crawlable browse pages
  enabled: true
  exclude: ["ai_tools"]
  max_values: 200
  min_entries: 1
  max_entries: 24
```

Nothing in it is referenced by key from a template or a script — it is data about your vocabulary,
the same way `_data/schema.yml` is data about your content model. It is validated by
`npm run validate` along with every other `_data/*.yml`.

---

## 1. Full-text search

`_plugins/search_index.rb` writes `/search.json` at build time: every entry (plus events and
cohorts when those modules are on), with its title, summary, the values of every field marked
`search` or `facet`, and the write-up split into sections. `assets/js/search.js` builds a
[Lunr](https://lunrjs.com/) index from it in the browser. There is no server and no search API.

Fields are weighted `title` 10, `summary` 4, `facets` 3, body 1. A typed term is matched three
ways — exact (boost 10), trailing wildcard (boost 3), and edit-distance 1 for terms over three
characters — so `dashbord` still finds the dashboard.

**The relevance floor.** Because the whole write-up is indexed, a common word matches half the
catalog on a passing mention. The grid keeps only hits scoring at least 25% of the top hit and
offers the rest behind one **Show N more that mention "…"** button. That is deliberately not a
tighter fuzzy radius: the noise is genuine body matches, not typos.

**Each result explains itself.** A hit records where in the body it landed, so the card shows the
section heading and the sentence that matched, and the suggestion row deep-links to that section's
anchor rather than the top of a long page.

### synonyms

`synonyms` widens the lunr query itself. Every pair is **bidirectional** — typing either side finds
the other — and every extra term rides at boost 1 against the literal term's 10, so a synonym can
never outrank a real hit.

Pairs do **not** chain: `a: [b]` and `b: [c]` does not make `a` find `c`. That is on purpose, so
widening one term never silently widens its neighbours.

Use it for words that are **not** in the taxonomy: a term of art (`syndromic`), an abbreviation
(`PHI`, `RAG`), the word a resident would use rather than the word the department uses. If the word
*is* a tag, it belongs in `aliases` instead — see below, that is the better answer.

Keys and values are matched case-insensitively; multi-word synonyms are split into words, because
lunr has no phrase to match against.

---

## 2. Vocabulary-aware suggestions

A catalog's taxonomy is its best answer and its worst-kept secret. Someone types `chatbot`, the tag
is called **Chat assistant**, and full-text search reports nothing about a catalog that holds six of
them.

So before the lunr pass, the query is matched against the **filter vocabulary** — every option's
label, its `option_meta.short` and `.description` from `_data/schema.yml`, and its `aliases` from
`_data/search.yml`. Any hit is offered **first** in the suggestion list, marked `Filter`, captioned
with the field it belongs to and the number of entries it would find:

> **Chat assistant** — Filter by Types of AI · 6 matches

Picking it applies the filter, clears the query and moves focus to the results heading. It is the
better answer twice over: it is exhaustive where a text hit is a sample, and it teaches the reader
the word the catalog actually uses.

When a query finds nothing at all, the same suggestions appear in the empty panel as **Did you
mean** chips — which is the one recovery a reader could not have found by retyping.

**Where the words come from.** The pills already on the page: `_includes/filter-groups.html` emits
each option's words as `data-filter-terms`, `assets/js/filters.js` publishes them as
`window.__catalogFilters.vocabulary()`, and `search.js` reads that. One source of truth, and no
extra payload — the vocabulary is matchable on the first keystroke, before `/search.json` has even
finished loading.

**Ranking.** An exact word beats a prefix beats a substring; the bigger tag wins ties. Values
already applied, and values no entry carries, are never suggested. At most three suggestions reach
the listbox and four reach the empty panel — a suggestion list that needs scrolling is a second
search problem.

### aliases vs. option_meta

`aliases` lives in `_data/search.yml` rather than in the schema's `option_meta` because it is search
tuning, not content model — nothing renders it. Folding it into `option_meta.aliases` later would be
a compatible move; the reader of the two files is the same person either way.

Each option value must match `_data/schema.yml` **exactly**. Only add words that are not already in
the label, the short label or the description — those three are always matchable.

---

## 3. Facet landing pages

Every facet combination otherwise lives behind a query string on one JavaScript-filtered page:
`/catalog/?area=environmental-health` serves a crawler the same cards as `/catalog/`. So there is no
page to rank for "AI use cases environmental health", nothing to link from a newsletter or a
conference slide, and no browse path at all without JavaScript.

`_plugins/facet_pages.rb` generates one real page per facet value in use:

```
/<entry.path>/<field-slug>/<value-slug>/     e.g. /catalog/ai-types/chat-assistant/
```

The field slug is the field key with underscores hyphenated — the same token the filter query string
uses — so `/catalog/ai-types/chat-assistant/` is the static twin of
`/catalog/?ai-types=chat-assistant`. Each page has a real `<title>`, a meta description built from
the option's own `option_meta.description`, a canonical link (from `jekyll-seo-tag`), a sitemap
entry (from `jekyll-sitemap`), the same entry cards the catalog uses, and a link back into the live
filter for readers who want to narrow further.

They are linked from the A–Z directory, from the rail (a **Browse all …** link beside any facet
long enough to have a "Show all N"), and from each other.

### Tuning `landing`

| Key | Default | What it is for |
|---|---|---|
| `enabled` | `true` | `false` switches the landing pages off. The A–Z page still lists entries. |
| `exclude` | `[]` | Facet field keys that should not get pages. Use it for a free-text facet whose values are long-tail noise — the shipped config excludes `ai_tools`, where every value is one product version. |
| `max_values` | `200` | A field with more distinct values than this is skipped and logged, so one accidentally free-text facet cannot multiply the build by a thousand pages. |
| `min_entries` | `1` | Values carried by fewer entries than this are skipped. Raise it to 2 or 3 on a large catalog to drop the single-entry tail. |
| `max_entries` | `24` | How many entries one landing page **lists**. The count and the "see them all" link are still the true total. This is what keeps a large catalog's build time bounded. |

**Watch the build.** Every generated page costs render time. At ten entries the shipped schema
produces about 74 landing pages and adds roughly 0.4 s to `bundle exec jekyll build`. Measure with
`bundle exec jekyll build --profile` and read the `_layouts/facet.html` row. Reach for `min_entries`
and `exclude` before `enabled: false`.

**Collisions.** If an entry's slug already occupies a landing page's URL, the entry wins and the
generator logs a warning rather than overwriting it.

---

## 4. The A–Z directory

`/<entry.path>/a-z/` is one page with two halves: every entry by title, bucketed by first letter
(anything not starting with a letter lands in `#`, the way a phone book does), and every facet value
grouped by field with its count.

It is the site's plain browse path — no JavaScript, no query strings, one page a crawler can walk to
reach everything. It is generated by the same plugin, not committed as a file: the entry path is the
schema's to choose, and `scripts/check_front_matter.rb` validates every `<entry.path>/*/index.md` as
an entry, which a directory page is not.

It is linked from the catalog header (**Browse A–Z**), from every facet landing page, and from the
rail's per-facet links, which anchor straight to that field's section.

---

## 5. The Atom feed

`_plugins/catalog_feed.rb` writes `/<entry.path>/feed.xml`. Atom requires absolute IRIs for entry
`<id>`s, which means it needs `url` in `_config.yml` — and the template ships `url: ""`.

That is not a bug for the supported deploy: `.github/workflows/pages.yml` resolves the Pages origin
(a `CNAME`, `<user>.github.io`, or `<owner>.github.io/<repo>`) and writes it into `_config.ci.yml` at
build time, so the published feed is absolute. If you deploy some other way, **set `url` yourself**.
The build prints one warning when it is missing, and falls back to `site.github.url` when
`jekyll-github-metadata` is installed.

---

## Where each piece lives

| File | Owns |
|---|---|
| `_data/search.yml` | Synonyms, aliases, the `landing` block. |
| `_plugins/search_index.rb` | `/search.json` — docs, sections, and the synonym map. |
| `_plugins/facet_pages.rb` | The landing pages, the A–Z page, `site.data.facet_index`, `site.data.entry_az`. |
| `_plugins/catalog_feed.rb` | `feed.xml` and the `url` fallback. |
| `_layouts/facet.html` | One facet value's page. |
| `_layouts/facet-index.html` | The A–Z directory. |
| `_includes/results-header.html` | The `<search>` landmark and the combobox markup. |
| `_includes/filter-groups.html` | The pills, and the `data-filter-terms` the vocabulary is read from. |
| `assets/js/search.js` | Lunr, the listbox, snippets, vocabulary matching, synonym expansion. |
| `assets/js/filters.js` | Filter state, and `window.__catalogFilters` for search.js. |

Tests: `test/plugins/facet_pages_test.rb`, `test/plugins/search_index_test.rb`,
`test/plugins/catalog_feed_test.rb`, `test/scripts/search.test.mjs`,
`test/scripts/search_vocabulary.test.mjs`, and the per-preset assertions in
`test/build/variants.test.mjs`.
