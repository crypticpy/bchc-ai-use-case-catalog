# Content model reference

`_data/schema.yml` is the single source of truth for what an entry is. Everything downstream reads it at build time or generation time — no field key is hardcoded anywhere else:

- Catalog cards and the entry page — `_includes/entry-card.html`, `_includes/entry-row.html`, `_layouts/entry.html`, `_includes/field-value.html`, `_includes/entry-thumb.html`
- Filters and search — `_includes/filter-rail.html`, `_includes/filter-groups.html`, `_includes/filter-sheet.html`, `_plugins/search_index.rb` (`/search.json`)
- The presentation rules themselves — `_plugins/schema_filters.rb`, the Liquid filters that resolve `card`, `weight`, `group`, `option_meta` in one place
- The public `/submit/` form — `submit/index.md`, `assets/js/submit.js`
- The GitHub issue form — `.github/ISSUE_TEMPLATE/new-entry.yml` (generated; do not hand-edit)
- The issue → pull request scaffolder — `scripts/new_entry_from_issue.mjs`
- Front-matter validation in CI — `scripts/check_front_matter.rb`
- Both configurators — `assets/js/configurator/defaults.generated.js` (generated from `_data/*.yml`)

Change a field, run `npm run generate`, and the submission form, issue template, wizard defaults and validator all follow.

## Top-level structure

```yaml
entry:
  singular: "Use case"     # how one entry is referred to in the UI
  plural: "Use cases"
  path: "catalog"          # folder + URL base for entries — keep as "catalog" unless you know why
  sort: "published"        # default catalog ordering key
  sort_order: "desc"       # asc | desc
  status_key: review_status          # optional — the select field that carries review status
  deprecated_value: "Deprecated"     # optional — which option of it means "kept for the record"
  status_scaffold_value: "Under review"  # optional — what the scaffolder stamps on a new entry
  status_approved_value: "Reviewed & approved"  # optional — what approval means; the PR checklist asks for it
  require_link: true       # optional — an entry with no link anywhere fails validation instead of warning
  contributor_key: organization  # optional — the field the monthly metrics count distinct "contributing organizations" from

groups:                    # ordered; group filters and submit-form sections
  - key: about
    title: "About"
    description: "What it is, who built it, and what it changed."
  - key: contact
    title: "Contact"
    description: "Someone others can reach out to."
    placement: rail        # main (default) | rail — see below

fields:
  - key: …
```

`entry.path` is also read by `_plugins/modules.rb` (to know which pages belong to the `catalog` module) and by every script that scaffolds or reads entries.

