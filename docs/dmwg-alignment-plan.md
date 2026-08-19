# DMWG alignment plan — v1.5

Aligning the BCHC preset with the Data Modernization Work Group's governance
framework ([BCHC_DMWG_AI_Resource_info.md](BCHC_DMWG_AI_Resource_info.md),
received 2026-08-18). That document is a first sketch from the workgroup call, not
a definitive spec; the direction agreed on 2026-08-18 is:

- **Add, don't delete.** Our content model is already the richer of the two. Every
  field the workgroup lists that we lack is added; nothing we already have is removed
  or renamed. Their four HHS-adapted categories become one more facet *alongside*
  `area`, not a replacement for it.
- **No department wording** (org-agnostic "area"), screenshots stay in the repo, light
  mode only, Tailwind 3.4 — standing decisions, unchanged.
- The schema stays the source of truth: every addition is a schema field or an
  `entry.*` pointer, never a hardcoded key in a layout, script or workflow.

## Field-by-field mapping

| Workgroup field | Ours | Action |
|---|---|---|
| Resource name | `title` | none |
| Resource type (9) | `solution_type` (5) | **extend options** |
| What it does | `summary` | none |
| Use case category (4) | — | **new** `use_case_category` |
| Technology built on | `platform` + `ai_tools` + `vendor` | none (mapping) |
| Open source? / license / access terms | `repo_url` | **new** `license`, `access_terms` |
| Platform-agnostic? + notes | — | **new** `portability`, `portability_notes` |
| Review status (committee-set) | — | **new** `review_status` (`form: false`) |
| Stage of development | `stage` | wording only (`short:` labels) |
| Submitting jurisdiction | `organization` | none now; picklist is an open decision |
| Contact person: name, title, email | `contact_name`, `contact_email` | **new** `contact_title` |
| Data sensitivity notes / no-PII attestation | `data_sensitivity` (what the tool touches) | **new** `no_pii_attestation`, `data_governance_notes` |
| Link(s) | `repo_url` / `demo_url` / `docs_url` / `resources` | none |
| Date submitted / updated (auto) | `published` auto, `updated` manual | **automation** stamps `updated` |

Kept with no counterpart on their sheet (18 fields): `area`, `impact`, `ai_role`,
`ai_types`, `ai_tools`, `platform`, `vendor`, `expertise`, `readiness`, `screenshots`,
`deck_pdf`, `resources`, `cost_band`, `run_cost`, `procurement`, `approvals`,
`equity_note`, `data_sensitivity`, `data_sources`, `audience`, `body`.

Net schema change: 1 options extension, 8 new fields, 1 new group, 0 deletions,
0 renames. Existing entries stay valid (all additions are optional except where noted,
and required-ness only bites new submissions — see "Existing entries" below).

## Wave 1 — schema (`_data/schema.yml`)

### 1.1 Extend `solution_type` options

Add, keeping the five existing options and their `option_meta` untouched:

| Option | icon | description |
|---|---|---|
| `Dataset` | database | A shareable data product — extract, reference table, synthetic set — with its documentation. |
| `Dashboard or report` | chart-bar | A Power BI / Tableau / Looker / custom dashboard others can rebuild or reuse. |
| `Prompt library` | message-square | Prompts, system instructions or agent configurations, with the context they were written for. |
| `Training material` | graduation-cap | Slides, curricula, exercises or recordings used to train staff. |
| `Governance or policy document` | scale | Policy, guidance, evaluation rubric or approval template. |
| `Other` | more-horizontal | Anything else — say what in the summary. |

`Playbook or write-up` already covers "implementation guide / playbook". Icons must
exist in `_includes/icon.html`; add any that do not (same SVG source as the rest).

### 1.2 New field `use_case_category`

```yaml
- key: use_case_category
  label: "Use case category"
  prompt: "Which of the four coalition categories fits best?"
  type: select
  required: true
  group: about
  weight: 4            # right after solution_type; area, stage, summary, impact, organization shift down one
  facet: true
  card: chip
  icon: folder
  options:
    - "Administrative & task automation"
    - "Communications, media & writing"
    - "Coding & brainstorming"
    - "Operations & logistics"
  option_meta:
    "Administrative & task automation": { short: "Admin & automation" }
    "Communications, media & writing": { short: "Communications" }
    "Coding & brainstorming": { short: "Coding" }
    "Operations & logistics": { short: "Operations" }
  description: "The HHS-adapted categories used in the DMWG inventory. Area of work (below) is the finer cut."
```

