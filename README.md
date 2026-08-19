# Civic Catalog Template

A configurable, GitHub-Pages-hosted catalog and resource site, managed entirely through GitHub. There is no server, no database and no CMS login — Jekyll builds the site on GitHub Actions and deploys it to Pages, and every content change flows through a GitHub issue and a pull request.

This repository is shipped configured as the **Big Cities Health Coalition (BCHC) AI Use Case Catalog**, where member health departments share AI use cases — source repos, cloud deployments, vendor solutions, write-ups. The same template can be re-pointed at other uses without touching layout code: a project/asset portal, a cohort or training-program portal where teams publish outputs, an event calendar, or a curated resource library. See [`docs/configuration.md`](docs/configuration.md) for how to retarget it.

**Live demo:** [crypticpy.github.io/bchc-template](https://crypticpy.github.io/bchc-template/) — a landing page introducing the template, with four complete sites built from this same repository behind it. Each is a real build with its own fields, filters, colours and sample content, search and submission form included:

- [AI use case catalog](https://crypticpy.github.io/bchc-template/examples/ai-use-cases/) — the configuration this repository ships with.
- [Cohort portal](https://crypticpy.github.io/bchc-template/examples/cohort-portal/) — a training program's teams, cohort by cohort, with the events and cohorts modules on.
- [Resource library](https://crypticpy.github.io/bchc-template/examples/resource-library/) — shorter entries and more of them: guides, toolkits and datasets.
- [Blank catalog](https://crypticpy.github.io/bchc-template/examples/blank/) — the smallest useful starting point, ready to be renamed.

**See what a fresh copy looks like on day one:** [crypticpy.github.io/bchc-catalog-starter](https://crypticpy.github.io/bchc-catalog-starter/) — a copy made from this template by following [`docs/launch.md`](docs/launch.md), configured through the setup wizard, samples removed, one entry published.

<p align="center">
  <img src="docs/images/home.png" alt="Home page: dark hero with search, calls to action, an honest stat line and the newest entries listed alongside; a browse-by grid of the schema's facets underneath." width="720">
</p>

| Catalog | Entry |
| --- | --- |
| ![Catalog page: filter rail on the left with counted pills, results header with search, sort and view toggle, and cards carrying an image, a result line, taxonomy chips and a signal strip.](docs/images/catalog.png) | ![Entry page: breadcrumbs, organization and stage eyebrow, title, result line, summary, dates, a documentation button, a four-column fact strip and a screenshot gallery.](docs/images/entry.png) |

## Features

- **GitHub-as-CMS.** Anyone can propose an entry through a web form or a GitHub issue. Automation turns the issue into a pull request with the entry already drafted — screenshots downloaded into the entry folder and all — and a maintainer reviews and merges it.
- **Schema-driven content model.** One file, [`_data/schema.yml`](_data/schema.yml), defines every field an entry has, *and* how it is presented: which fields reach a catalog card and in which slot, which become filters, which appear in the sidebar, what each option's short label, icon and tone are. The submission form, the issue template, the cards, the filter rail, the search index, the wizard defaults and the validator all derive from it. See [`docs/content-model.md`](docs/content-model.md).
- **Search that reads the whole write-up.** Every entry is indexed per section, so a suggestion names the section it matched in, shows the sentence around the term and links straight to that heading; related entries are chosen by how distinctive a shared value is. An Atom feed of the newest entries lives at `/catalog/feed.xml`.
- **Built for evaluation, not browsing.** Cards are laid out to answer "could my team reuse this?" in about two seconds: a result line, a taxonomy chip family, and a signal strip for skills needed, data sensitivity, audience and readiness. Filters sit beside the results, restore from the URL, and announce their counts.
- **Compare and print a decision.** Shortlist up to three entries from the catalog and read them field by field at `/compare/`, with the rows they agree on folded away and the shortlist in the URL so it pastes into an email. One button prints the comparison — or any entry page — as a clean brief with the links spelled out and a source stamp. See [`docs/compare.md`](docs/compare.md).
- **Screenshots and links as first-class fields.** An `images` field gives an entry a gallery with a keyboard-navigable lightbox and honest alt text; a `links` field carries labelled resources — a shared drive folder, a recorded demo, a vendor page — without needing a field per link.
- **Two configurators.** A no-terminal setup wizard at `/setup/` on the deployed site, and an equivalent CLI wizard (`npm run setup`). Both offer starting presets (AI use case catalog, cohort/program portal, resource library, blank) and write the same configuration files from the same shared logic.
- **Governance on the site, not in a PDF.** A `governance` module publishes how review works (tiers, targets, criteria), who does what, and the standing policies — privacy, licensing, data governance, accessibility, maintenance, appeals, conduct — from one data file, [`_data/governance.yml`](_data/governance.yml). Deprecated entries are kept for the record rather than deleted, a contributor guide walks submitters through review from their side, and a `CODE_OF_CONDUCT.md` covers everyone. A monthly workflow counts submissions, publications, contributing organizations and review turnaround from the repository's own issues and pull requests into `_data/metrics.json`, and the page shows them as "How the catalog is doing" — no analytics vendor involved.
- **Modules.** Turn catalog, submit, carousel, stats, events, cohorts, resources and governance on or off independently; navigation and the home page adapt automatically, and pages under a disabled module are dropped from the build.
- **Theming.** Colors, fonts and corner rounding live in [`_data/theme.yml`](_data/theme.yml) and become CSS variables consumed by Tailwind — no CSS editing required for a rebrand. Every colour has one semantic job, so a re-skin cannot quietly break contrast.
- **Accessibility as a build rule, not a pass.** Nothing is signalled by colour or icon alone, every control has a visible focus ring and a ≥3:1 border, filter changes are announced once, and the whole catalog still works with JavaScript disabled.
- **CI content pipeline.** Front-matter and file-size validation on every pull request, automatic thumbnail generation from uploaded PDFs, and workflows that scaffold cohort years, events and schedule updates from issues.

## Quick start

1. **Use this template** on GitHub (or clone it) to create your own repository.
2. **Turn on the three settings**: Pages source (Settings → Pages → Source → **GitHub Actions**), pull requests for Actions (Settings → Actions → General → Workflow permissions → **Allow GitHub Actions to create and approve pull requests**), and the content labels (Actions tab → **Bootstrap labels** → *Run workflow*).
3. **Configure the site** — open `/setup/` on the deployed site for the browser wizard (no terminal), or run `npm install && npm run setup` locally. Both write `_data/site.yml`, `_data/theme.yml`, `_data/schema.yml`, `_data/navigation.yml`, `_config.yml` and `.github/ISSUE_TEMPLATE/new-entry.yml`, from the same four presets. With no terminal, paste the wizard's three `_data/*.yml` files into the **Apply setup** issue form and the automation opens the pull request for you.
4. **Clear the demo content** — ten fictional organizations, a sample events calendar, a sample cohort. Until they are gone every page carries a *Demo content* banner saying so. `npm run eject:samples` removes it all, turns the banner off and switches the `governance` module off until you have rewritten `_data/governance.yml` in your own words; the Apply setup issue has a checkbox that does the same thing.
5. **Commit and push.** `Build & Deploy` publishes to `https://<owner>.github.io/<repo>/`, working out `url`/`baseurl` on its own (root domain for a `<owner>.github.io` repo or a `CNAME` file, `/<repo>` otherwise); an explicit `url` in `_config.yml` always wins.

Each of those steps has a detail you will want on the day: **[`docs/launch.md`](docs/launch.md)** is the full tutorial — the same path with what breaks if you skip a step, a first test submission end to end, and the pre-launch checklist.

## How content gets in

1. A contributor fills out the **Submit** form (`/submit/`) — one page, with a live preview of the card their entry will produce — or opens the **Submit a use case** GitHub issue form directly.
2. The form data becomes a GitHub issue labelled `content:new-entry`. Screenshots are dragged onto the issue at this point.
3. The `New entry from issue` workflow runs `scripts/new_entry_from_issue.mjs`, which reads `_data/schema.yml`, downloads any attached images into `catalog/<slug>/screenshots/` (up to 8 files, 15 MB total, PNG/JPEG/GIF/WebP), and opens a pull request containing `catalog/<slug>/index.md`. The pull request body carries the maintainer checklist — the review criteria from `_data/governance.yml`, the mechanics, the review-status flip — and, when an answer matches a field's `escalate_on` list in the schema (an unticked PII/PHI attestation, PHI under *Data it touches*, a public-facing audience), a **Closer review** block and the `review:data-governance` label.
4. Larger attachments — a `deck.pdf` — are added to the entry folder directly in that pull request. Any `file` field flagged `thumbnail: true` gets a `thumb.jpg` rendered from its first page automatically by the `Generate entry thumbnails` workflow.
5. A maintainer reviews the entry against the checklist in [`docs/admin-guide.md`](docs/admin-guide.md) — plain language, no protected data on screen, alt text present, links that open for outsiders — and merges. The site rebuilds and the entry is live within a couple of minutes.
6. Existing entries can also be edited directly on GitHub — every entry page has a **Suggest an edit on GitHub** link. When an edit lands on `main`, the deploy stamps the entry's `updated:` date itself.

### What an entry holds

The shipped AI use case schema has 40 fields in eight groups. In outline:

| Group | Fields |
|---|---|
| About | title, one-sentence summary, result in one line, organization, what is being shared, use case category, area of work, stage, review status (maintainer-only) |
| How it's built | how AI is involved, types of AI, AI tools & models, where it runs, vendor or partner |
| Reuse | skills needed to set it up, readiness, source code, live demo, documentation, other resources, screenshots, slide deck |
| Sharing & licensing | license, access terms, portability, portability notes |
| What it took | cost band, running cost, procurement, approvals, equity note |
| Data & access | no-PII/PHI attestation, data it touches, data sources, who sees the output, data governance notes |
| Contact | contact name, contact title, contact email |
| The story | the full write-up, which becomes the page body |

Every one of those is a line in `_data/schema.yml` and none of them is named anywhere else — rename, remove or replace the lot for a different subject and the forms, filters, cards and validator follow. [`docs/content-model.md`](docs/content-model.md) documents each property, the `images` and `links` shapes, and how to design a taxonomy that people actually filter by.

Cohorts and events follow the same issue → automation → pull request pattern (`content:new-year`, `content:schedule`, `content:event-attachments`, and the plain **Add event details** issue). See [`docs/admin-guide.md`](docs/admin-guide.md) for the maintainer side of all of this.

## Configuration overview

- **Branding, contact info, module toggles, home page copy** — `_data/site.yml`
- **Colors, fonts, corner rounding** — `_data/theme.yml`
- **Header navigation** — `_data/navigation.yml` (regenerated by the wizards from your modules, but hand-editable)
- **The entry content model** — `_data/schema.yml` (see [`docs/content-model.md`](docs/content-model.md))
- **Events, cohort years, resource library** — `_data/events.yml`, `_data/cohorts/<year>.yml`, `_data/resources.yml`
- **Search synonyms, tag aliases, facet landing pages** — `_data/search.yml` (see [`docs/search.md`](docs/search.md))

Full reference for every setting: [`docs/configuration.md`](docs/configuration.md). Every other document, and who each one is for: [`docs/index.md`](docs/index.md).

## Staying up to date

A fork is a copy, not a subscription: template releases do not reach you on their own. `.gitattributes` marks everything a fork owns — `_config.yml`, `_data/*.yml`, your content, your images, your README — as `merge=ours`, so a template merge updates the code and leaves your site alone.

```bash
git remote add template https://github.com/crypticpy/bchc-template.git
git config merge.ours.driver true    # required — without it .gitattributes is inert
git fetch template --tags
npm run upgrade:check                # read-only: what the next release would change, in two lists
```

The whole recipe, including what a merge cannot adopt for you: [`docs/upgrading.md`](docs/upgrading.md).

## Local development

Requires Ruby 3.3 (see `.ruby-version`) and Node 22+.

```bash
bundle install
npm install

npm run dev       # http://127.0.0.1:4000/ with live reload — Tailwind watcher + jekyll serve in one terminal,
                  # regenerating the schema-derived files whenever _data/schema.yml or _data/site.yml changes
npm run build     # generate schema-derived files, build CSS, build the Jekyll site into _site/
```

`npm run dev -- --port 4001 --host 0.0.0.0` changes where it listens; output is prefixed `[css]`, `[jekyll]` and `[gen]`, and Ctrl-C stops everything. `npm run serve` and `npm run watch:css` still exist if you want the pieces separately.

Other useful scripts:

```bash
npm run setup      # configuration wizard (see Quick start)
npm run generate   # regenerate the issue template + configurator defaults, and sync _config.yml from _data/site.yml
npm run validate   # parse all _data/*.yml and run the front-matter / file-size checks CI runs on pull requests
npm test           # Node unit tests; `npm run test:ruby` for the Ruby validators
npm run test:build # build every preset and module combination and check the rendered copy (needs Ruby; minutes, not seconds)
npm run a11y       # pa11y-ci (WCAG 2 AA) against _site served on :4173 — see CONTRIBUTING.md
npm run lighthouse # Lighthouse CI against the same local server
```

Contributing to the template itself? Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Repository layout

```
_config.yml              Jekyll build mechanics (title/description fall back to _data/site.yml)
_data/                   site.yml, theme.yml, schema.yml, navigation.yml, governance.yml, events.yml, resources.yml, cohorts/<year>.yml,
                         metrics.json (written monthly by the Catalog metrics workflow)
_layouts/, _includes/    schema-driven templates (entry cards, filters, field rendering, etc.)
_plugins/                schema_filters.rb (card/weight/group/option_meta rules), theme_filters.rb, search_index.rb (/search.json), events.rb, modules.rb,
                         showcase.rb (only active in a showcase build)
assets/js/configurator/  shared logic behind both configurators (core.js, presets/, setup-page.js + steps/ + wizard/)
assets/js/submit.js      turns the /submit/ form into a pre-filled GitHub issue URL
scripts/                 setup.mjs, generate.mjs, validate.mjs, build_showcase.mjs, and the issue-to-PR automation scripts
.github/workflows/       pages, validate, quality (a11y + Lighthouse), smoke, new-entry, thumbnails, new-year, new-event, update-schedule, update-event-attachments,
                         verification-sweep, metrics
.github/ISSUE_TEMPLATE/  new-entry.yml is generated — do not hand-edit it, run `npm run generate`
_showcase/<id>/          sample content for the live examples on the template's own deployment; _data/showcase.yml is the
                         landing page's copy. Both are removed by `npm run eject:samples` (docs/showcase-plan.md)
catalog/<slug>/index.md  published entries; screenshots live in catalog/<slug>/screenshots/
                         (ten sample entries ship with the template, marked `sample: true`)
cohorts/<year>/          cohort landing page + event pages (module: cohorts)
governance/              /governance/ — review process, roles and policies from _data/governance.yml (module: governance)
styleguide/              /styleguide/ — live rendering of the design system against your theme (noindex)
docs/                    index.md (start here), launch.md, admin-guide.md, contributor-guide.md, incidents.md,
                         configuration.md, content-model.md, search.md, images.md, upgrading.md, decisions.md,
                         glossary.md, design-brief.md, design-system.md, roadmap.md
quality/                 pa11y-ci and Lighthouse CI config, plus urls.js (shared URL discovery for both)
test/                    configurator/, plugins/, scripts/ and fixtures/ — Node's test runner + Ruby minitest
ARCHITECTURE.md          how the pieces fit; CONTRIBUTING.md — working on the template itself; SECURITY.md;
CODE_OF_CONDUCT.md       how contributors and reviewers engage (linked from the governance page)
```

## License

MIT — see [`LICENSE`](LICENSE).
