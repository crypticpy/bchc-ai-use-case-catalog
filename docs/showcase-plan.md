# The showcase: a landing page and a live example of every preset

**Status: shipped (2026-08-18, released as v1.7.0).**

## Why

The template's own deployment has been one thing: the BCHC AI use case catalog, filled with
sample entries and a yellow "Demo content" strip. That shows one configuration well and the
other three not at all — a reader has to take the README's word that the same repository is
also a program/cohort portal, a resource library, or the smallest useful catalog. The way
WordPress themes are sold is the model to borrow: a landing page that says what the thing is
and can do, and a live, complete demo of each configuration one click away.

The day-one starter (`crypticpy/bchc-catalog-starter`) keeps its job — "here is your catalog
after the launch guide" — and stays a separate repository, because its point is that it *is*
a real copy.

## What it looks like when done

```
<pages root>/                       the landing: what the template is, the four examples, features, start here
<pages root>/setup/                 the wizard, so "Configure your own" works from the landing
<pages root>/examples/ai-use-cases/       full live site — the shipped BCHC catalog (today's demo)
<pages root>/examples/cohort-portal/      full live site — a program's cohort portal
<pages root>/examples/resource-library/   full live site — a curated resource library
<pages root>/examples/blank/              full live site — the smallest useful catalog
```

Every example is a complete Jekyll build of the same repository with that preset's
`_data/{site,theme,schema,navigation}.yml` overlaid and curated sample content for that
schema — search, feeds, facets, the submit page, the wizard, everything. On each example the
"Demo content" strip becomes the **example switcher**: which example this is, the other three,
"How this one is configured", "See day one" (the starter) and "Configure your own".

None of it reaches a fork: the showcase is opt-in — it builds only when the repository variable
`CATALOG_SHOWCASE` is `true` *and* `_data/site.yml` has `demo: true` — so a copy of the template
never builds it, not even before `npm run eject:samples` (and the Apply setup workflow) flip
`demo` to `false` and delete the showcase content. A fork's home page stays its catalog.

## Design decisions

1. **One repository, several builds — not one build, and not several repositories.** A Jekyll
   site is one configuration; the deploy builds the landing plus one build per preset and
   assembles them into a single Pages artifact. `scripts/build_variants.mjs` already does the
   overlay-and-build for the test matrix; the showcase builder reuses that machinery. Four
   repositories would drift; one build cannot switch schema in-page.
2. **Everything the pages read is data.** Build-time facts go in a generated `_config`
   override (`site.showcase`, below); authored copy goes in `_data/showcase.yml`; the preset
   facts the landing and switcher show (name, description, modules on, field count, colors)
   are generated from `assets/js/configurator/presets.js` into the scratch tree at build time
   as `_data/showcase_presets.json` — the same source the wizard uses, so "how this example is
   configured" is exactly what choosing that preset on step 1 gives you. Nothing hardcodes a
   preset id or a schema field name in Liquid.
3. **The switcher is a `<details>` menu.** It works without JavaScript; a small script adds
   Escape-to-close and click-outside-to-close. It is tested three ways: a jsdom unit test for
   the script, a build test asserting the markup on a built example, and pa11y on the built
   landing and one example.
4. **Root is the landing.** The demo's AI use case catalog moves to `/examples/ai-use-cases/`.
   Old links to the root land on the landing with that example one click away.
5. **The flagship example keeps the live loop; the others do not open issues.** On
   `/examples/ai-use-cases/` the submit form still opens issues on `crypticpy/bchc-template`
   (schema matches). The other three examples run with `github.repository` blank so a
   submission cannot open an issue whose fields the template repository's workflow would
   misread; the page still renders and says it is an example.
6. **Sample content follows the existing rules:** `sample: true` on every entry, org-agnostic,
   no invented real-sounding cities, agencies or people; each example's entries are validated
   against that preset's schema in the build.