Weights stay integers: `area` → 5, `stage` → 6, `summary` → 7, `impact` → 8,
`organization` → 9. Check the card meta order after the change: `stage` (meta) must still sort before `organization` (meta)
so the sentence-case `--text` segment lands on the organization — see
`.entry-meta-seg--text` in `assets/css/components/catalog.css`.

### 1.3 New group `sharing` + four fields

```yaml
- key: sharing
  title: "Sharing & licensing"
  description: "How another jurisdiction may use it, and how portable it is."
  icon: share-2
```

Placed after `reuse` in `groups`. Main placement (textareas need column width).

```yaml
- key: license
  label: "License"
  prompt: "Under what license is it shared?"
  type: select
  required: true
  group: sharing
  facet: true
  card: fact
  icon: file-text
  options:
    - "MIT"
    - "Apache 2.0"
    - "GPL / AGPL"
    - "Creative Commons (CC BY / CC0)"
    - "Other open license"
    - "Not open source — available on request"
    - "Not open source — description only"
  option_meta:
    "MIT": { tone: primary, description: "Permissive; reuse with attribution." }
    "Apache 2.0": { tone: primary, description: "Permissive, with a patent grant." }
    "GPL / AGPL": { description: "Copyleft; derivatives must stay open." }
    "Creative Commons (CC BY / CC0)": { short: "Creative Commons", tone: primary, description: "For documents, prompts, datasets and training material." }
    "Other open license": { short: "Other open" }
    "Not open source — available on request": { short: "On request", description: "Peer jurisdictions can ask; say how in the access terms below." }
    "Not open source — description only": { short: "Description only", description: "The write-up is what is shared, not the artifact." }
  description: "The coalition default is a permissive open license (MIT, Apache 2.0, CC BY). Submitting does not transfer ownership — your jurisdiction keeps authorship."

- key: access_terms
  label: "Access terms"
  prompt: "If it is not open source, how can a peer jurisdiction get access?"
  type: textarea
  group: sharing
  description: "Government-to-government only, data-sharing agreement required, contact us — whatever applies. Leave blank for open-licensed resources."

- key: portability
  label: "Portable to other platforms"
  prompt: "Could it be adapted outside its original vendor ecosystem?"
  type: select
  required: true
  group: sharing
  facet: true
  card: fact
  icon: shuffle
  options:
    - "Yes — platform-agnostic"
    - "Partially — with rework"
    - "No — tied to its platform"
  option_meta:
    "Yes — platform-agnostic": { short: "Portable", tone: primary }
    "Partially — with rework": { short: "Partly portable" }
    "No — tied to its platform": { short: "Platform-tied" }
  description: "Microsoft-built but portable to AWS is 'partially'."

- key: portability_notes
  label: "Portability notes"
  prompt: "What would porting it involve?"
  type: textarea
  group: sharing
  description: "Which pieces are vendor-specific, and what a team on a different stack would need to swap."
```

`required: true` on `license` and `portability` applies to new submissions; existing
entries get values in the backfill (1.7).

### 1.4 New field `review_status` (maintainer-only)

```yaml
- key: review_status
  label: "Review status"
  type: select
  form: false                     # set by the review committee, never by the submitter
  group: about
  weight: 1
  facet: true
  card: badge
  icon: shield-check
  options:
    - "Reviewed & approved"
    - "Under review"
    - "Revisions requested"
    - "Not yet reviewed"
    - "Deprecated"
  option_meta:
    "Reviewed & approved": { short: "Approved", tone: primary, description: "Passed intake and Governance Committee review." }
    "Under review": { description: "Published provisionally while the committee reviews." }
    "Revisions requested": { short: "Revisions", tone: warn }
    "Not yet reviewed": { short: "Unreviewed", tone: warn }
    "Deprecated": { tone: warn, description: "No longer maintained or accurate — kept for the record." }
  description: "Set by the review committee in the pull request, not by the submitter."
```

Plus a schema-level pointer, matching the existing `entry.verified_key` pattern so no
template hardcodes the key:

```yaml
entry:
  status_key: review_status        # optional; the field whose "Deprecated"-tone value drives the banner
  deprecated_value: "Deprecated"
```

