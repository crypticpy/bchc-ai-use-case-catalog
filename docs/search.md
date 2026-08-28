# Search and browse

How someone finds one entry among hundreds. Four surfaces, all generated, none of them naming a
field key: full-text search, the filter rail, the facet landing pages, and the A–Z directory.

Read this when search is finding the wrong thing (or nothing), when you want a tag to have its own
shareable page, or when you are tuning `_data/search.yml`.

---

## The one file you tune

`_data/search.yml` holds four blocks and nothing else. Delete the file and the site still builds:
no synonyms, the concept defaults below, no aliases, and a landing page for every facet value.

```yaml
synonyms: # query-side word pairs, for words that are NOT in the taxonomy
  chatbot: ["chat assistant", "conversational"]

concepts: # bounds on the map the build derives from your own prose
  enabled: true
  max_df_ratio: 0.5
  max_related: 6
  weight: 0.9
  max_expansions: 4

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
offers the rest behind one **Show N more that mention "…"** button — **related to "…"** when a
concept hit is among them, since those never say the word. That is deliberately not a tighter fuzzy
radius: the noise is genuine body matches, not typos.

**Each result explains itself.** A hit records where in the body it landed, so the card shows the
section heading and the sentence that matched, and the suggestion row deep-links to that section's
anchor rather than the top of a long page.

**Structured field values are indexed as words.** A field whose type holds structured values — a
`links` field's `{label, url}` items, an `images` field's `{src, alt}` items, a future
`{org, url, email, note}` — contributes its **values**, not its keys, and a value that is a URL, a
`mailto:` or a site path contributes nothing — a scheme counts only with its `//`, so prose that
happens to carry a colon ("Guidance: redact PII first") is kept as the words it is. Nothing in
`_plugins/search_index.rb` names a field or
a type: the shape of the value decides, so a new structured field is indexed the day it is added. A
plain scalar is indexed as it stands, so a `url` field marked `search: true` still matches its own
URL — that is the reader asking for exactly that.

### synonyms

`synonyms` widens the lunr query itself. Every pair is **bidirectional** — typing either side finds
the other — and every extra term rides at boost 1 against the literal term's 10, so a synonym can
never outrank a real hit.

Pairs do **not** chain: `a: [b]` and `b: [c]` does not make `a` find `c`. That is on purpose, so
widening one term never silently widens its neighbours.

Use it for words that are **not** in the taxonomy: a term of art (`redaction`), an abbreviation
(`PHI`, `RAG`), the word a resident would use rather than the word the department uses. If the word
*is* a tag, it belongs in `aliases` instead — see below, that is the better answer.

Keys and values are matched case-insensitively; multi-word synonyms are split into words, because
lunr has no phrase to match against.

### concepts

`synonyms` only knows the pairs somebody wrote down, and nobody writes down enough of them. So the
build derives its own, from the catalog's prose rather than from a configured list: two words are
**related** when they keep turning up in the same entries without simply being common everywhere.
That is normalised pointwise mutual information over entry-level co-occurrence, computed in
`_plugins/search_index.rb` and shipped in `/search.json` beside the docs.

There is no stop-word list to maintain. `max_df_ratio` is the stop-word list, read off this
catalog: a word more than half the entries use cannot be about any one of them, which is why
"public" is noise on a public-health catalog and signal somewhere else.

**It is recall, never ranking.** A document the reader's own words already found keeps its literal
score untouched. Everything the concept map adds is placed strictly *below* the weakest literal hit
— `weight` of it — so no expansion can reorder, let alone outrank, a match the reader earned by
typing. `assets/js/search.js` clamps `weight` to at most 1, which is what makes that a guarantee
rather than a hope. The suggestion listbox holds concept rows behind every literal row too, so its
usual "events first, then entries" grouping cannot lift a concept-matched event over an entry the
reader's own word found. When a query finds nothing literal at all, the concept hits are the answer
and keep their own scores; that is the case the layer exists for.

| Key | Default | What it is for |
|---|---|---|
| `enabled` | `true` | `false` derives no map and ships none. Search behaves exactly as it did before the block existed. |
| `min_entries` | `12` | Below this many entries the corpus statistics are noise, not signal, and no map is derived. |
| `min_df` | `2` | A word only one entry uses relates to nothing. |
| `max_df_ratio` | `0.5` | A word more than this share of entries use says nothing about any of them. |
| `terms_per_entry` | `40` | How many of an entry's most distinctive words (tf-idf) are paired. The pairing pass is quadratic in this, so it is what keeps a thousand-entry build bounded. |
| `min_pairs` | `2` | How many entries must agree before a pair counts. |
| `min_score` | `0.35` | Normalised PMI, −1..1. Raise it for a tighter map. |
| `max_related` | `6` | Related words kept per word. |
| `max_terms` | `1500` | Words kept in the map at all, most-used first — the cap on what `/search.json` carries. |
| `weight` | `0.9` | Where a concept hit sits relative to the **weakest** literal hit: `0.9` is just below it, `0.2` is deep in the tail. Clamped to 1. |
| `max_expansions` | `4` | Most concept words added to any one query, taken a round at a time so one word of a multi-word query cannot spend the whole budget. |

