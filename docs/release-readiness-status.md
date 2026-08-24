# PHCT and BCHC release-readiness status

- Evidence date: 2026-08-22
- PHCT starting baseline: `c9fcb223826f2fc8c945d894420c16a2b8ff5da0`
- PHCT candidate: [`v1.9.0-rc.1`](https://github.com/crypticpy/phct/releases/tag/v1.9.0-rc.1)
  is published at immutable commit `4b02b7b19a2dc793d313d37da49acff66811e691` after
  [PR #14](https://github.com/crypticpy/phct/pull/14) and the release-record-only
  [PR #15](https://github.com/crypticpy/phct/pull/15) merged; implementation head
  `8518694e25587492df757ede305aaa618abcf925` passed the exact-head
  [aggregate release run](https://github.com/crypticpy/phct/actions/runs/32574830126),
  [performance run](https://github.com/crypticpy/phct/actions/runs/32574830014), and
  [browser-quality run](https://github.com/crypticpy/phct/actions/runs/32574830026); the final merge
  tree also passed Pages, performance, browser quality, CodeQL, and supply-chain runs
- BCHC baseline: `7ea8659ffeb4de7c1f8f53eb93e4d74a15d4fc31`; the protected updater
  bootstrap from [PR #2](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/2) is merged at
  `ee49145a4c5d4768212b0ca6b6125fa6272207dd`. The first
  [real candidate run](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/32593617661)
  resolved the immutable tag, preserved all 116 protected paths, regenerated the deployment,
  passed `npm run verify`, and retained the preview/checksum artifact; GitHub then refused the
  branch push because its built-in token cannot update `.github/workflows`
- Automated code baseline: **green**
- Wider-demo candidate: **no-go until the dedicated update-token remediation and live demo gates pass**
- Stable release and BCHC handoff: **no-go until the human and live-repository gates below pass**

The current milestone is wider-demo readiness for PHCT and BCHC's clearly labelled fictional-data
deployment. Naming the eventual BCHC product owner and backup maintainer is deliberately deferred
until organizational handoff begins; it is not a prerequisite for fixing or previewing the demo.

This is the dated evidence record for the canonical
[release-readiness plan](release-readiness-plan.md). A green local test run proves that the
candidate is technically coherent; it does not replace pull-request review, live GitHub workflow
rehearsals, accessibility testing with people and assistive technology, or an operational handoff.

The uncommitted BCHC working tree is a local compatibility mirror used to exercise the same audit
controls against BCHC's preserved configuration, content, media, name, and branding. It is **not**
the final provenance for a downstream code update. Keep only the small ownership/update bootstrap
in a preparation pull request; commit and tag PHCT first, then regenerate BCHC's generic code diff
with the tagged updater. Do not merge a hand-copied generic update or advance the BCHC lock before
that updater succeeds.

## Automated evidence

| Area | Result | Evidence |
|---|---|---|
| Reproducible toolchain | Pass | Node 22.22.2, npm 10.9.4, Ruby 3.3.11, and Bundler 4.0.11 are exact-pinned and checked by `npm run doctor`. |
| Live pull-request CI | Pass at implementation heads | PHCT exact-head runs at `8518694` passed Validate, 598 Node tests/3 suites, coverage, the complete representative scale and Chrome interaction matrix, Supply chain, both CodeQL languages, workflow lint, pa11y, assistive flows, and desktop/mobile Lighthouse. A [fresh Codex review](https://github.com/crypticpy/phct/pull/14#issuecomment-5380581250) found no major issues after both final findings were fixed and answered inline. All checks triggered by BCHC head `cea6cae` are green. PHCT PRs #14/#15 and BCHC bootstrap PR #2 merged with project-owner authorization. |
| PHCT release verification | Pass | `npm run verify` completed at `8518694`: 598 Node tests across 601 TAP items including 3 suites, 203 Ruby tests with 509 assertions, 98 build-matrix tests, coverage, generated-file checks, preset/module/showcase builds, CSS, Jekyll, license, security-exception, SBOM, image, and internal-link gates. |
| Code coverage | Pass locally and in exact-head CI | Pinned runtime coverage passed reviewed regression floors: complete loaded Node production code 84.81% lines / 75.94% branches / 80.07% functions; focused security parsers 90.54% / 80.55% / 93.59%; updater and release-lock logic 72.79% / 77.39% / 87.76%; loaded Ruby production code 93.29% lines / 85.13% branches / 77.69% methods. Six Ruby CLI sources exercised by subprocess or integration gates are explicitly inventoried, and any new unrepresented Ruby source fails the gate. Validate retains JSON and raw TAP artifacts even when a floor fails. |
| Exact BCHC update rehearsal | Pass | An unrelated-history clone at BCHC `cea6cae` reconciled 405 template-owned paths to PHCT `8518694`, preserved 180 deployment-owned paths, kept all 116 protected files byte-identical, and passed the same 598 Node tests / 601 TAP items, 203 Ruby tests with 509 assertions, coverage floors, 98 build tests, production Jekyll, and built-site links. The protected BCHC snapshot retained SHA-256 `63ba86ba3b4495f486c1d8e440f129ea20403e2a6672585e1b1579cdcbb08232`. Its real `/bchc-ai-use-case-catalog` project path passed the browser performance gate with zero findings. |
| Dependency vulnerabilities | Pass | The exact-head Supply chain job passed parsed npm and Bundler audits with zero active exceptions; critical or unidentified findings cannot be waived, and stale/expired/unused exceptions fail closed. |
| Software bill of materials | Pass | The current lockfiles produce 326 CycloneDX components and 327 globally unique references including the application. Repeated npm package/version rows retain every lock path, Ruby platforms have qualified PURLs, and duplicate references fail generation. |
| Secret scanning | Pass | Gitleaks v8.30.1 found no leaks in either working tree or the complete history of either repository. |
| Workflow syntax | Pass | `actionlint` accepted all workflow files in both repositories. |
| Accessibility automation | Pass | Pa11y reported zero errors on 22 PHCT URLs and 18 BCHC URLs; all four keyboard-flow scenarios passed in each repository. |
| Desktop Lighthouse | Pass | Four URLs and two runs per URL in each repository. Every category score was 100. PHCT maxima: FCP 323 ms, LCP 548 ms, TBT 0 ms, CLS 0.00186. BCHC maxima: FCP 324 ms, LCP 551 ms, TBT 0 ms, CLS 0.01155. |
| Mobile Lighthouse | Pass | PHCT and BCHC scored 97–99 performance and 100 accessibility, best practices, and SEO. Maximum observed FCP was 1,280 ms, LCP 2,632 ms, TBT 0 ms, and CLS 0.008. |
| Scale and interaction matrix | Pass at supported ceiling | The exact-head Linux run completed deterministic 0, 1, 10, 100, 500, and 1,000-entry builds plus real Chrome at 390×844/4× CPU. All enforced release budgets passed through the supported 100-entry ceiling; the retained report records zero release findings. |
| Supported 100-entry target | Pass | Linux CI measured a 13,004 ms build under `/phct-performance`, 523 files/20,861,404 bytes, 61,182-byte gzip catalog, 8,894 DOM nodes, 24,914-byte gzip CSS, 40,870-byte gzip catalog JavaScript, 16,913-byte gzip search data, and 20,622-byte comparison data. Chrome measured 177.0 ms warm-search p95 and 51.5 ms filter p95 against reviewed 250/100 ms limits; BCHC's real project path measured 88.2/15.2 ms locally. |
| Higher-scale characterization | Informational finding | At 500 entries the Linux run built in 63.1 seconds with an 83,990-byte search payload, while the catalog reached 155,156 bytes gzip and 36,860 DOM nodes. At 1,000 entries it built in 166.7 seconds and produced a 108,558,639-byte artifact plus a 264,761-byte/71,819-node catalog. Pagination or incremental rendering is required before claiming support above 100 entries. |
| Protected downstream content | Pass in exact-head rehearsal | The machine-readable ownership manifest, ordered merge rules, protected-file checksums, generated-file regeneration, and immutable parent lock protected all 116 BCHC files in the `cea6cae` → `8518694` rehearsal. A real tagged-update pull request remains required. |

Local Lighthouse and scale reports were written under `/tmp` and are intentionally ephemeral.
The release candidate's GitHub Actions runs must retain their reports and SBOM as reviewable CI
artifacts.

## Defects fixed during the audit

- Added missing protection for BCHC-owned governance, search, derivative metadata, content,
  media, identity, and BCHC-specific documentation.
- Replaced moving template references with an exact-tag/full-SHA update contract and added a
  downstream PHCT lock file.
- Replaced ancestry-dependent merging with complete-tree, ownership-aware reconciliation that
  handles unrelated GitHub-template histories, restores unchanged template paths, preserves file
  types and symlinks, and fails before writing when the ownership contract changes.
- Fixed the updater's clean-runner path: it fetches locked/current and target tags, verifies the
  locked commit, reselects the candidate toolchain, uses a lease-protected push, and dispatches the
  stable Validate and Quality entrypoints. Validate fans out locally to Performance, Supply chain,
  and CodeQL so candidate-only workflows run before default-branch registration.
- Protected downstream code ownership, maintainer assignment, and support commitments alongside
  BCHC content and configuration so a parent update cannot silently replace operational owners.
- Made validation fail closed when the supported Ruby toolchain is absent or wrong.
- Pinned the complete toolchain and fixed Bundler 4 version detection.
- Fixed live-runner package-manager drift: every PHCT workflow that installs dependencies now
  selects the exact npm declared by `packageManager` after `setup-node`, including both the current
  and candidate toolchains in the updater.
- Added deterministic supply-chain, license, security-exception, SBOM, performance, and
  internal-link gates; audits now match exact advisory identities, and SBOM references are unique
  across duplicate npm paths and Ruby platform variants.
- Added pinned-runtime Node and Ruby coverage evidence with conservative full-suite floors,
  explicit security-parser and updater expectations, an inventory check for subprocess-only Ruby
  sources, and always-uploaded CI diagnostics.
- Added a path-confined gzip release server so browser tests measure production-style transfer
  behavior instead of an uncompressed local artifact.
- Replaced placeholder scale data with schema-driven long-form entries, common/rare facets,
  deprecated rows, relationships, and deterministic 320×180 images; the scale report now counts
  transitive JavaScript, fonts, images, and target-scale search payloads without local-evidence
  contamination.
- Added a real-Chrome supported-scale gate for filter/search p95 under a 390×844 viewport and 4×
  CPU slowdown, including a synthetic Pages project path, downstream base URLs, and retained raw
  samples. The first Linux run exposed a 515.1 ms common-query path; exact-literal scoring,
  no-hit-only prefix/fuzzy expansion, deferred bounded card annotation, and a 50 ms debounce
  reduced the final exact-head Linux p95 to 177.0 ms while preserving typo, prefix, relevance, and
  snippet regression coverage.
- Excluded absolute third-party analytics scripts from local JavaScript-bundle accounting while
  retaining fail-closed checks for missing local assets, and preserved prefix/typo recall for every
  word in multi-term searches after current-head automated review exposed both edge cases.
- Turned Lighthouse performance, accessibility, best-practice, SEO, FCP, LCP, TBT, and CLS
  expectations into blocking budgets.
- Fixed an empty-slug Jekyll warning and parent/downstream test assumptions around optional
  showcase and lock-file data.
- Made the PHCT showcase build suite explicitly optional in downstream repositories that do not
  ship showcase configuration, while retaining the complete preset/module matrix.
- Made the manual recovery runbook select the candidate runtimes and exact package managers before
  installing dependencies or running target-version scripts.
- Repaired stale BCHC documentation paths and moved the BCHC status ledger into its protected
  documentation namespace.

The live updater push failure is a P1 release-path finding. A focused pre-merge review then found
that the first remediation persisted the privileged token during candidate checkout; re-review
also caught that delaying the secret within the same job still left it exposed to candidate-created
hooks or processes. The corrected `v1.9.0-rc.2` code verifies without the privileged credential,
commits with hooks disabled, and transfers the exact commit through a digest-checked Git bundle to
a fresh runner that never checks out or executes it. Only that isolated job receives the token for
push and pull-request operations. The gate remains open until BCHC configures that credential and
the corrected candidate creates a green update pull request. No other automated P0 or P1 defect is
known at this checkpoint.

## Release blockers still open

| ID | Required evidence | Owner | Status |
|---|---|---|---|
| RR-H01 | Review these changes and obtain green required CI plus independent human approval in PHCT and BCHC. | PHCT maintainer | Complete for the candidate — the project owner authorized the PRs, PHCT PRs #14/#15 and BCHC PR #2 merged, and their required checks passed. |
| RR-H02 | Tag an immutable PHCT release candidate, run the actual BCHC update workflow, review the checksum report and generated changes, then prove revert/rollback of the update pull request. | PHCT maintainer | In progress — `v1.9.0-rc.1` is immutable at `4b02b7b`; the real BCHC run preserved all 116 files and passed the complete non-browser suite, then exposed the missing workflow-capable push credential. Fix the preflight upstream, configure the dedicated token, issue a corrected candidate, create its update PR, and prove rollback. |
| RR-H03 | Complete a real issue → pull request → media processing → review → merge → Pages deploy → notification rehearsal in both repositories. Use non-sensitive test content and remove it afterward. | Repository admins | Open |
| RR-H04 | Name a BCHC product owner and backup technical maintainer; grant least-privilege access; update `CODEOWNERS`, `MAINTAINERS.md`, and the private contact system. | BCHC sponsor | Open |
| RR-H05 | Correct and verify branch rules, required checks/approval, Pages environment protection, Actions permissions, secrets/variables, domain/DNS, security settings, labels, and notifications against `docs/bchc/operations-inventory.yml`. | Repository admins | Open — read-only API audit completed; the hardening findings below remain. |
| RR-H06 | Manually test current Firefox, Safari, Edge, iOS Safari, and Android Chrome plus VoiceOver and NVDA; verify 200%/400% zoom, keyboard-only use, visible focus, forced colors, reduced motion, and representative long/empty/error content. | Accessibility reviewer | Open |
| RR-H07 | Perform the documented bad-deploy rollback, content takedown, credential-response, repository backup, and restore drills; record timestamps, participants, gaps, and corrections. | Primary and backup maintainers | Open |
| RR-H08 | Run the approved candidate on the intended Pages configuration for one business day with no unresolved P0/P1 defect and review Actions/Pages behavior before the wider demo. | Release owner | Open |
| RR-H09 | Check presentation-critical external links and contact destinations from the deployed candidate; record any intentionally unreachable or staging-only target. | BCHC content owner | Open |

The authenticated 2026-08-22 API audit confirmed that both repositories are public, use `main`,
publish Pages through Actions with HTTPS, and have secret scanning and push protection enabled.
It also found release-blocking hardening gaps: PHCT has no branch protection or ruleset; BCHC's
all-branch ruleset blocks deletion and non-fast-forward updates but does not require a pull request,
approval, conversation resolution, or CI. Both repositories allow all Actions, default workflow
permissions to write, allow Actions to approve pull requests, lack tag rules, and have Dependabot
alerts/security updates disabled. PHCT has private vulnerability reporting and CodeQL analysis;
BCHC has neither yet. Pages environments use branch-policy protection only, neither repository has
a custom domain, and repository-level secret lists are empty. BCHC also has no repository
variables; PHCT has `CATALOG_METRICS=false` and `CATALOG_SHOWCASE=true`.

The configured `gh` token remains invalid, although the existing HTTPS Git credential permitted
this authenticated audit and workflow dispatch. Re-authenticate `gh` for a maintainable release
path. Notification delivery and DNS ownership still require human confirmation. Never record a
credential value in this evidence file or the operations inventory.

## Candidate decision rule

The release owner may change the status to **go** only when every row above has an owner and dated
evidence, both repositories are clean at reviewed commits, required CI is green, and the BCHC lock
references the exact PHCT tag and full commit used by the successful updater rehearsal. Any open
P0/P1 defect, protected-file checksum change without an approved migration, failed accessibility
gate, or unowned operational responsibility is an automatic no-go.
