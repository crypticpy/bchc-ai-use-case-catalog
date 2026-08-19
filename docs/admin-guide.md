# Maintainer / admin guide

Day-to-day operation of a site built from this template: repository setup, reviewing submissions, editing content, running cohorts and events, and troubleshooting.

## One-time repository setup

- [ ] **Pages source**: Settings → Pages → Source → **GitHub Actions** (not "Deploy from a branch").
- [ ] **Actions can open pull requests**: Settings → Actions → General → Workflow permissions → **Allow GitHub Actions to create and approve pull requests**. Without this, every content workflow (`new-entry`, `new-year`, `new-event`, `update-schedule`, `update-event-attachments`) fails at the "Create pull request" step.
- [ ] **Labels**: run the **Bootstrap labels** workflow once (Actions tab → *Bootstrap labels* → *Run workflow*), or create these by hand, exactly as named — the automation workflows filter on them:
  - `content:new-entry` — triggers `new-entry.yml`
  - `content:new-year` — triggers `new-year.yml`
  - `content:schedule` — triggers `update-schedule.yml`
  - `content:new-event` — triggers `new-event.yml`
  - `content:event-attachments` — triggers `update-event-attachments.yml`
  - `content:site-config` — triggers `apply-setup.yml` (maintainers only)
  - `verification` — applied by `verification-sweep.yml` to its rolling issue; nothing triggers on it

  The generated issue forms (`.github/ISSUE_TEMPLATE/*.yml`) already apply these labels when someone opens the issue; you just need the labels to exist in the repo first, or GitHub silently drops them.
