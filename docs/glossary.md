# Glossary

The words this project uses, in the sense it uses them. One line each, written for the person
maintaining a catalog rather than the person building the template.

**entry** — one published thing in the catalog: one folder under `catalog/`, one page on the site,
one card in the grid. What an entry *is* (a use case, a project, a resource) is up to your schema.

**slug** — the short, hyphenated name in an entry's web address. `catalog/service-request-routing/`
has the slug `service-request-routing`; it must match the folder name exactly, which is what the "slug
must equal the folder name" validation error is telling you.

**front matter** — the block of `key: value` lines between the two `---` markers at the top of an
entry file. It holds the answers to the form; everything after it is the write-up.

**schema** — `_data/schema.yml`, the file that defines every field an entry has and how each one is
presented. Nothing else in the project names a field, so this file is the content model.

**field** — one question in the schema: a key, a label, a type, and hints about where its answer
shows up. `title`, `organization`, `readiness` are fields.

**option** — one of the fixed choices a `select` or `multiselect` field offers. `option_meta` adds
a short label, an icon, a tone and a description to an option.

**facet** — a field marked `facet: true`, which becomes a filter in the catalog's left-hand rail
with a live count beside each option.

**card slot** — where a field's value lands on a catalog card. The slots are `media`, `badge`,
`meta`, `line`, `chip` and `icon`; a field opts into one with `card:`, and the card template
enforces how many values each slot will show. `fact` is the one slot that is not a card slot at
all — it puts the field in the entry page's fact strip and leaves the card alone.

**fact strip** — the wrapping band of labelled values across the top of an entry page, above the
write-up. It gathers the `icon` fields (the same signals the card shows), then the `fact` fields,
then any `meta` field the page header has not already used. It answers "what would I need to know
before reading any further".

**chip** — a small rounded label on a card or entry page, used for one family of taxonomy values.

**signal strip** — the row of icon-plus-value pairs along the bottom of a card, built from the
fields marked `card: icon`. It is the "could my team reuse this?" line.

**group** — a named section of the entry form and the entry page sidebar (About, How it's built,
Reuse…). Fields declare which group they belong to.

**weight** — one number (1–9) doing four jobs: a field's order in its form section, in a card slot,
in the fact strip and in a filter group. Lower goes first, and lower survives when a slot overflows.

**placement** — a *group* property, and only for the entry page: `main` (the default) makes the
group a section in the page body, `rail` makes it a card in the sticky sidebar.

**prompt** — the question form of a field's label ("What does it do?"), shown as the visible
question on the submission form and the issue form. `description` is the help text under it.

**module** — a section of the site that can be switched on or off in `_data/site.yml`: `catalog`,
`submit`, `carousel`, `stats`, `events`, `cohorts`, `resources`, `governance`. Pages belonging to
a module that is off are dropped from the build entirely.

**preset** — a starting configuration the setup wizards offer: AI use case catalog, cohort/program
portal, resource library, or blank. A preset is a starting point, not a mode — everything it sets
is editable afterwards.

**cohort** — a program year with its own landing page, schedule and event pages, under
`/cohorts/<year>/`. Only relevant when the `cohorts` module is on.

**sample** — one of the ten example entries the template ships with, each marked `sample: true` in
its front matter. They are fictional, and deleting them is step 4 of [launch.md](launch.md).

**verified** — a reserved front matter key holding the date a maintainer last re-checked an entry's
facts with its contact. Stronger than `updated`, which someone sets after fixing a typo. Optional,
`YYYY-MM-DD`, and never written by automation.

**last confirmed** — the newest of an entry's `verified`, `updated` and `published` dates. What the
site means when it says "Last confirmed March 2026".

**stale** — an entry whose last-confirmed date is further back than `catalog.verify_after_days` in
`_data/site.yml` (365 by default). A stale entry gets a quiet note on its page, a date line on its
card, and a place after fresher entries in the default sort. It is not hidden, flagged or coloured.

**verification sweep** — the monthly workflow that lists the stale entries in one rolling GitHub
issue labelled `verification`, so the decay shows up somewhere a maintainer looks. See
[admin-guide.md](admin-guide.md#the-monthly-verification-sweep).

**catalog metrics** — the "How the catalog is doing" block on the governance page: submissions,
publications, contributing organizations and review turnaround by quarter, counted from the
repository's own issues and pull requests by the monthly `metrics.yml` workflow into
`_data/metrics.json`. Absent until that workflow has run. See
[admin-guide.md](admin-guide.md#the-monthly-catalog-metrics).

**scaffold** — what the automation does when a submission arrives: read the issue, write
`catalog/<slug>/index.md` and download the attached images, and open a pull request. It drafts; it
never publishes.

**area** — in the shipped AI use case schema, the broad "area of work" tagging field. Deliberately
not called "department" — see [decisions.md](decisions.md).

**readiness** — in the shipped schema, the multiselect of flags describing how much work stands
between finding an entry and running it.

**"What it took"** — in the shipped schema, the group holding the five questions a peer has to ask
before they can copy something: cost to stand up, cost to keep running, how it was bought, the
reviews it went through, and who it affects. All five are optional, and the dollar bands and review
names are a US-local draft the site owner is expected to rewrite.

**cost band** — a range rather than a figure ("$25k–$100k"), because nobody can publish an exact
number and a range is enough to know whether a project is in reach. "Not disclosed" is a real
answer; blank means nobody asked.

**"Not yet reviewed"** — an `approvals` option, and the only value in the group carrying a `warn`
tone. It exists so that admitting a gap is easier than leaving the field empty, which is the only
way the field stays honest.