Behaviour keyed off `entry.status_key` (all schema-driven, none of it BCHC-specific):

- Entry page: a full-width notice above the fact strip when the value equals
  `deprecated_value` ("This entry is deprecated — kept for the record; the contact may
  no longer respond"). Reuses the `entry-stale` notice styling with `tone: warn`.
- Cards: `data-entry-deprecated` attribute; the badge already renders from `card: badge`
  (two badge fields → confirm the card's badge slot handles more than one; if not,
  the status badge takes precedence over `solution_type`).
- Sorting: deprecated entries sort after stale ones in the default order (extend the
  staleness ordering in `index.md`/`catalog/index.md` and `assets/js/catalog/*`).
- Featured/carousel/hero-latest: exclude deprecated entries.
- Search: still indexed; the facet lets readers include/exclude.
- Scaffolder (`scripts/new_entry_from_issue.mjs`): writes the second option
  ("Under review") on scaffold when `entry.status_key` is set — the entry publishes only
  when a maintainer merges, and the maintainer flips it to "Reviewed & approved" in the
  same PR (checklist item). Any pre-publish state that never publishes lives on the
  issue/PR as a label (wave 3), not in front matter.
- Validation (`check_front_matter.rb`): the value must be one of `options` (already true
  for any `select`).
- Admin guide: "Deprecate rather than delete" replaces the "removing the folder is the
  only way to unpublish" paragraph; deletion is reserved for `incidents.md` cases.

### 1.5 New field `contact_title`

```yaml
- key: contact_title
  label: "Contact title"
  prompt: "Their role or title"
  type: text
  group: contact
  weight: 2                       # between contact_name and contact_email; renumber email → 3
  description: "So a peer knows who they are writing to (e.g. Informatics Manager)."
```

Contact card in the rail shows name, title, email in that order — verify
`_layouts/entry.html`'s contact rendering is field-driven and just picks it up.

### 1.6 New fields `no_pii_attestation` + `data_governance_notes`

```yaml
- key: no_pii_attestation
  label: "No PII/PHI in the shared material"
  prompt: "Do you confirm that no personal or protected health information appears in the resource, its documentation, example data or screenshots?"
  type: boolean
  required: true
  group: data
  weight: 1
  description: "This is the coalition's baseline for anything published here. Reviewers spot-check; if the answer is no, please redact before submitting."

- key: data_governance_notes
  label: "Data-governance caveats"
  prompt: "Anything a reusing jurisdiction should know about data handling?"
  type: textarea
  group: data
  description: "Data-use agreements, retention rules, de-identification steps, jurisdictions the model was trained on — the caveats that travel with the resource."
```

`boolean` renders today as a required Yes/No dropdown in the issue form and a
Yes/No control in the web form, and `field-value.html` prints Yes/No. Two additions:

- Scaffolder: when the attestation is `No`, still scaffold the PR but add a prominent
  `> ⚠️` block at the top of the PR body and a `review:data-governance` label (wave 3),
  so Tier 1 sees it first. Never silently drop the submission.
- Web form (`assets/js/submit/*`): the review step shows the attestation as its own
  line with a warning tone when No. No new control type.

### 1.7 Existing entries and fixtures

- Backfill the ten demo entries under `catalog/**/index.md` (and the fixture seeder
  `scripts/seed_fixture_entries.mjs`) with `use_case_category`, `license`,
  `portability`, `no_pii_attestation: true`, `review_status: "Reviewed & approved"`,
  and `contact_title` where a plausible one exists. Values must be honest to the story
  each demo tells.
- `presets.js` (configurator): the BCHC preset carries the new fields; the three other
  presets are untouched except that `core.js`'s field-type list already knows every
  type used here.
- `npm run generate` → regenerate `.github/ISSUE_TEMPLATE/new-entry.yml`; commit it.
- Docs: `docs/content-model.md` (new group, `entry.status_key`, `deprecated_value`),
  `docs/roadmap.md` field list, `README.md` field table if it has one.
- `stage` wording: no change. "Exploring" is clearer than "Concept", and their
  "Deployed in production" / "Retired" already match our shorts.

**Status: wave 1 shipped (unreleased, 2026-08-18)** — all gates below green, `/freview`
clean.

Gates for wave 1: `npm run validate`, `node scripts/generate.mjs --check`, `npm test`,
`npm run test:ruby`, `bundle exec jekyll build`, `RUN_BUILD_TESTS=1 npm run test:build`,
`npm run a11y`, `npm run test:flows`; then a screenshot pass of a card, the catalog
filters (two new facets + a status facet), an entry page (sharing section, deprecated
banner on a fixture), and the submit wizard (new steps/fields, attestation on review).

## Wave 2 — governance on the site

**Status: shipped (unreleased, 2026-08-18).** As built it differs from the sketch below
in two ways worth recording: the page is a proper `governance` **module** (toggle in
`site.modules`, prefix in `_data/modules.yml`, off in the three non-BCHC presets)
rather than "always on with an empty list", and its content lives in its own
`_data/governance.yml` — review steps with tier and turnaround, criteria, roles and
policies as separate blocks — rather than one flat `{title, body}` list in `site.yml`.
Everything else landed as planned; the footer also gained a *Feed* link.

- **Policies page.** New `governance/index.md` (module-free, always on) rendered from a
  new `_data/site.yml` block `governance:` — `intro`, and a list of `{title, body}`
  sections. The BCHC config ships: no PII/PHI (attestation + spot check), licensing
  default and "submitting does not transfer ownership", data-governance baseline and
  takedown, accessibility (WCAG 2.1 AA, tested on every build), minimum documentation
  bar (contact + at least one working link), review process (Tier 1 intake ~5 business
  days → Tier 2 committee ~10 business days → publish; Tier 3 partner review for
  higher-risk), annual verification and deprecation, appeals (to the full Governance
  Committee), code of conduct summary, roles (Governance Committee / Intake Team / BCHC
  staff lead / submitting jurisdiction). Empty list → page 404s the same way disabled
  modules do (`_plugins/modules.rb` pattern), so other presets do not inherit BCHC text.
- Navigation: `_data/navigation.yml` gains "Governance"; footer link too.
- `/about/` links to it; `/submit/` intro gains one sentence on IP retention and the
  turnaround becomes the two-tier figure (`submit.turnaround` copy).
- Accessibility statement: a section on the governance page, plus a one-liner in the
  footer (`footer.accessibility` optional string).
- `CODE_OF_CONDUCT.md` at repo root (Contributor-Covenant-style, short, coalition
  wording), linked from CONTRIBUTING and the governance page.
- Onboarding: `docs/contributor-guide.md` — how to submit, what review to expect, how
  to search before you build; linked from `/submit/` "before you start" and the
  governance page. (`admin-guide.md` stays maintainer-facing.)

## Wave 3 — review workflow

**Status: shipped (unreleased, 2026-08-18).** Two deviations from the sketch below,
both deliberate: escalation is driven by an explicit per-field `escalate_on` list in
the schema (a boolean's `false`, select/multiselect options — validated against
`options` by `check_front_matter.rb`) rather than inferred from `option_meta.tone`,
because "this option is warn-toned on a badge" and "this answer needs a second
reviewer" are different decisions and a preset should be able to make them
separately; and the PR checklist criteria are read from `_data/governance.yml`
(`review.criteria`) with a generic five as fallback, so the pull request and the
governance page can never disagree. The `updated` stamp is a `stamp` job inside
`pages.yml` (`scripts/stamp_updated.mjs`), non-fatal, with the loop guard being
idempotency (an `updated` already at today is left alone) plus a head-commit-message
check. Labels are applied in a separate best-effort step, because `gh pr create
--label` fails outright on a missing label.

- Labels (`bootstrap-labels.yml`): `review:intake`, `review:committee`,
  `review:partner`, `review:revisions-requested`, `review:data-governance`,
  `review:declined`. Colours in the existing purple family.
- Scaffolder labels the PR `review:intake` on open, and adds `review:data-governance`
  when `no_pii_attestation` is No, or `data_sensitivity` includes a `tone: warn`
  option, or `audience` is public-facing — driven by `option_meta.tone`, not by option
  text.
- Generated PR checklist (in `new_entry_from_issue.mjs`) gains the five §2.3 criteria
  as their own block: completeness, accuracy (technology, license, portability claims),
  data governance, reuse readiness, category fit — and "set `review_status` to
  Reviewed & approved before merging".
- `docs/admin-guide.md`: a "Review tiers" section (who does what, targets), the
  declined-with-rationale saved reply, deprecate-not-delete.
- `updated` stamping: `pages.yml` (or a small `stamp-updated.yml` on `push` to
  `main` touching `catalog/**`) sets `updated: <merge date>` on the changed entries
  and commits back — only when the front matter's `updated` is absent or older than
  the merge date, and never on the initial scaffold commit (that is `published`).
  Guard against loops (skip when the pusher is the bot). Document in admin-guide.
- Minimum documentation bar: `check_front_matter.rb` warns (not fails) when an entry
  has no `url`-typed field and no `resources` set; the review checklist makes it a
  publish blocker. Schema hint `entry.require_link: true` turns the warning into an
  error for presets that want it (BCHC does).

## Wave 4 — metrics and promotion

**Status: shipped (2026-08-18, released as v1.6.0).** As built: `scripts/metrics.mjs`
counts submissions by the `content:new-entry` label, publications by the `entry/`
branch prefix and turnaround from the scaffolder's `Closes #N`, over the last four
calendar quarters; contributing organizations come from a new schema pointer,
`entry.contributor_key` (`organization` in the shipped schema — absent means no
figure), live entries only. The monthly `metrics.yml` (2nd of the month, 07:30 UTC;
`CATALOG_METRICS=false` turns it off) writes `_data/metrics.json` only when the figures
changed, commits it `[skip ci]` and dispatches `pages.yml` explicitly, so it behaves
the same with either token. `/governance/` renders it as "How the catalog is doing"
(figure cards, per-quarter table, the feed sentence) and renders nothing until the file
exists; the template ships sample figures, which `npm run eject:samples` deletes. `reused_from`
shipped exactly as sketched, with the `links_entries` hint validated by
`check_front_matter.rb` (slug must exist; `list` fields only) and an "Adopted by *n*"
rail card on the source. Plausible remains optional.

- `scripts/metrics.mjs` (+ `metrics.yml` monthly workflow): counts submissions opened
  / PRs merged per quarter, distinct contributing organizations, review turnaround
  (issue open → PR merge, median and p90) — written to `_data/metrics.json` and
  rendered on the governance page as a small "How the catalog is doing" block. Read-only
  GitHub API via `GITHUB_TOKEN`; no analytics vendor needed for these.
- Reuse tracking: new optional field `reused_from` — a `list` of entry slugs with a
  `links_entries: true` display hint (no relation type exists; the hint makes
  `field-value.html` render each slug as a link to that entry) — so a jurisdiction
  adopting another's resource can say so; the source entry shows "Adopted by N".
- Atom feed — **already shipped in v1.2.0** (`_plugins/catalog_feed.rb` writes
  `/catalog/feed.xml`, linked from `<head>`; a visible footer link lands with the wave-2 footer work). Answers §4.7
  "promotion of new/updated resources"; nothing to build beyond mentioning it on the
  governance page.
- Plausible stays optional (`analytics.plausible_domain`) for the browsing-vs-contributing
  question.

## Open decisions (not blocking wave 1)

1. **Jurisdiction as a picklist.** `organization` stays free text until the DMWG
   confirms it wants a fixed member list; when it does, it becomes a `select` with the
   35+ members + "Other" and the entries get normalised in one PR.
2. **Submission authentication.** Two supported options today: anyone with a GitHub
   account (default) or `SUBMISSIONS_OPEN=false` (org members / collaborators only).
   The framework's "confirm authentication for submissions" is the DMWG's call; we
   document both in the governance page and admin guide.
3. **Institutional home / hosting owner** (§4.6) — organisational; nothing to build.

## Sequencing and gates

Waves are independent enough to commit separately: `feat(schema): dmwg fields`,
`feat(governance): policies page and code of conduct`, `feat(review): tiers, labels
and updated stamping`, `feat(metrics): …`. Each wave: full gate list from
`CLAUDE.md` + screenshots for anything visible; `/freview` before reporting a wave
done (all four touch ≥6 files). Released as **v1.5.0** after waves 1–3 and **v1.6.0**
after wave 4.

Verification for the whole plan: walk the workgroup document top to bottom and tick
each field (§1), each workflow step (§2.2), each criterion (§2.3), each platform bullet
(§3) and each governance element (§4.1–4.9) against the site — the list in the section
above is the checklist.