- [ ] **`_data/site.yml` → `github.repository`**: set to this repo's `owner/repo`. Drives the submit form's issue links and every "edit on GitHub" link.
- [ ] Configure branding/theme/schema via `/setup/` or `npm run setup` (see the [README](../README.md) quick start and [configuration reference](configuration.md)). With no terminal, paste the wizard's three `_data/*.yml` files into the **Apply setup (creates PR)** issue form and merge the pull request it opens.
- [ ] Clear the demo content: `npm run eject:samples`, or the **Remove the demo content** checkbox on that same Apply setup issue. Until it is gone every page carries a *Demo content* banner — that is deliberate, and it is the only thing telling a visitor that "Baytown Metro Health District" is fictional. The same step switches the `governance` module off; rewrite `_data/governance.yml` as your own review process and policies, then set `governance: true` again. It also removes the showcase — `_showcase/`, `_data/showcase.yml` and `assets/images/showcase/`, the landing page and example sites the template publishes about itself (see [the showcase](configuration.md#the-showcase)). Your fork never builds those anyway: your home page is your catalog.
- [ ] Optional: **`CONTENT_BOT_TOKEN`** — a fine-grained personal access token that makes the checks on generated pull requests run without a click. See [Checks on a generated pull request](#checks-on-a-generated-pull-request) below for what it changes and what to grant it.
- [ ] Optional: custom domain — add a `CNAME` file at the repo root; the `pages.yml` build detects it and serves from the domain root.

## Who can submit

By default anyone with a GitHub account can open a `content:new-entry` issue and have the automation draft a pull request from it. That is the point of the template — the catalog collects work from people who do not have write access to the repository. The safety comes from what the job is allowed to do, not from who is allowed to start it: issue text never reaches a shell, the scaffolder refuses to write outside `catalog/<slug>/`, the page body is written with `render_with_liquid: false` so it is never executed at build time, images are fetched through an SSRF guard and re-checked against their magic bytes, and the output is a pull request that only a maintainer can merge. [SECURITY.md](../SECURITY.md) sets this out in full.

If you need to close submissions for a while, add a repository variable `SUBMISSIONS_OPEN` (Settings → Secrets and variables → Actions → Variables) set to `false`. Every issue-driven workflow (entries, events, cohort years, schedules, attachments) then runs only for issues opened by the repository owner, an organization member or a collaborator. Delete the variable, or set it to anything else, to reopen. Nobody is stopped from opening the issue either way — it simply does not scaffold a pull request, so you can still triage by hand.

## Reviewing a submission

The rules you are applying are published on the site's **Governance** page (`/governance/`, from `_data/governance.yml`, when the `governance` module is on): the review tiers and their turnaround targets, the five criteria, who does what, and the standing policies on privacy, licensing, data governance, accessibility, maintenance and appeals. Submitters are pointed at it from the Submit page and at [contributor-guide.md](contributor-guide.md), so what they were told to expect and what you check are the same list. If you change one, change the other.

1. A submission arrives as a GitHub issue labelled `content:new-entry` (opened via `/submit/` or the issue form directly).
2. The `New entry from issue` workflow (`.github/workflows/new-entry.yml`) runs automatically, scaffolds `catalog/<slug>/index.md` from the issue body, and opens a pull request that closes the issue on merge.
   - If scaffolding fails (e.g. missing title, duplicate slug), the workflow comments the error back on the issue instead of opening a PR. Editing the issue to fix the problem re-triggers the workflow (it also runs on `issues: edited`).
3. Any images the submitter dropped into the issue are downloaded into the entry folder by the same workflow (see [Screenshots and images](#screenshots-and-images) below), so the pull request already contains the pictures — you review them, you do not have to fetch them.
4. On the pull request, work through the checklist below. The pull request body already carries a **Maintainer checklist** — the review criteria from `_data/governance.yml` (the same list the governance page shows; a generic five when the site publishes none), the mechanics, and the review-status flip — and, when an answer matched a field's `escalate_on` list in the schema, a **Closer review** block above it naming the field and the answer (the shipped schema flags an unticked PII/PHI attestation, PII/PHI/CJIS under *Data it touches*, and a *Public-facing* audience). Those pull requests also carry the `review:data-governance` label, so you can see from the list which ones are not a five-minute intake.
5. Set the review status. The scaffold wrote `review_status: "Under review"`; before merging set it to `Reviewed & approved` (the schema names both values: `entry.status_scaffold_value`, `entry.status_approved_value`). If the entry needs changes, leave the pull request open with `review:revisions-requested` and say specifically what to change — the submitter edits the issue or replies on the pull request, and it comes back round.
6. Merge. The `Build & Deploy` workflow runs on every push to `main` and republishes the site, usually within a couple of minutes. Once it has deployed, the automation comments the published URL back on the issue the submission came from ("Your entry is now live at …"), so the submitter hears the outcome without you writing anything. That comment is best-effort: if it does not appear, nothing is wrong with the deploy.

### Review tiers and labels

The governance page describes review as tiers with turnaround targets; the pull request labels are how the tiers show up in the repository. **Bootstrap labels** (Actions tab, run once) creates them; the scaffolder applies the first, reviewers move the rest by hand.

| Label | Who | Meaning |
|---|---|---|
| `review:intake` | Intake team (a small rotating group) | Applied to every scaffolded pull request. Complete, contact reachable, nothing that looks like PII/PHI — within about five business days. |
| `review:data-governance` | Applied by the scaffolder | An answer matched an `escalate_on` list; the **Closer review** block in the body says which. Not a tier — a flag that intake should route it on. |
| `review:committee` | Governance committee | Substantive review: does it work as described, are the technology, licensing and portability claims accurate, right category, data-governance baseline met — within about ten more business days. |
| `review:partner` | A partner reviewer | Referred on: identifiable data, clinical decision support, public-facing use. |
| `review:revisions-requested` | Whoever reviewed | Sent back with specific changes on the pull request. Swap it for the tier label when the changes land. |
| `review:declined` | Governance committee | Not published, with a rationale on the pull request; the pull request is closed, the branch may be deleted, and the submitter may appeal to the full committee. |

The labels are a convention the workflow does not enforce; if your process has different tiers, rename them in `bootstrap-labels.yml` — the scaffolder's label step is best-effort and reports, rather than fails, when a label is missing.

**Declining.** Rare, and always with a reason the submitter can act on. A comment that has worked:

> Thanks for submitting this. We are not going to publish it as it stands, because *[the specific reason — e.g. the shared material includes patient-level data and the attestation cannot be made honestly; or there is no working link or reachable contact, so a reader could not evaluate it]*. If *[what would change the outcome]*, please reopen by editing the issue and we will take another look. You can also ask for this decision to go to the full Governance Committee by replying here.

Add `review:declined`, close the pull request without merging, and leave the issue open long enough for the submitter to see the comment — the automation does not comment on a closed pull request.

### Review checklist

Content

- [ ] The summary says what the thing does, in plain language, in one or two sentences. Rewrite jargon rather than asking the submitter to.
- [ ] Nothing in the entry is protected, personal or non-public: no PHI or PII, no credentials, no internal URLs that leak a private host, no unreleased procurement detail. This applies to the write-up, the screenshots and the linked resources.
- [ ] Named individuals are the submitter's own contact only. Other people are referred to by role.
- [ ] Claims with numbers are the submitter's own and are attributed in the write-up ("across 38 contracts in the pilot"), not stated as general fact.
- [ ] `select` and `multiselect` values are the ones you would have chosen. A wrong `readiness` or `data_sensitivity` misleads every future reader — fix it in the PR and say why in a comment.
- [ ] Cost bands and approvals are the submitter's own claim about their own project. Do not fill them in for them; leave blank rather than guess.

Screenshots

- [ ] Every image actually shows the tool, not a stock graphic or a logo wall.
- [ ] No real people's data on screen — names, addresses, record numbers, case detail, email addresses in a header bar. If in doubt, ask for a redacted version rather than merging.
- [ ] Every image has `alt` text that describes what is shown, in one sentence under about 125 characters. Write it yourself if it is missing; the validator warns but does not block.
- [ ] Images are inside `catalog/<slug>/screenshots/` and referenced with a site-absolute `src`. A `src` pointing at a remote host is a warning in validation — download the file into the folder instead, so the page does not break when someone else's host changes.

Links

- [ ] Every `resources` entry has a label that says what the reader gets ("Evaluation memo (PDF)", "Six-minute walkthrough video"), not "Link" or a bare URL.
- [ ] Links resolve, and resolve for someone outside the organization. A shared drive URL that only your staff can open is worse than no link — either make it public or drop it.
- [ ] There is at least one link somewhere — a URL field or a `resources` item. An entry with none is not published: nobody could evaluate or adopt it. `check_front_matter.rb` says so (a failure in the shipped schema, where `entry.require_link` is on; a warning otherwise); ask the submitter for a link rather than merging around it.

Mechanics

- [ ] The **Validate Content** check is green (`check_front_matter.rb`, `check_file_sizes.rb` and the image-derivatives check).
- [ ] If a slide deck was promised, it has been uploaded into `catalog/<slug>/` as `deck.pdf`.
- [ ] The maintainer checklist in the pull request body is complete. (Generated PRs carry their own checklist; `.github/PULL_REQUEST_TEMPLATE.md` is the one hand-opened PRs get.)

## Checks on a generated pull request

A pull request opened by a workflow using the built-in `GITHUB_TOKEN` does not, by GitHub's design, trigger other workflows — otherwise a workflow could start itself in a loop. Left alone, that means the **Validate Content** and **Quality** checks on a submission's pull request sit at *"This workflow requires approval from a maintainer"* until someone clicks **Approve and run**.

The template handles this without a token: after opening the pull request, each content workflow dispatches `validate.yml` and `quality.yml` against the new branch (`workflow_dispatch` is the exception to the no-loop rule). The run summary lists which workflows it dispatched. Two consequences worth knowing:

- A dispatched run is triggered against the **branch**, so it appears in the Actions tab rather than as a PR check run — but each one posts a commit status (**Validate Content (dispatch)**, **Quality (dispatch)**) on the head commit, and those *do* show in the pull request's checks box. Read them there; if they are missing, look at the branch's latest commit in the Actions tab.
- If the bot pushes again afterwards (the thumbnail job does this when a PDF is attached), the checks are re-dispatched for the new head commit. Always read the check status on the *latest* commit.

**With `CONTENT_BOT_TOKEN` set**, the workflows push and open the pull request as that token's user instead, so the pull request triggers `validate.yml` and `quality.yml` normally, the checks appear in the PR's own checks box, and nothing is dispatched by hand. To set it up:

1. Create a fine-grained personal access token (Settings → Developer settings → Personal access tokens → Fine-grained tokens), scoped to **this repository only**.
2. Grant exactly two repository permissions: **Contents: Read and write** and **Pull requests: Read and write**. Nothing else is needed — the token never touches issues, actions or settings.
3. Add it as a repository secret named `CONTENT_BOT_TOKEN` (Settings → Secrets and variables → Actions → Secrets).

Give it a short expiry and re-issue it on a calendar reminder; the workflows fall back to `GITHUB_TOKEN` and the dispatch path the moment the secret is absent, so an expired token degrades rather than breaks. The token's user becomes the author of every content commit, so use a machine account if you would rather that not be a person's name. [SECURITY.md](../SECURITY.md) covers the trust this delegates.

## Editing or removing an existing entry

- **Small edit**: every entry page has a **Suggest an edit on GitHub** link (bottom of the page) that opens the file directly in GitHub's editor, pre-targeted at `catalog/<slug>/index.md` on the configured branch. Commit directly or via a PR.
- **Larger edit / local**: edit `catalog/<slug>/index.md` in a checkout, run `npm run validate` before pushing.
- **The `updated` date takes care of itself.** When a push to `main` modifies an entry's `index.md`, the `Build & Deploy` workflow's first job (`stamp`, running `scripts/stamp_updated.mjs`) sets `updated:` to that day — only on files git reports as *modified* (a new entry has `published`), never on `sample: true` content, and never backwards: an `updated:` that already says today or later is left alone, which also makes the stamp commit a no-op if it re-triggers a run. It commits back as `chore(entries): stamp updated on N entries [skip ci]` (so the commit starts no second deploy) and the build then deploys that commit, so the page, the feed and "Recently updated" agree. If branch protection refuses the push, the run summary says so and the site deploys as pushed; either let the GitHub Actions app bypass the rule, set `CONTENT_BOT_TOKEN`, or set the date by hand. Set it by hand any time you want a different day — the stamp never overrides a date that is already current.
- **Deprecate (the default for "this is no longer current")**: set the review-status field to its deprecated option — in the shipped schema, `review_status: "Deprecated"` in the entry's front matter. The entry stays published as a record: its page opens with a warning notice, its card says "Deprecated — kept for the record", the home page stops featuring it, and the catalog lists it after every live entry. Nothing is lost for the reader who already built on it, and the next person still finds out what was tried. The schema names the field and the value (`entry.status_key`, `entry.deprecated_value` — see [content-model.md](content-model.md#review-status-and-deprecation)), so a schema without a review status has no deprecated state either.
- **Remove**: delete the entry's folder (`catalog/<slug>/`) in a PR. Reserve this for the cases deprecation does not cover — a duplicate, a submission that should never have been merged, a contributor who withdraws consent.
  Deleting the folder removes the page but not the git history: if the entry contained protected data, a real person's contact details, or anything published without consent, stop here and follow [incidents.md](incidents.md) instead.
- **Un-feature / feature**: toggle `featured: true`/`false` in the entry's front matter. `featured` is a reserved key set by automation to `false` on scaffold; there's no UI for it, it's maintainer-only (the schema's `form: false` fields, like `featured` would be if added, are hidden from submission forms by design).
- Every entry page also has a **Report an issue with this entry** link, which opens a blank pre-titled GitHub issue (not labelled, so it does not trigger automation) — read and triage these manually.

## The monthly verification sweep

A catalog decays quietly. The pilot in an entry became a production system, the contact changed jobs, the tool was retired — and nothing in the repository changes, so the entry keeps reading as current. The template handles this in two halves: the site tells *readers* when an entry is old, and this workflow tells *you*.

**How old is old.** Every entry has a last-confirmed date: the newest of `verified`, `updated` and `published`. When that date is further back than `catalog.verify_after_days` in `_data/site.yml` (365 by default), the entry page shows a one-line note above the fact strip, its catalog card shows "Last confirmed <Month Year>", and the card sorts after fresher ones in the default order. Nothing turns amber and nothing is hidden — an entry nobody has re-checked in a year is still the best account of that project anyone has written down.

**The sweep.** `.github/workflows/verification-sweep.yml` runs at 07:00 UTC on the 1st of each month (and on demand from the Actions tab). It lists the entries past the window and keeps **one** open issue — titled *Verification sweep — YYYY-MM*, labelled `verification` — holding a checklist with a link to each entry, its contact address, and an "edit front matter" link. Next month it rewrites that same issue rather than opening a second one, so a thread you have been working through keeps its comments. If every entry is inside the window, no issue is opened at all.

The workflow only asks for `issues: write`. It never edits an entry, never closes anything, and never emails a contact — deciding an entry is still true is a person's job.

**Clearing an item.** Ask the contact whether anything has changed, fix whatever has, and add (or update) one line in `catalog/<slug>/index.md`:

```yaml
verified: "2026-08-17"
```

That is the whole protocol. `verified` is a reserved key like `updated`: optional, `YYYY-MM-DD`, validated by `check_front_matter.rb` when present — and, unlike `updated`, never written by automation. Setting it resets the entry's clock even if nothing else about the entry changed — which is the point, since "we checked and it is still accurate" is real information.

**Turning it off.** Set the repository variable `VERIFICATION_SWEEP` to `false` (Settings → Secrets and variables → Actions → Variables), or delete the workflow file. To change the window instead of removing the reminder, edit `catalog.verify_after_days` in `_data/site.yml` — the site notices and the sweep both read it, so they can never disagree.

## The monthly catalog metrics

The governance page can carry a short "How the catalog is doing" block — submissions opened, entries published, distinct contributing organizations and review turnaround, by quarter — so the coalition can see at a glance whether the catalog is being used and how quickly review moves. The figures come from this repository's own issues and pull requests; nothing is installed on the site and no analytics vendor is involved.

**The workflow.** `.github/workflows/metrics.yml` runs at 07:30 UTC on the 2nd of each month (and on demand from the Actions tab). It runs `scripts/metrics.mjs`, which reads the repository through two REST calls and counts, over the last four calendar quarters:

- **Submissions** — issues carrying the `content:new-entry` label (the entry form applies it), by the quarter they were opened. Pull requests never count, whatever their labels.
- **Published** — merged pull requests whose branch starts with `entry/` (the scaffolder's naming), by the quarter they merged. A hand-made entry PR on such a branch counts too; a dependency bump does not.
- **Contributing organizations** — the distinct values of the field `entry.contributor_key` names in `_data/schema.yml` (`organization` in the shipped schema), across live entries, `sample: true` content excluded. Delete the key and the figure — and its card and column — disappear.
- **Review turnaround** — for every published PR whose body says `Closes #N` (again the scaffolder's doing), the days from the issue being opened to the merge; the page shows the median and the 90th percentile with the count they rest on. An unlinked PR still counts as published, just not here.

The script writes `_data/metrics.json` only when the figures differ from the committed file (the generated date alone never causes a commit); the workflow then commits it as `chore(metrics): refresh _data/metrics.json [skip ci]` and dispatches `Build & Deploy` explicitly, so it behaves the same whether the push used `GITHUB_TOKEN` or `CONTENT_BOT_TOKEN`. Until the file exists — a fresh fork, or a repository that ejected the samples, which deletes the template's sample figures — the block, its nav item and the "How the catalog is doing" heading are simply not rendered; the organizations card and column also stay hidden while the count is zero, and the review-time card until something has been reviewed. Run it by hand from the Actions tab whenever you want the numbers current — tick **Preview only** to see the figures in the run summary without committing — or locally with `GITHUB_TOKEN=$(gh auth token) node scripts/metrics.mjs` and commit the file.

The workflow asks for `contents: write` (the commit) and `actions: write` (the dispatch). If branch protection refuses the push, the run summary says so; either let the GitHub Actions app bypass the rule, set `CONTENT_BOT_TOKEN`, or run the script locally.

**Turning it off.** Set the repository variable `CATALOG_METRICS` to `false` (Settings → Secrets and variables → Actions → Variables) to stop the schedule — a manual run still works — or delete the workflow file. Deleting `_data/metrics.json` removes the block from the page. To change the sentence above the figures, set `metrics_intro` in `_data/governance.yml`.

## Screenshots and images

Fields of type `images` (shipped: `screenshots`) are the one place where files arrive with the submission rather than after it.

**How they get in.** The submission form tells contributors to attach pictures on the GitHub issue screen; GitHub uploads them to its own CDN and rewrites them into the issue body as Markdown. When `new-entry.yml` runs, the scaffolder parses that field for Markdown images, `<img>` tags and bare URLs, downloads each one into `catalog/<slug>/screenshots/`, and writes the front matter for you:

```yaml
screenshots:
  - src: /catalog/<slug>/screenshots/01.png
    alt: "…the submitter's alt text, or a fallback…"
```

Files are numbered in the order they were attached (`01.png`, `02.jpg`, …) and named from the format actually detected, not from the URL.

**Limits enforced by the download step** (`scripts/lib/images.mjs`):

- at most **8 files** per entry;
- **15 MB total** across all of them;
- **PNG, JPEG, GIF or WebP only**, verified against both the response content type and the file's magic bytes — anything else is skipped;
- one 30-second request per URL, redirects followed.

A failure never fails the scaffold. If an image cannot be downloaded it is left out of the front matter (so the page never shows a broken image) and the URL plus the reason are written into the workflow summary and the pull request body, so you can re-add it during review — download it yourself and commit it under `screenshots/`. Front-matter validation warns about any remote `src` because the page stops working when someone else's host changes.

**Adding or replacing images later.** There is no issue flow for this — do it in a pull request:

1. Add the file to `catalog/<slug>/screenshots/`, keeping the two-digit naming (`03.png`).
2. Add or edit the matching `{src, alt}` item in the entry's front matter. Order in the list is the order in the gallery.
3. To replace an image, overwrite the file and update the `alt` if what it shows has changed. To remove one, delete both the file and its list item — an orphaned `src` fails validation, and an orphaned file just sits in the repository.
4. Keep images reasonably small. There is no per-file cap in validation below the 10 MB warning in `check_file_sizes.rb`, but a screenshot has no business being over a few hundred kilobytes; a 1280px-wide PNG run through `pngquant` is usually 30–60 KB. `check_file_sizes.rb` warns separately above **2 MB** for an image, which is where a straight-from-the-phone retina export lands.

**Responsive copies are generated for you.** Every image under `catalog/` gets AVIF and WebP siblings at 400/800/1280 px (`01-400.avif`, …) so a phone downloads a fraction of the bytes. The bot writes them when a submission or a screenshot lands in a pull request; run `npm run images` yourself if you add one in a local checkout, and commit the result alongside the source. The pages render correctly without them, so a missing derivative is a speed regression and never a broken picture. Full detail — including why they are committed rather than built — is in [images.md](images.md).

**Alt text.** Describe what the picture shows in one sentence, under about 125 characters: "Triage queue listing seven ranked signals with area, signal strength and status." Not "Screenshot", not the entry title again. Alt text is a caption in the lightbox as well as a screen-reader label, so it is visible work, not compliance work.

**Redaction.** Screenshots are the most common way protected data reaches a public catalog. Blur or replace real values before merging; a mock dataset is better than a redaction box, and a redaction box is better than a blur. If a submitter cannot produce a clean screenshot, the entry is fine without one — the card and entry page degrade to a text-first layout rather than showing a placeholder.

## Other attachments and thumbnails

- File-type schema fields (e.g. `deck_pdf`) store a path (`/catalog/<slug>/<filename>`) in front matter. The submission form asks for the file directly (GitHub's `upload` control), and the scaffolder commits it into the entry folder with the rest of the pull request. If the submitter skipped it, or the download was refused (the file has to actually be a PDF — the scaffolder checks the bytes, and says so on the pull request when it does not match), the path is still recorded and the file can be added to that folder in the same PR by hand.
- `links`-type fields (shipped: `resources`) hold `{label, url}` pairs and need no files at all. They are the right home for a shared drive folder, a recorded demo, a model card or a vendor page — anything that does not deserve its own `url` field. Check that each one opens for someone outside the organization before merging.
- Any `file` field flagged `thumbnail: true` in `_data/schema.yml` (shipped: `deck_pdf` → `deck.pdf`) gets a first-page thumbnail rendered automatically:
  - `thumbnails.yml` (**Generate entry media**) triggers on a PR touching any `*.pdf` file — or any `*.png`, `*.jpg`, `*.jpeg` or `*.webp`, since the same job also writes the responsive derivatives described above (it can't read the schema to narrow the trigger, since GitHub evaluates `paths:` before checkout — the schema-driven filtering happens in the next step instead).
  - It runs `scripts/thumbnail_sources.mjs` to find PDF → `thumb.jpg` pairs under the schema's `entry.path` (default `catalog/`), skips empty placeholders and anything that isn't actually a PDF (checks the `%PDF` file signature), and renders each with `pdftoppm` (poppler-utils: `pdftoppm -jpeg -jpegopt quality=85 -scale-to-x 800 …`).
  - It commits `thumb.jpg`, the image derivatives and `_data/derivatives.json` back onto the PR branch itself with a plain `git add`/`commit`/`push`, then re-dispatches **Validate Content** and **Quality** so the new head commit carries both statuses.
  - **This does not run on PRs from forks** (the job is gated on `github.event.pull_request.head.repo.full_name == github.repository`, since fork PRs get a read-only token). For a fork-originated PR, run the workflow manually afterward via `workflow_dispatch`, or generate `thumb.jpg` locally and commit it.
  - `_includes/entry-thumb.html`'s fallback order for the card image: explicit `thumbnail` front-matter value → the first image of the entry's `images` field → an existing `<entry>/thumb.jpg` → nothing. There is no generated placeholder: an entry with no picture gets a text-first card, which is honest and reads better than a fake graphic.

## Cohorts and events (modules: `cohorts`, `events`)

**Start a new cohort year:**
- Open the **Start a new cohort year** issue (label `content:new-year`) with the four-digit year, or run the `Scaffold new cohort year` workflow manually (`workflow_dispatch`, input `year`).
- `scripts/scaffold_year.rb` creates `cohorts/<year>/index.md` and `_data/cohorts/<year>.yml` with placeholder events/materials/policies — it never overwrites existing files — and opens a PR.
- After merging, replace the placeholder intro, events, and policies with the real program details.

**Add an event to a cohort:**
- Open the **Add event details** issue (label `content:new-event`). The workflow first comments back the events already scheduled for that year (so the submitter can reuse or avoid an ID), then scaffolds `cohorts/<year>/events/<event-id>/index.md` and opens a PR.
- Every event in `_data/cohorts/<year>.yml` already has a generated page at `cohorts/<year>/events/<event-id>/`; the scaffolded file overrides it and inherits any field it leaves blank, so you only need one when an event has an agenda, materials or attachments of its own.

**Update a cohort's schedule in bulk:**
- Open the **Update a cohort schedule** issue (label `content:schedule`) — replaces the event list for a cohort year without hand-editing YAML. The workflow previews normalized event IDs as a comment before writing changes, and only opens a PR if something actually changed.

**Add/replace materials on an existing event page:**
- Open the **Update event attachments** issue (label `content:event-attachments`). Leave the event ID blank (or type `help`) and the workflow comments back the list of valid IDs for that year; an ID that does not exist fails the run with a comment naming it, so edit the issue and it re-runs.

All four cohort/event workflows follow the same pattern as new-entry: issue → scripted scaffold/update → PR for a maintainer to review and merge. None of them touch `main` directly. The new-event and event-attachments PRs close their issue on merge; the new-year and schedule PRs do not (their issues are often reused for follow-up), so close those by hand once the PR is in.

**Resource library** (module `resources`) has no issue-based flow — edit `_data/resources.yml` directly in a PR.

## Troubleshooting

**Build failing (`Build & Deploy` workflow red on `main`)**
- Check the Actions log for the failing step. Common culprits: invalid YAML in `_data/*.yml` (run `npm run validate` locally first), a schema change that broke `npm run generate`, or `bundle exec jekyll doctor` flagging a broken permalink/URL.
- `npm run validate` mirrors the CI content gate locally (YAML parse of every `_data/*.yml`, plus the two Ruby checks) — run it before pushing schema or data changes.

**Pull request not created after an issue was opened**
- Confirm the issue actually carries the expected label (`content:new-entry`, etc.) — GitHub only applies labels from an issue form if they already exist in the repo (see setup checklist above).
- Check Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" is enabled — this is the most common cause of a silently-failed `create-pull-request` step.
- Check the workflow run itself: on a scaffolding failure, `new-entry.yml` comments the error onto the issue and fails the job rather than opening an empty PR.

**Checks on a generated pull request say "waiting for approval"**
- Expected on a fresh repository, and not a failure: pull requests opened with the built-in token cannot start other workflows. Either click **Approve and run**, or read the **(dispatch)** commit statuses the workflow posted on the head commit (see [Checks on a generated pull request](#checks-on-a-generated-pull-request)).
- If the workflow's run summary says a dispatch "could not be dispatched", the job lacked `actions: write` or the workflow file is not on the default branch yet — a dispatch can only target a workflow that already exists on `main`.
- To make PR checks run normally instead, add a `CONTENT_BOT_TOKEN` secret as described in that section.

**No "your entry is now live" comment after merging**
- The comment is posted by the `announce` job in `pages.yml` after a successful deploy, and it is deliberately non-fatal: it only fires for a push to `main` whose commit belongs to a merged pull request that closed an issue (`Closes #123` in the PR body — generated PRs always have it) and that added an entry page. A hand-merged squash that rewrote the body, or an edit rather than a new entry, will not produce one.
- Nothing about the site depends on it. Comment on the issue by hand and close it.

**Thumbnails missing on an entry**
- Confirm the PDF was actually added to `catalog/<slug>/` under the exact filename the schema expects (`deck.pdf` by default) and that the schema field has `thumbnail: true`.
- Check whether the PR came from a fork — the thumbnails workflow does not run on fork PRs (see above); trigger it manually or commit the thumbnail yourself.
- Confirm the PR actually changed a `catalog/**/*.pdf` path — the workflow only triggers on that path filter.

**A module toggle doesn't seem to do anything**
- Confirm you're looking at a full rebuild, not a cached preview — `_plugins/modules.rb` removes disabled-module pages at `post_read` time, so the effect only shows up after a Jekyll build, not a live-reload of unrelated content.

**Front-matter validation failing on a PR**
- `check_front_matter.rb` checks: `title`/`slug`/`summary` present, `slug` matches the folder name, `published` (and `updated`/`verified` when present) is a valid `YYYY-MM-DD` date, every `required` field is present, `select`/`multiselect` values are within `options`, `url` fields start with `http(s)://`, `email` fields contain `@`, `images` items have a `src` that exists inside the entry folder, and `links` items have both a label and an `http(s)` or `mailto:` URL. The error message names the file, the line and the field.
- `render_with_liquid: false` is required on every entry, hand-written ones included: without it Jekyll runs the page body through Liquid at build time, so a Liquid `include` tag someone typed into their write-up would execute. The scaffolder emits it automatically.
- Warnings (a remote image `src`, a missing `alt`, a `file` field pointing at a path that is not in the repository yet) are printed but do not fail the check. Fix them anyway — the dangling-attachment one is expected on a freshly generated pull request and should be gone before you merge.

**Weekly smoke build failing**
- `smoke.yml` runs every Monday and does a full validate + build without deploying, to catch drift (e.g. a stale dependency, a broken external asset) between real deploys. Treat a red run the same as a failing `Build & Deploy`.