The three `status_*` keys are optional pointers, in the same spirit as `verified`: they name a field rather than hardcoding one, so a schema without a review status simply leaves them out and nothing downstream looks for it. See [Review status and deprecation](#review-status-and-deprecation).

### Groups

A group is `{key, title, description?, icon?, placement?}`. `key` is what a field's `group` points at; `title` heads the filter block, the submit-form step and the entry-page section.

| Property | Meaning |
|---|---|
| `key` | `snake_case`, unique. Fields with no `group` fall into `other` ("More"). |
| `title` | Required. Heading shown in filters, the submit form and on the entry page. |
| `description` | Optional one-liner under the heading in the submit form. |
| `icon` | Optional icon name from `_includes/icon.html`, shown beside a rail card's heading. |
| `placement` | `main` (default) or `rail`. **Entry page only** — a `rail` group becomes a sidebar card instead of a body section. Everywhere else (filters, submit form, issue template) placement is ignored. |

`placement: rail` is for the short, act-on-it groups: the links someone follows to reuse the thing, and the person they email. The rail is 280px and sticky, so a group whose fields hold sentences belongs in `main`. Inside a rail card the entry page renders, in order: a person block when the group has an `email` field with a value (the first `text` field of the same group is the name, any further `text` fields with a value — a title, a role — become muted lines under it), each `links` field as a compact icon + label + host list, then everything else as a label/value list. `url` fields are skipped — they are already the primary buttons in the page header — as are fields the header, fact strip or gallery has shown. A rail group whose fields are all empty or already shown renders nothing at all.

## Reserved keys

`title`, `slug`, `summary`, `published`, `render_with_liquid`, `thumbnail` and `featured` are present on every entry whether or not you list them under `fields`, plus the optional dates `updated` and `verified`.

| Key | Set by | Notes |
|---|---|---|
| `title`, `summary` | Submitter | Declare them as fields too, so they appear in the forms. Always indexed for search. |
| `slug` | Automation | Must equal the entry's folder name — CI fails otherwise. |
| `published` | Automation | `YYYY-MM-DD`. The default sort key. |
| `render_with_liquid` | Automation | Always `false`, and CI fails an entry without it: the body is a submitter's markdown and must not be run through Liquid at build time. |
| `updated` | Automation, or maintainer | Optional `YYYY-MM-DD`. When present, the entry page shows "Updated …" alongside the published date, and "Recently updated" sorting uses it. The deploy stamps it when a push to `main` modifies the entry file (`scripts/stamp_updated.mjs` — modified files only, never sample content, never backwards; see [admin-guide.md](admin-guide.md#editing-or-removing-an-existing-entry)); set it by hand when you want a different day. |
| `verified` | Maintainer | Optional `YYYY-MM-DD`. The day someone confirmed with the contact that the entry is still true. Stronger than `updated`, which only says the text changed. The scaffolder never sets it — a maintainer does, in review or when clearing an item from the [monthly sweep](admin-guide.md#the-monthly-verification-sweep). |
| `featured` | Maintainer | `true` pins the entry into the home carousel and shows a Featured badge. Maintainer-only; there is no submitter path to it. |
| `thumbnail` | Maintainer | Optional image path. First choice for the card image, ahead of any `images` field. |

Sample entries shipped with the template also carry `sample: true`, which is how `npm run setup` recognises removable demo content. Your own entries should not have it.

### How old is too old

An entry is "last confirmed" on the **newest** of `verified`, `updated` and `published` — three progressively weaker answers to the same question, and the newest one is the honest one. Past `catalog.verify_after_days` in `_data/site.yml` (default 365) the entry page shows a quiet note near the fact strip, cards carry a one-line "Last confirmed …", and the default catalog order puts the entry after fresher ones. Nothing is hidden and nothing turns amber: an unconfirmed entry is still the best account of that project anyone has written down.

Because the newest date wins, a fresh catalog shows no notices at all, and a maintainer clears one by setting `verified:` — not by touching `updated:`, which would claim an edit that did not happen.

### Review status and deprecation

A catalog with a review process needs two things the dates cannot say: *where an entry is in that process*, and *whether it is still a live recommendation*. Both hang off one ordinary `select` field that the schema points at with `entry.status_key` — in the shipped schema, `review_status`, with the options **Under review · Reviewed & approved · Revisions requested · Deprecated**. It is `form: false` (maintainer-only, never asked in the forms), `facet: true` (a reader can filter by it), and `option_meta` gives each option a tone so the badge reads at a glance.

Three pointers make it schema-driven rather than a special case:

| Key | Meaning |
|---|---|
| `entry.status_key` | The field's key. Absent → nothing below happens. |
| `entry.deprecated_value` | The option that means "kept for the record". An entry carrying it is **deprecated**: it stays published, its page opens with a warning-toned notice ("kept for the record — the tool, its costs or its contact may no longer be current"), its card and list row carry the same one-liner, the home page leaves it out of Featured and Latest, the catalog lists it after every live entry, and the default sort demotes it below stale entries. It is never hidden, never deleted: the record is the point. |
| `entry.status_scaffold_value` | What `scripts/new_entry_from_issue.mjs` stamps on a freshly scaffolded entry, so a submission opens as **Under review** without anyone typing it. A maintainer sets the final value in the PR. |
| `entry.status_approved_value` | The option that means the review passed. The scaffolded pull request's checklist ends with "`review_status` set to **Reviewed & approved** (the scaffold wrote *Under review*) — or the pull request left open with `review:revisions-requested`", so the flip is on the list the reviewer ticks rather than in their memory. Absent → the checklist has no status line. |
| `entry.require_link` | The minimum documentation bar. `check_front_matter.rb` already notices an entry with no link anywhere — every `url`-typed field empty and no `links` item — because a reader would have nowhere to go to evaluate or adopt it. By default that is a warning; `require_link: true` makes it a failure, so such an entry cannot merge. Silent for a schema with no `url` or `links` fields at all. |
| `entry.contributor_key` | The field whose distinct values `scripts/metrics.mjs` counts as **contributing organizations** in `_data/metrics.json` — the figure card and per-quarter column on the governance page's "How the catalog is doing" block. Live entries only, `sample: true` content excluded, values trimmed and blanks skipped. Absent → the figure, its card and its column are not published; everything else in the block still is. |

The Liquid filters behind this are `deprecated_entry`, `live_entries` and `deprecated_entries` in `_plugins/schema_filters.rb`; every template goes through them rather than comparing strings. Deprecation supersedes staleness: a deprecated entry never also shows the "last confirmed" note, because "may no longer be current" already covers it. See [admin-guide.md](admin-guide.md#editing-or-removing-an-existing-entry) for when to deprecate versus delete.

## Field spec

Each item under `fields` is a hash:

| Property | Meaning |
|---|---|
| `key` | Front-matter key. `snake_case`, unique, required. |
| `label` | Short human label used on cards, filters and the entry page. Required, unique. Keep it short — it has to fit a filter header. |
| `prompt` | The question form of the label — what you would ask out loud ("What kind of data does it touch?"). Optional; falls back to `label`. The web form shows the prompt as the visible question; the issue template keeps `label` as the heading (the scaffolder finds answers by it) and puts the prompt at the front of the help text. |
| `type` | See [field types](#field-types). |
| `required` | `true`/`false` (default `false`). Enforced in both forms and by `check_front_matter.rb`. |
| `description` | Help the prompt does not already give: a constraint, an example, a boundary, a consequence. **Both forms print it immediately after the prompt, so it must not restate it** — write it as a continuation, not a second attempt at the question. `npm run validate` warns when four or more consecutive words of the prompt reappear here. |
| `error` | Optional message shown when a required answer is missing, overriding the generated default. Write it as verb + the thing ("Select at least one area of work"), not "this field is required". |
| `placeholder` | Example text shown in forms. |
| `options` | Allowed values — `select` and `multiselect` only. A plain list of strings. |
| `option_meta` | Per-option presentation. See [option metadata](#option-metadata). |
| `facet` | `true` → the field appears in the filter panel. `select` becomes a single-choice filter; everything else is any-of. Facet fields are always in the search index. |
| `card` | Whether and how the field shows on a catalog card. See [card slots](#card-slots). |
| `weight` | `1`–`9`, default `5`. One number, four jobs: the order the question is asked in inside its form section, the order within a card slot, the entry fact strip, a filter group and a sidebar section — and the truncation order when a slot is full (lower weight survives). Reordering questions therefore also reorders the card, so check the [card slots](#card-slots) before you renumber. |
| `icon` | Icon name from `_includes/icon.html`. Used for the filter group header, the fact strip, `card: line`, and as the fallback for `card: icon`. |
| `group` | A key from the top-level `groups` list. Drives filter grouping and the sections of the submit form. Fields with no group fall into "More". |
| `search` | `true` → the value is included in `/search.json`. `title` and `summary` and every facet field are indexed regardless. |
| `form` | `false` → hidden from both submission forms. For maintainer-only fields. |
| `filename` | `file` fields only. The expected filename in the entry folder, e.g. `deck.pdf`. |
| `thumbnail` | `file` fields only. `true` → CI renders `thumb.jpg` from the PDF's first page. |
| `links_entries` | `list` fields only. `true` → the values are slugs of other entries in this catalog. Each renders on the entry page as a chip linking to that entry, labelled with its title, and the entry named gets an **Adopted by** card in its rail listing the live entries that name it (deprecated adopters do not count, and the card is absent at zero). A slug that matches no entry renders as plain text rather than a dead link — and `npm run validate` fails it, naming the field, the value and the entry, so the typo does not sit there silently. There is no relation type: the hint is the whole vocabulary. |
| `escalate_on` | The answers that call for closer review, as an explicit list: for a `boolean`, `[false]` (or `[true]`); for a `select`/`multiselect`, option strings. When a scaffolded submission's answer matches, the pull request opens with a **Closer review** block naming the field and the answer, and the workflow adds the `review:data-governance` label. A boolean's missing answer counts as `false` — an attestation that was not ticked is not one that passed. `npm run validate` rejects a list that names an option the field does not have. Nothing else reads it: escalation is a review-time signal, not a display rule. |

### Field types

| Type | Front-matter value | Notes |
|---|---|---|
| `text` | string | Single line. |
| `textarea` | string | Multi-line plain text. |
| `markdown` | — | Becomes the page **body**, not a front-matter key. Only one field may be `markdown`. |
| `url` | string | Must start with `http://` or `https://`. Rendered as a link with a host label. |
| `email` | string | Must contain `@`. Rendered as a `mailto:` link. |
| `select` | string | One value from `options`. |
| `multiselect` | list of strings | Any number of values from `options`. Rendered as a multi-select dropdown on GitHub, so the answers survive the hand-off from `/submit/` and `required` is enforceable; GitHub's dropdown carries only the option labels, so the per-option `option_meta.description` shows on this site's own form and catalog but not there. |
| `list` | list of strings | Free-form: one per line in the issue form, comma-separated in the web form. With [`links_entries: true`](#field-spec) the strings are entry slugs and render as links to those entries. |
| `date` | `YYYY-MM-DD` | Rendered as "March 9, 2026". |
| `number` | number | No range validation. |
| `boolean` | `true`/`false` | Rendered as Yes/No. |
| `file` | string (path) | One attachment, uploaded on the form; front matter stores `/<entry.path>/<slug>/<filename>`. |
| `image` | string (path or URL) | One image, uploaded on the form. When the key is `thumbnail`, it is the card image. |
| `images` | list — see below | A gallery. |
| `links` | list of `{label, url}` — see below | Labelled links. |

#### Attachments (`file` and `image`)

A `file` or `image` field is a GitHub **`upload`** control on the issue form, so the deck or the photo arrives with the submission rather than waiting for a maintainer to add it afterwards:

- `validations.accept` comes from the schema — the extension of `filename` for a `file` (shipped: `deck.pdf` → `.pdf`), and `.png,.jpg,.jpeg,.gif,.webp` for an `image`.
- The scaffolder downloads the attachment into the entry folder under exactly that `filename`, through the same guards as screenshots: public hosts only (every redirect re-checked), a 25 MB streaming cap, and a magic-byte check — a `.pdf` that does not start with `%PDF` is refused and reported on the pull request instead of being committed.
- Nothing attached is not an error. A `file` field still records the path the schema expects, so a maintainer can drop the file into the folder later exactly as before.
- **`validations.required` on an upload is enforced on public repositories only.** On a private fork a required attachment is a prompt, not a gate.
- A gallery stays a `textarea`: `upload` holds one file and has nowhere to put per-image alt text, so `images` keeps the drag-into-the-box control that preserves `URL | alt text`.

### `images`

Each item is either a bare string (the `src`) or a mapping with `src` and `alt`. Always write the mapping form — alt text is what makes the gallery usable.

```yaml
screenshots:
  - src: /catalog/epi-signal-triage/screenshots/01.png
    alt: "Triage queue listing seven ranked signals with area, signal strength and status."
  - src: /catalog/epi-signal-triage/screenshots/02.png
    alt: "Draft triage note beside a bar chart of daily visit counts, marked as awaiting review."
```

- **Where the files live**: inside the entry's own folder, conventionally `catalog/<slug>/screenshots/`. The scaffolder writes them as `01.png`, `02.jpg`, … in the order the submitter attached them.
- **What `src` looks like**: a site-absolute path starting with `/` (this is what the automation writes, and what the templates resolve through `relative_url`, so it survives a project-page `baseurl`). A path relative to the entry folder (`screenshots/01.png`) also validates, and an `http(s)` URL is accepted but warned about — a remote image breaks when someone else's host changes.
- **What renders**: the entry page shows a thumbnail grid that opens a keyboard-navigable lightbox, captioned from `alt`. The first image is also the card image when the entry has no explicit `thumbnail`. An entry with no images gets a text-first card, not a placeholder graphic.
- **How the card crops it**: `thumbnail_focus` on the entry is a CSS `object-position` (default `center top`); the default shows the top of the image, which is where a deck or a dashboard puts its title.
- **Alt text**: describe what the picture shows, in one sentence under about 125 characters. "Screenshot of the tool" is not alt text. Do not repeat the entry title.
- **Validation**: every item needs a non-blank `src`; a local `src` must exist on disk inside the entry folder; missing `alt` is a warning, not a failure.

### `links`

A list of `{label, url}` mappings. Both keys are required.

```yaml
resources:
  - label: "Evaluation notebook (PDF)"
    url: "https://docs.example.gov/lakeshore/signal-triage-evaluation.pdf"
  - label: "Walkthrough video (8 minutes)"
    url: "https://videos.example.org/share/spike-brief-walkthrough"
```

Use it for anything that does not deserve its own `url` field — shared drives, model cards, container images, vendor pages, recorded demos. The forms accept one per line as `Label | URL`; the scaffolder also tolerates `Label — URL`, `Label: URL`, and a bare URL (which gets the host as its label). Rendered on the entry page as a labelled row with a host chip (in the rail when its group has `placement: rail`). `mailto:` is allowed; everything else must be `http(s)`.

## Option metadata

`options` stays a plain list of strings. `option_meta` adds presentation for any of them:

```yaml
data_sensitivity:
  type: multiselect
  options:
    - "Public data only"
    - "Health information (PHI)"
  option_meta:
    "Public data only": { short: "Public data", icon: globe, description: "Only data that is already public." }
    "Health information (PHI)": { short: "PHI", icon: shield, tone: warn, description: "Identifiable health information covered by HIPAA." }
```

| Key | Meaning |
|---|---|
| `short` | Up to 14 characters. Replaces the full value on badges, chips, filters and the fact strip. The full value stays available as a tooltip and to screen readers. |
| `icon` | Icon name from `_includes/icon.html`. Defaults to the field's `icon`. |
| `tone` | `neutral` (default) \| `primary` \| `secondary` \| `accent` \| `warn`. **`warn` means caution** — sensitive data, a licence cost, something a reader must not miss. Do not use it for emphasis; if everything is a warning, nothing is. |
| `description` | One line defining the option. Shown under the option in the submission forms, and on the catalog as a "What do these mean?" disclosure under each facet group and under the fact strip. This is where plain language belongs. |

Every option is usable without metadata — an option with no entry renders as its own text, with the field's icon and a neutral tone.

## Card slots

`card` decides whether a field reaches the catalog card, and which slot it lands in.

| `card` value | Where it renders |
|---|---|
| `false` or omitted | Not on the card. |
| `true` | The type default: `select` → badge, `text` → meta, `list`/`multiselect` → chip. |
| `badge` | A pill over the image (or inline in the meta line when the entry has no image). |
| `meta` | A small line above the title, segments joined with `·`. |
| `line` | One short line under the summary, prefixed by the field's icon. Meant for a result or impact statement. |
| `chip` | Chips in the card footer. |
| `icon` | The at-a-glance signal strip: one glyph per value, each with a screen-reader label of `<label>: <value>`. |
| `fact` | **The entry page's fact strip only — never the card.** For a fact that decides a reuse question but cannot survive a 288px card. |

Slot caps are enforced by the templates, not by the schema: **one** badge field, **two** meta segments, **one** chip family (2 chips then `+n`), **four** icon glyphs total. When a slot overflows, lower `weight` survives. This is why weight matters more than it looks: it is the only control you have over what a reader sees in the two seconds they spend on a card.

`fact` exists because that budget is real. The signal strip stops at four glyphs, so a fifth `card: icon` field does not appear — it silently pushes an existing one behind a `+n` on every card in the catalog. A fact that only pays off in a governance conversation (what it cost, which reviews it went through) is worth a row on the page and is not worth that trade, so `fact` puts it in the fact strip and nowhere else. Fact-strip order is `icon` fields, then `fact` fields, then any `meta` field the page header did not already use, each by `weight`.

Deliberately not on the card: platform, tools, vendor, data sources, contact, links and the gallery. They belong to the entry page.

## Search and facets

- **`search: true`** adds the field's text to `/search.json`. `title`, `summary` and every facet field are always indexed, so set `search` only for free-text fields worth matching on — tool names, vendors, data sources.
- The **body** of every entry is indexed too, split per heading, so a suggestion can say which section matched and deep-link to it. A top-level `search.body_chars: <n>` in the schema caps how much of each section is indexed (`0` or unset = unlimited); the shipped catalog leaves it unlimited because "Lessons learned" and "How to reuse" are exactly what a reuse catalog is searched for.
- **Related entries** are scored from the facet fields two entries share, weighted by how rare the shared value is (a value every entry carries counts for nothing) and by the field's `weight` — a lower-weight (more important) field contributes more, the same direction as the card slots.
- **`facet: true`** puts the field in the filter rail, grouped by `group` and ordered by `weight`. Filters work best on fields with a bounded set of values: `select` and `multiselect` from `options`, or a `list` whose values repeat across entries. A facet over free text produces a filter with one option per entry, which helps nobody.

## Shipped fields (AI use case catalog)

41 fields in eight groups, listed in group order and then by weight — the order the submit wizard asks them in. `body` is the page body; everything else is front matter. `review_status` is maintainer-only (`form: false`).

| Key | Type | Group | Req | Facet | Card | Weight |
|---|---|---|:--:|:--:|---|:--:|
| `title` | text | about | yes | | (heading) | 1 |
| `solution_type` | select | about | yes | yes | badge | 3 |
| `use_case_category` | select | about | yes | yes | fact | 4 |
| `area` | multiselect | about | yes | yes | chip | 5 |
| `stage` | select | about | yes | yes | meta | 6 |
| `summary` | textarea | about | yes | | (summary) | 7 |
| `impact` | text | about | | | line | 8 |
| `organization` | text | about | yes | yes | meta | 9 |
| `review_status` | select | about | | yes | | 9 |
| `ai_role` | select | build | yes | yes | | 1 |
| `ai_types` | multiselect | build | | yes | | 2 |
| `ai_tools` | list | build | | yes | | 3 |
| `platform` | multiselect | build | | yes | | 4 |
| `vendor` | text | build | | | | 5 |
| `expertise` | select | reuse | yes | yes | icon | 1 |
| `readiness` | multiselect | reuse | | yes | icon | 2 |
| `repo_url` | url | reuse | | | | 3 |
| `demo_url` | url | reuse | | | | 4 |
| `docs_url` | url | reuse | | | | 5 |
| `resources` | links | reuse | | | | 6 |
| `screenshots` | images | reuse | | | (card image) | 7 |
| `deck_pdf` | file (`deck.pdf`) | reuse | | | | 8 |
| `license` | select | sharing | yes | yes | fact | 1 |
| `access_terms` | textarea | sharing | | | | 2 |
| `portability` | select | sharing | yes | yes | fact | 3 |
| `portability_notes` | textarea | sharing | | | | 4 |
| `reused_from` | list (`links_entries`) | sharing | | | | 5 |
| `cost_band` | select | cost | | yes | fact | 1 |
| `run_cost` | select | cost | | yes | | 2 |
| `procurement` | multiselect | cost | | yes | | 3 |
| `approvals` | multiselect | cost | | yes | fact | 4 |
| `equity_note` | textarea | cost | | | | 5 |
| `no_pii_attestation` | boolean | data | yes | | | 1 |
| `data_sensitivity` | multiselect | data | yes | yes | icon | 2 |
| `data_sources` | list | data | | | | 3 |
| `audience` | select | data | yes | yes | icon | 4 |
| `data_governance_notes` | textarea | data | | | | 5 |
| `contact_name` | text | contact | yes | | | 1 |
| `contact_title` | text | contact | | | | 2 |
| `contact_email` | email | contact | yes | | | 3 |
| `body` | markdown | story | yes | | | 1 |

`organization` is last in **About** on purpose: it is a disambiguator, not an entry point. At weight 2 the filter rail opened with a column of one-off organization names and pushed "Area of work" below the fold.

### The "What it took" group

`cost_band`, `run_cost`, `procurement`, `approvals` and `equity_note` are the questions a peer asks second — after "does it work" comes "what would it cost us, who has to sign it off, and who does it affect". None of them is required: a submitter who cannot share a cost leaves it blank or picks **Not disclosed**, and **Not yet reviewed** under `approvals` is a legitimate, useful answer.

The option lists are a **starting draft, not a standard.** The dollar bands are a US-local choice and the review names ("Records retention review", "Research ethics / IRB") are the ones a US public health department recognises. Rewrite them to match how your organization actually budgets, buys and approves — nothing downstream depends on the particular strings.

### The "Sharing & licensing" group

`license`, `access_terms`, `portability`, `portability_notes` and `reused_from` answer the question a peer asks *before* they ask about cost: **may I take this, will it work anywhere but where it was built, and has anyone done it already?** `license` and `portability` are required selects that reach the fact strip, so the answer is visible without scrolling; the two textareas are where the caveats go ("MIT for the code, the prompts are ours", "assumes an Esri stack"). **Not yet decided** is a legitimate `license` answer — it tells a reader to ask, which beats silence — and **Ask first** on `access_terms` is what most internal tools honestly are.

### The attestation and governance notes

`no_pii_attestation` is a required `boolean`: the wizard shows it as a checkbox that must be ticked, the issue form as a Yes/No dropdown, and the page as **Yes/No**. It exists so a submitter has to say, in their own name, that nothing in the write-up, screenshots or example data is personal or protected — the coalition's baseline for anything published, and the one thing a reviewer will spot-check first. `data_governance_notes` is the free-text companion for the answers that need a sentence (which agreement covers the data, what was de-identified, who approved sharing).

Three shipped fields carry `escalate_on`, matching the governance page's "partner review when warranted" tier: `no_pii_attestation` on `[false]`, `data_sensitivity` on the PII, PHI and CJIS options, and `audience` on *Public-facing*. A submission that trips any of them opens as a pull request with a **Closer review** block and the `review:data-governance` label — the reviewer sees at a glance that this one is not a five-minute intake.

## Worked example

A complete entry, `catalog/epi-signal-triage/index.md`:

```yaml
---
layout: entry
render_with_liquid: false
title: "Syndromic surveillance signal triage assistant"
slug: epi-signal-triage
summary: "Reads the daily syndromic alert export, drafts a plain-language note for each signal, and ranks the ones an epidemiologist should open first."
published: 2026-06-18
updated: 2026-07-30
featured: true
impact: "Cut daily alert review from 90 to 30 minutes for two analysts"
organization: "Lakeshore City Department of Public Health"
solution_type: "Source code"
area:
  - "Epidemiology & surveillance"
  - "Data & informatics"
stage: "Pilot"
ai_role: "AI is part of the solution"
ai_types:
  - "Generative text (LLM)"
  - "Classification & NLP"
ai_tools:
  - "Claude (API)"
  - "Python"
platform:
  - "Microsoft Azure"
expertise: "Analyst or data scientist"
readiness:
  - "Needs customization"
  - "Human review built in"
repo_url: "https://github.com/example-org/signal-triage"
docs_url: "https://github.com/example-org/signal-triage/wiki"
resources:
  - label: "Evaluation notebook (PDF)"
    url: "https://docs.example.gov/lakeshore/signal-triage-evaluation.pdf"
screenshots:
  - src: /catalog/epi-signal-triage/screenshots/01.png
    alt: "Triage queue listing seven ranked signals with area, signal strength and status."
data_sensitivity:
  - "De-identified data"
  - "Internal, non-public data"
data_sources:
  - "Syndromic surveillance alert export"
  - "Facility visit counts"
audience: "Internal staff"
contact_name: "Priya Natarajan"
contact_email: "priya.natarajan@example.org"
---

## Problem

…the markdown field's content becomes the page body…
```

Rules the validator enforces: `slug` equals the folder name, `published` (and `updated` when present) is a real `YYYY-MM-DD` date, every required field is non-blank, `select`/`multiselect` values appear verbatim in `options`, `url` fields are `http(s)`, `email` fields contain `@`, `images` point at files that exist, `links` have a label and a URL, and — a warning by default, a failure under `entry.require_link` — the entry has at least one link somewhere.

The ten sample entries under `catalog/` are working examples of every field type in this schema.

## Designing your taxonomy

The schema is the product. A weak field list produces a catalog nobody filters, and no amount of layout work fixes it.

**Start from the decision, not the data.** Write down the question a visitor arrives with — "could my team reuse this?", "who else has solved this?", "which of these can I run without a developer?" — and keep only the fields that answer one of them. Fields that merely describe an entry belong in the write-up.

**Six to nine facets is the ceiling.** Every extra filter costs attention and thins the result counts. If two facets always move together, merge them.

**Keep option lists short and mutually exclusive.** Five to eight options per `select` is comfortable; a `multiselect` can carry more if the options are genuinely independent. Options that overlap ("Housing" and "General housing") produce inconsistent entries — merge them the moment you notice submitters choosing between them.

**Cover business functions, not just programs.** Some of the most reusable entries come from areas that never appear in a program taxonomy: hiring, procurement, contracts, IT operations, legal review, coordinating partners. If your area list only names programs, those entries have nowhere to go and never get written.

**Write `option_meta.description` for every option a submitter could misread.** It is the cheapest accuracy improvement available: it appears in the submission form at the moment of choosing, which is where a wrong value is created.

**Use `warn` sparingly.** Reserve it for the two or three things a reader must not miss. Everything else is neutral.

**Assign `weight` on purpose.** For each card slot, decide what a reader should see first when only one value fits. Weight is that decision, written down.

**Group fields by how someone thinks, not by data type.** The shipped groups — about, how it's built, reuse, data & access, contact, the story — are the order in which an evaluator asks questions, which is also a workable order for a submission form.

**Say "organization" rather than naming an internal unit.** A shared catalog is read by people whose org chart differs from yours; a field called "department" quietly excludes anyone who does not have one.

## Changing the schema

1. Edit `_data/schema.yml` — add, rename, remove or reorder fields. Order within a group affects form and sidebar order; `weight` affects card, filter and fact-strip order.
2. Run `npm run generate` to rebuild `.github/ISSUE_TEMPLATE/new-entry.yml` and `assets/js/configurator/defaults.generated.js`.
3. Run `npm run validate` to confirm the schema and existing entries are still consistent.
4. **Renaming or removing a field does not update existing entries.** Their front matter keeps the old key until someone edits the Markdown; `check_front_matter.rb` flags entries missing a newly-required field.
5. Commit the schema change and the regenerated files together.

## Cohort/program data (module: `cohorts`)

Each `_data/cohorts/<year>.yml` file describes one cohort page (`cohorts/<year>/index.md`, `layout: cohort`):

```yaml
title: "AI Practice Cohort 2026"
events:
  - id: kickoff
    name: "Cohort kickoff"
    date: 2026-09-09
    time: "12:00–1:30 PM ET"
    location: "Zoom"
    type: "Session"
    description: "…"
materials:
  program_guides:            # group key -> heading: underscores to spaces, first letter capitalised ("Program guides")
    - title: "Cohort handbook"
      type: "guide"
      url: "https://…"
policies:
  - "Teams work only with data they are already authorised to use."
```

- `materials` is a **hash** of group key → list of `{title, url, type}`; the key becomes the section heading with underscores turned into spaces (`_includes/materials.html`).
- `policies` is a flat list of strings.
- `events` here are merged with `_data/events.yml` by `_plugins/events.rb` into `site.data.events_all`.
- Entries join a cohort through a schema field whose value matches the year (e.g. a `cohort` `select` with `facet: true`). The shipped AI-catalog schema does not define one — add it if you want cohort filtering.
- Every cohort event gets a detail page generated from this file at `cohorts/<year>/events/<event-id>/` (`event-id` = `id`, else `slug`, else the slugified name). A hand-written `cohorts/<year>/events/<event-id>/index.md` (`layout: event`) overrides the generated page and inherits any field it leaves blank — date, time, location, description — from the matching cohort event.

## Events data (module: `events`)

`_data/events.yml` is a flat list:

```yaml
- id: ai-community-call-sept
  name: "AI in Public Health Community Call"
  date: 2026-09-16
  time: "1:00–2:00 PM ET"
  location: "Zoom"
  url: "https://example.org/community-call"
  type: "Webinar"
  description: "…"
```

`end_date` is optional (multi-day events). `_plugins/events.rb` normalizes and merges this list with every cohort's events into `site.data.events_all`, sorted by date, with a computed `past` boolean and a `page_url` for cohort events that have a page.

## Resource library data (module: `resources`)

`_data/resources.yml` is a list of groups:

```yaml
- group: "Getting started"
  description: "…"          # optional
  items:
    - title: "Responsible AI use checklist"
      url: "https://…"
      type: "Guide"           # optional; shown as a chip
      description: "…"        # optional
```