## Contracts (what each part reads and writes)

### `site.showcase` (build-time `_config` override, written by `scripts/build_showcase.mjs`)

```yaml
showcase:
  role: landing | example
  example: cohort-portal            # examples only: this build's preset id
  root: "/bchc-template"            # baseurl of the landing build ('' at a domain root)
  examples:                         # every example, in landing order
    - id: ai-use-cases
      name: "AI use case catalog"
      path: "/bchc-template/examples/ai-use-cases"
    - …
```

Absent (a fork, a local `jekyll serve`, CI's single build) → nothing showcase-related renders
and the banner keeps its current sentence.

### `_data/showcase_presets.json` (generated into each scratch tree; never committed)

One object per preset, from `presets.js`: `id`, `name`, `description`, `modules` (the keys
that are `true`), `field_count`, `facet_count`, `entry_singular`, `entry_plural`, `theme`
(`primary`, `secondary`, `accent` hex), `path` (same as `site.showcase.examples[].path`).

### `_showcase/<preset-id>/` (authored, committed; Jekyll ignores `_` dirs)

Mirrors the repository: `catalog/<slug>/index.md` (+ `screenshots/`), `_data/events.yml`,
`_data/cohorts/<year>.yml`, `_data/resources.yml`, `_data/governance.yml`, `_data/metrics.json`
— whatever that example needs. The builder overlays the preset, then copies this directory
over the scratch tree, replacing the shipped `catalog/`, `_data/cohorts/`, `events.yml`,
`resources.yml`. `ai-use-cases` has no directory: the working tree *is* that example.

### `_data/showcase.yml` (authored; the landing's copy)

`title`, `tagline`, `lead`, `hero_ctas`, `examples[]` (`id`, `headline`, `blurb`,
`screenshot` — `assets/images/showcase/<id>-home.png` — `alt`), `features[]` (`title`,
`body`, optional `link`), `how_it_works[]` (three steps), `start_here[]` (starter, launch
guide, wizard, docs), `starter_url`.

### Templates

- `index.md` gains one branch at the top: `{% if site.showcase.role == 'landing' %}{% include
  showcase-landing.html %}{% else %}…existing home…{% endif %}`.
- `_includes/showcase-landing.html` (+ `_includes/showcase/*.html` if it helps) renders from
  `site.data.showcase` and `site.data.showcase_presets`; example cards carry
  `id="example-<id>"` (the switcher's "How this one is configured" links there).
- `_includes/demo-banner.html`: `site.showcase.role == 'example'` → the switcher; otherwise
  today's banner (kept verbatim, including `demo_starter_url`).
- `_plugins/showcase.rb`: on a `landing` build, drop every page except `/`, `/setup/`,
  `/404.html` and assets; `search_index.rb` and `catalog_feed.rb` skip a landing build.

### Build and deploy

- `scripts/build_showcase.mjs [--destination DIR] [--url U] [--baseurl B] [only ids…]`: builds
  the landing into `DIR` and each example into `DIR/examples/<id>`; runs
  `scripts/check_front_matter.rb` in every example's scratch tree; exits non-zero on any
  failure. `npm run build:showcase`.
- `.github/workflows/pages.yml`: when repository variable `CATALOG_SHOWCASE` is `'true'` and
  `_data/site.yml` has `demo: true`, run the showcase builder instead of the single
  `jekyll build`; otherwise unchanged. Header comment explains it. (Review finding: the
  original `!= 'false'` gate would have deployed the template's landing onto a fork's Pages
  site between turning Pages on and ejecting the samples; opt-in closes that.)
- `scripts/eject_samples.mjs`: also removes `_showcase/` and `_data/showcase.yml`.
- Tests: `test/build/showcase.test.mjs` (landing + every example: pages exist, switcher
  markup, "How this one is configured" facts match `presets.js`, no issue-opening submit on
  non-flagship examples, feeds/search only where a catalog exists), `test/js/example-switcher.test.mjs`
  (jsdom), pa11y in `quality.yml` on the built landing and one example.

## Waves

| Wave | Owns | Deliverable |
|---|---|---|
| A. Pipeline + switcher | `scripts/build_showcase.mjs`, `_plugins/showcase.rb` (+ guards), `_includes/demo-banner.html`, `assets/js/example-switcher.js`, `assets/css/components/example-switcher.css`, `index.md` branch, `pages.yml`, `eject_samples.mjs`, tests, `package.json` script | landing + four examples build locally into `_site`; switcher tested |
| B. Example content | `_showcase/cohort-portal/**`, `_showcase/resource-library/**`, `_showcase/blank/**` | 4–6 entries each (3 for blank) plus module data, valid against each preset's schema |
| C. Landing | `_data/showcase.yml`, `_includes/showcase-landing.html`, `_includes/showcase/*`, `assets/css/components/showcase.css` | the landing renders from data with placeholder image slots |
| D. Integration | screenshots (`assets/images/showcase/*`), docs (`README`, `configuration.md`, `admin-guide.md`, `upgrading.md`, `ARCHITECTURE.md`, `CHANGELOG`), full gates, `/freview`, deploy, verify live, release v1.7.0 | |

Waves A–C run in parallel on disjoint files; D follows.

## What ended up different

Recorded as built, so the next reader of this plan is not surprised by the tree.

- **The landing gets its own site identity, in the scratch tree only.** `landingChrome()` in the
  builder rewrites `_data/site.yml` for the landing build from `_data/showcase.yml`: the site name,
  tagline, description and footer blurb become the landing's own, the navigation and footer links
  are filtered down to what a landing has (there is no catalog behind it), and `index.md`'s front
  matter title is replaced so `jekyll-seo-tag` puts the showcase title in `og:title` rather than
  "Home". The demo banner is switched **off** for the landing — it is the template introducing
  itself, not sample content — while every example keeps it, in its switcher form.
- **`site.showcase.examples[].path` has no trailing slash**, by contract. Every link to an example
  adds one (`_includes/showcase/example-card.html`, `_includes/demo-banner.html`) so a visitor is
  not redirected on the way in.
- **The submission form learned to have no repository.** The plan said non-flagship examples build
  with `github.repository` blank; what that exposed was `action="https://github.com//issues/new"` —
  a dead button. `submit/index.md`, `assets/js/submit.js` and `assets/js/submit/review.js` now
  degrade honestly when there is no repository: the questions, the card preview, the copy-out
  buttons and the email fallback all still work, and the page says where the answers cannot go.
  This is shipped template behaviour, not showcase-only — a fork that has not filled in
  `github.repository` yet lands in exactly the same state.
- **The switcher's jsdom test is `test/scripts/example_switcher.test.mjs`**, not `test/js/…` —
  matching where the repository's other jsdom tests already live.
- **`resource-library` keeps `modules.resources: false`.** Its entries *are* the resources, in the
  catalog module; the resources module is a separate curated list and would have said the same
  thing twice.
- **The example screenshots ship as plain PNGs.** `npm run images` writes `_data/derivatives.json`
  keyed on this repository's own entry paths, which are not the paths inside an example build;
  running it for `_showcase/**` would have changed what that manifest means for every fork.
  `_includes/picture.html` falls back to a plain `<img>`, which is what the landing renders.
- **`npm run eject:samples` also removes `assets/images/showcase/`**, alongside `_showcase/` and
  `_data/showcase.yml` — the screenshots are the landing's, and nothing else reads them.
- **The a11y gate builds one example, not four.** `quality.yml` builds the landing plus
  `cohort-portal` into `$RUNNER_TEMP` and audits the landing, that example's home page, one entry
  and the switcher's open state. `quality/urls.js` discovers those URLs from the built tree, so no
  preset id is written down in the gate.