The map is deterministic: same catalog, same map, sorted keys, no timestamps. On the shipped
ten-entry sample catalog (with `min_entries` lowered so it derives anything at all) it pairs
`transcription` with `speech`, `recordings` and `minutes`, and `azure` with `openai` and
`microsoft` — none of which is in `synonyms`. At ten entries it also produces junk, which is what
`min_entries: 12` is there to prevent.

---

## 1a. Scale

The catalog ships as static files, so "search at a thousand entries" is a budget question, and the
budgets are measured rather than asserted. `scripts/performance_fixture.mjs` builds deterministic
catalogs at 0/1/10/100/500/1000 entries and `scripts/interaction_performance.mjs` drives each
retained one in real Chrome at a 4× CPU slowdown on a 390×844 viewport, recording cold
time-to-first-result and warm keystroke p95. Which sizes get a browser fixture is
`interaction_entries` in `quality/performance-budgets.json`; what each size must hit is its
`scale_budgets` block. The probe drives **one interaction per protocol call** — the cold load, then
each keystroke, then each filter, sort and comparison — and each call gets a deadline that grows with
the tier. Driving a whole tier inside a single call made its entire wall time race one ceiling, which
a thousand entries under the throttle on a shared runner loses; measuring one step at a time cannot,
and because every step times itself in the page with `performance.now()`, the round trips between
steps never reach the numbers. A step that still will not answer is recorded as a finding against
that size rather than throwing away the sizes that did measure.

Three things keep the client honest as the catalog grows, all in `assets/js/search.js`:

- **The write-up is held once.** `prepare()` returns a new doc rather than annotating the parsed
  payload, so the sections and the joined body are not both alive for the life of the page.
- **No position metadata.** Recording every occurrence of every term in every field is the largest
  thing a lunr index holds. `snippetFor()` finds the term in the body itself, for the one hit it is
  about to render.
- **No literal pre-scan.** A "fast path" used to read every doc's title, summary, facets and body on
  every single-term query. It never saved the fuzzy expansion it was named for — a single-term query
  with any hit already skips the approximate pass — so it was a full-corpus read duplicating what
  lunr's inverted index had already done.

What the harness measured on a developer laptop, in Chrome at a 4× CPU slowdown:

| entries | `search.json` gzipped | cold time-to-first-result | warm keystroke p50 | warm keystroke p95 |
| ------: | --------------------: | ------------------------: | -----------------: | -----------------: |
|     100 |               17.2 KB |                    252 ms |              78 ms |             129 ms |
|     500 |               83.3 KB |                   1107 ms |             327 ms |             731 ms |
|    1000 |              170.6 KB |                   2682 ms |            1063 ms |            1838 ms |

**Those are not the budgets, and they are not a UX promise either.** The gate runs on a GitHub
Actions runner, which is several times slower than a laptop under the same emulation — and, more
awkwardly, is not even consistent with itself: two runs of identical code measured 353 ms and 510 ms
for the same 100-entry keystroke, a **1.44× swing** on the hardware alone. A budget calibrated to one
reading of a runner like that fails on the next reading of the same code, which teaches everyone to
ignore it.

So the enforced numbers follow one rule:

> **Enforced budget = the worst CI observation × 1.75, rounded up to a clean number.** A tier with no
> CI observation extrapolates from the **worst** CI/local ratio yet seen (3.95× warm, 3.10× cold)
> before applying the same 1.75.

| entries | metric   | worst CI observation |     or extrapolated from local |    ×1.75 |     enforced |
| ------: | :------- | -------------------: | -----------------------------: | -------: | -----------: |
|     100 | warm p95 |               510 ms |                              — |   892 ms |   **900 ms** |
|     500 | warm p95 |              2058 ms |                              — |  3601 ms |  **4000 ms** |
|     500 | cold     |              2292 ms |                              — |  4011 ms |  **4500 ms** |
|    1000 | warm p95 |                    — | 1838 ms × 3.95 = 7261 ms |  12707 ms | **13000 ms** |
|    1000 | cold     |                    — | 2682 ms × 3.10 = 8314 ms |  14549 ms | **15000 ms** |

Read those as **regression tripwires**, not as what a reader experiences: they are set to catch a 2×
slowdown on a throttled emulated phone, on a runner of unknown mood, against a fixture built to be
the worst case for the grid. The UX evidence is the local table above. The 1000-entry row is
extrapolated rather than measured and should be tightened once the tier has run green.

