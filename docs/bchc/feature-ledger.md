# Feature ledger

The public record of where the catalog is going: what is being built now, what has
been requested and is waiting on a decision, and the design questions that have to be
answered before certain features are safe to build. It exists because the August 2026
coalition presentation generated exactly the kind of ideas, questions and feedback a
catalog like this should collect — and a request that lives in one person's inbox is a
request that gets lost.

**To propose something:** open a
[feature request](https://github.com/crypticpy/bchc-ai-use-case-catalog/issues/new?template=feature.yml).
Maintainers triage requests into this file; the issue thread stays the place where the
discussion happens. Items move down the page as they progress: *under consideration* →
*in progress* → *shipped*, or into *design questions* when what blocks them is a
decision rather than code.

Because this site is built on the [PHCT template](https://github.com/crypticpy/phct),
most features are built there and arrive here through a template update; this ledger
tracks them from BCHC's point of view regardless of which repository the work lands in.

## In progress (2026-08)

- **Search that holds up at scale.** The search index currently ships every entry's
  full write-up and builds the search engine in the browser on page load. The build
  moves to CI, the payload splits so the heavy text loads lazily, and keystroke
  latency gets measured at 500 and 1,000 entries so the supported catalog size is a
  tested number, not a hope.
- **Concept matching in search.** A query should find entries that are *about* the
  words, not just entries that contain them — "chatbot" should surface a chat
  assistant entry that never uses the word. First pass is a concept map derived from
  the catalog's own text at build time: no new dependencies, no behavior change for
  exact matches, purely additive ranking.
- **Refresh reminders.** Entries already carry `published` / `updated` / `verified`
  dates and go visibly stale after a year. What's new: submissions collect an optional
  GitHub handle, and the monthly sweep opens a dedicated refresh issue per stale entry
  that mentions the submitter and the maintainers, with one-click links to confirm
  "still accurate" or submit what changed.
- **"Also deployed by."** An organization that implemented a cataloged use case can
  attach itself to the entry — organization name, link, an optional contact email if
  they want to publish one, and an optional note — through an issue form, without
  writing a full entry of their own. Entries that *do* have their own entry already
  get this via "Adapted from" / "Adopted by".
- **Security signals and review status.** The catalog links to code, it does not host
  or audit it — and it should never imply otherwise. Three layers, none of which
  claims code is "safe": an automated monthly sweep of every linked public repository
  (repository hygiene, [OpenSSF Scorecard](https://scorecard.dev), known-vulnerability
  lookup via [OSV](https://osv.dev)) rendered on the entry as dated observations; a
  maintainer-set review status (*coalition security-reviewed / automated checks only /
  not reviewed*); and a plain disclaimer on entries with external links telling peers
  to run their own security review before deploying.

## Under consideration

*(Empty — new feature requests land here after triage.)*

## Design questions to settle before building

These were raised in August 2026 and deliberately **recorded instead of built**: each
one adds process weight or identity assumptions that deserve a worked-out answer
first.

- **Submitter self-service updates.** The person who submitted an entry should be able
  to update it easily. What proves that the person opening the update *is* the
  submitter (or a colleague at the same organization)? The recorded GitHub handle is
  the obvious anchor, but handles change and people share drafting duties.
- **Ownership remapping.** The original submitter leaves the organization. Who can
  claim the entry, who approves the transfer, and what happens to entries nobody
  claims? Likely shape: a "transfer ownership" issue type that a maintainer approves,
  but the approval rules need writing.
- **Escalation when nobody answers.** A refresh reminder mentions the submitter and
  the maintainers. If the submitter is gone and no maintainer acts within some window,
  what happens — does the entry get a stronger staleness banner, get demoted further,
  get marked unmaintained? Pick the window and the consequence.
- **Security review checklist.** What the coalition actually checks before an entry
  earns *coalition security-reviewed*, who on the governance committee does it, and
  how often it must be renewed. The automated signals (above) ship first precisely so
  this human tier has data to stand on.
- **Embedding-based semantic search.** A stronger upgrade to concept matching:
  precompute text embeddings in CI and rank by meaning. Deferred until the
  corpus-derived concept map proves insufficient — it adds a model dependency to the
  build and real payload weight.

## Shipped

*(Features move here with the date and release they arrived in.)*