Read the warm column with its cause in mind. Instrumenting the 1000-entry fixture puts `query()`
itself at **3–9 ms** — the index is not what the reader waits for. The rest is the grid: publishing a
result set re-renders the catalog page's cards synchronously, and after a query that matches nearly
every entry the browser is still laying those cards out when the next keystroke arrives, which is
why the p95 at 1000 entries is roughly double the p50. The fixture is the worst case for this — every
generated entry shares the same handful of words, so every query matches all of them. What the
budgets bound is therefore the whole keystroke, not search: bringing them down is work on the card
grid, not on this file.

## 1b. Where the cost went

Four pieces move the cost above off the reader's path — or, where it cannot be moved, put it under
their control. The public story is `/about/search/`; the mechanics are here.

- **The build happens off the main thread.** Where the browser has workers,
  `assets/js/search-worker.js` fetches `/search.json`, parses it and runs the entire lunr build,
  then posts the payload plus `lunr.Index.prototype.toJSON()` back; the page revives it with
  `lunr.Index.load`, a fraction of the build's cost, so typing and scrolling never freeze behind an
  index under construction. The worker builds the **same index byte for byte** — same ref, fields,
  boosts and body join as the inline path (`test/scripts/search_worker.test.mjs` asserts identical
  rankings) — and any worker failure falls back silently to the original inline build, which is also
  what browsers without workers (and jsdom in the tests) run.
- **A finished build is kept in IndexedDB**, keyed to a version that names everything the build
  depends on: `_plugins/search_index.rb` stamps a SHA-256 over the docs, both widenings, and the
  index implementation (`lunr.min.js` + `search-worker.js`) — deliberately excluding
  `generated_at`, so a redeploy that changes none of that keeps the cache warm, while a content
  edit or a lunr/worker upgrade retires every cached build on its own. A downloaded payload is
  cached only when its own `version` stamp matches the page's, so a half-propagated deploy
  (fresh HTML, stale `/search.json`) can serve one stale visit but never poison the cache. A
  return visit to an unchanged catalog skips the network and the build entirely; any cache
  failure (no IndexedDB, a lying private window) just means building every visit, exactly as
  before.
- **A weak device facing a large catalog gets asked first.** When the build-time entry count
  (`data-search-entries`, stamped by the plugin through `_includes/results-header.html`) reaches
  `HEAVY_ENTRIES` (300 in `assets/js/search.js`) *and* the device reports few cores or little
  memory, the automatic load is replaced by a **Load full search** button (`[data-search-gate]`)
  narrating real progress — bytes downloaded, then the build phase. Until it is pressed, typing
  still offers the vocabulary suggestions, which never needed the index, and the grid stays
  unfiltered rather than silently wrong. Absent device signals count as capable: the gate is for
  devices that say they are constrained.
- **Off-screen cards cost nothing.** `content-visibility: auto` on `.entry-card`
  (`assets/css/components/catalog.css`) lets the browser skip layout and paint for cards outside
  the viewport — at 1000 entries, most of the grid, and the grid is what the warm column above is
  made of.

The probe pins both runtime signals so every runner measures the same path:
`navigator.connection.saveData` is `true` (so the idle prewarm stays out of the cold number — CI's
"cold" is a true cold) and `navigator.hardwareConcurrency` is `8` (so a 2-vCPU runner measures the
load, not the gate; the gate has its own jsdom coverage in `test/scripts/search.test.mjs`).

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
| `_data/search.yml` | Synonyms, the `concepts` bounds, aliases, the `landing` block. |
| `_plugins/search_index.rb` | `/search.json` — docs, sections, structured-value flattening, the synonym map and the derived concept map. |
| `_plugins/facet_pages.rb` | The landing pages, the A–Z page, `site.data.facet_index`, `site.data.entry_az`. |
| `_plugins/catalog_feed.rb` | `feed.xml` and the `url` fallback. |
| `_layouts/facet.html` | One facet value's page. |
| `_layouts/facet-index.html` | The A–Z directory. |
| `_includes/results-header.html` | The `<search>` landmark and the combobox markup. |
| `_includes/filter-groups.html` | The pills, and the `data-filter-terms` the vocabulary is read from. |
| `assets/js/search.js` | Lunr, the listbox, snippets, vocabulary matching, synonym and concept expansion. |
| `assets/js/filters.js` | Filter state, and `window.__catalogFilters` for search.js. |
| `quality/performance-budgets.json` | `interaction_entries` (which sizes get a browser fixture) and each size's `scale_budgets`. |
| `scripts/performance_fixture.mjs` | The deterministic fixture catalogs and the payload budgets. |
| `scripts/interaction_performance.mjs` | Cold and warm search latency in real Chrome, per retained size. |

Tests: `test/plugins/facet_pages_test.rb`, `test/plugins/search_index_test.rb`,
`test/plugins/catalog_feed_test.rb`, `test/scripts/search.test.mjs`,
`test/scripts/search_vocabulary.test.mjs`, `test/scripts/performance_fixture.test.mjs`,
`test/scripts/interaction_performance.test.mjs`, and the per-preset assertions in
`test/build/variants.test.mjs`.
