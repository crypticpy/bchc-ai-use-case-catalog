# PHCT and BCHC release-readiness status

- Evidence date: 2026-08-28
- PHCT starting baseline: `c9fcb223826f2fc8c945d894420c16a2b8ff5da0`
- PHCT candidate: `v1.9.0-rc.7`, cut from protected `main` at the merge of the two
  rc.6 refresh-cycle robustness fixes found in downstream review
  ([PR #49](https://github.com/crypticpy/phct/pull/49), merged at
  `af54f2810ed9d94fbfbb9b92ecf500ceaba18ddb`) and this release pull request.
  It supersedes
  [`v1.9.0-rc.6`](https://github.com/crypticpy/phct/releases/tag/v1.9.0-rc.6), published at
  immutable commit `c33e76b05fda6a9bdaa7beea7527414b13d74c1b` — cut at the merge of the
  searchable "Also deployed by" listings ([PR #46](https://github.com/crypticpy/phct/pull/46)),
  the head of the entry-lifecycle, concept-search and search-performance line merged in
  [PR #43](https://github.com/crypticpy/phct/pull/43),
  [PR #44](https://github.com/crypticpy/phct/pull/44) and
  [PR #45](https://github.com/crypticpy/phct/pull/45) — which itself superseded
  [`v1.9.0-rc.5`](https://github.com/crypticpy/phct/releases/tag/v1.9.0-rc.5) at
  immutable commit `607169f1b12c6bb44e959e626c19f2ca9eefa6f0`, which superseded
  [`v1.9.0-rc.4`](https://github.com/crypticpy/phct/releases/tag/v1.9.0-rc.4) at
  `c41149eaacab353c82403477bf0c5b2f26a48650`; the
  [`v1.9.0-rc.2`](https://github.com/crypticpy/phct/releases/tag/v1.9.0-rc.2) record at
  immutable commit `bb2e44714969d261ce77860ddd27af8c5d9626d0` with its 326-component SBOM
  remains the last full-matrix exact-head evidence below.
- BCHC consumed rc.4 via
  [PR #7](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/7) (same updater
  discipline as the recorded
  [rc.2 run](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/32599759546):
  immutable tag and full SHA resolved, protected paths preserved byte-for-byte,
  merged at `fd7206981c58107df626f50062f08ad6aee1a0e0`); the
  published BCHC demo then consumed `v1.9.0-rc.5` via [PR #14](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/14) on 2026-08-26. On 2026-08-28 the ownership-contract migration merged ([BCHC PR #29](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/29)), the live updater consumed `v1.9.0-rc.6` with its fail-closed contract gate proven ([run 33134382533](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/33134382533)) and the machine-verified update merged after human review ([BCHC PR #30](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/30), `c0826d9`), followed by the rc.6 feature adoption ([BCHC PR #31](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/31)). The post-rc.6 robustness fixes then merged to PHCT `main` ([PR #49](https://github.com/crypticpy/phct/pull/49), `af54f28`), so the stable cut now requires an `v1.9.0-rc.7` candidate and one more updater pass before promotion.
- Automated code baseline: **green**
- Wider-demo candidate: **no-go until parent interface polish and the remaining manual/live demo gates pass**
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
| Live pull-request CI | Pass at reviewed heads | The rc.2 implementation retained the full Validate, coverage, preset matrix, scale/Chrome, supply-chain, CodeQL, workflow-lint, pa11y, assistive-flow, and desktop/mobile Lighthouse gates. PHCT PRs #17/#20 passed protected CI and review. The generated metrics head `9a486f6` then passed all seven ruleset-required contexts plus browser quality through trusted dispatches before PR #19 was intentionally closed unmerged. Every check on BCHC rc.2 update head `2017cda` is green. |
| PHCT release verification | Pass | `npm run verify` completed under the exact-pinned toolchain at release-record commit `f1e5699f147ce770137cc50d3d7c86c372c83a37`: 799 Node tests across 3 suites, 233 Ruby tests with 578 assertions, 109 build-matrix tests across 6 suites, plus lint, formatting, coverage, generated-file, data/front-matter, license, security-exception, SBOM, image-derivative, production CSS, Jekyll production build, and built-site link gates. The final release-record head differs from that commit only by this evidence sentence, and every protected CI context runs on the exact head in the release pull request. |
| Code coverage | Pass locally and in exact-head CI | Pinned runtime coverage passed reviewed regression floors: complete loaded Node production code 84.81% lines / 75.94% branches / 80.07% functions; focused security parsers 90.54% / 80.55% / 93.59%; updater and release-lock logic 72.79% / 77.39% / 87.76%; loaded Ruby production code 93.29% lines / 85.13% branches / 77.69% methods. Six Ruby CLI sources exercised by subprocess or integration gates are explicitly inventoried, and any new unrepresented Ruby source fails the gate. Validate retains JSON and raw TAP artifacts even when a floor fails. |
| Exact BCHC update rehearsal | Pass for rc.6 | The real rc.4 updater run resolved `v1.9.0-rc.4` to full SHA `c41149eaacab353c82403477bf0c5b2f26a48650`, preserved the protected BCHC paths, regenerated BCHC-owned deployment output, and opened candidate [PR #7](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/7) at `c4ac0d5de1921f8047cabbe3264b6cda517c52b2`. The complete downstream required-check set was green, and the PR merged at `fd7206981c58107df626f50062f08ad6aee1a0e0`, locking the published BCHC demo to `v1.9.0-rc.4`. The rc.2 rehearsal ([PR #4](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/4) at `2017cda8b731ae52103c6b44232496d2c2fc8662`, 116 protected files byte-identical) remains the recorded checksum baseline. The rc.6 update repeated the rehearsal live on 2026-08-28: the updater first failed closed on the pending ownership-contract migration ([run 33134382533](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/33134382533)), passed once [BCHC PR #29](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/29) merged, and opened the machine-verified [BCHC PR #30](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/30), which merged after human review at `c0826d9776747c2838daaba91991628e4301f7bf`, locking the published demo to `v1.9.0-rc.6`. Repeat the same rehearsal and checksum gate for rc.7 and the stable update. |
| Dependency vulnerabilities | Pass | The exact-head Supply chain job passed parsed npm and Bundler audits with zero active exceptions; critical or unidentified findings cannot be waived, and stale/expired/unused exceptions fail closed. |
| Software bill of materials | Pass | The current lockfiles produce 326 CycloneDX components and 327 globally unique references including the application. Repeated npm package/version rows retain every lock path, Ruby platforms have qualified PURLs, and duplicate references fail generation. |
| Secret scanning | Pass | Gitleaks v8.30.1 found no leaks in either working tree or the complete history of either repository. |
| Workflow syntax | Pass | `actionlint` accepted all workflow files in both repositories. |
| Accessibility automation | Pass | Pa11y reported zero errors on 22 PHCT URLs and 18 BCHC URLs; all four keyboard-flow scenarios passed in each repository. |
| Desktop Lighthouse | Pass | Four URLs and two runs per URL in each repository. Every category score was 100. PHCT maxima: FCP 323 ms, LCP 548 ms, TBT 0 ms, CLS 0.00186. BCHC maxima: FCP 324 ms, LCP 551 ms, TBT 0 ms, CLS 0.01155. |
| Mobile Lighthouse | Pass | PHCT and BCHC scored 97–99 performance and 100 accessibility, best practices, and SEO. Maximum observed FCP was 1,280 ms, LCP 2,632 ms, TBT 0 ms, and CLS 0.008. |
| Scale and interaction matrix | Pass at measured ceiling | The rc.6-head scale job completed deterministic 0, 1, 10, 100, 500, and 1,000-entry builds, and real Chrome at 390×844/4× CPU drove search, filtering, sorting, and compare at every size named in `interaction_entries` — including the worker-built index measured cold and warm — against each size's enforced `scale_budgets` in `quality/performance-budgets.json`. All enforced release budgets passed through the measured 1,000-entry ceiling; the measured table is maintained in `docs/search.md`. |
| Supported 100-entry target | Pass | Linux CI measured a 13,004 ms build under `/phct-performance`, 523 files/20,861,404 bytes, 61,182-byte gzip catalog, 8,894 DOM nodes, 24,914-byte gzip CSS, 40,870-byte gzip catalog JavaScript, 16,913-byte gzip search data, and 20,622-byte comparison data. Chrome measured 177.0 ms warm-search p95 and 51.5 ms filter p95 against reviewed 250/100 ms limits; BCHC's real project path measured 88.2/15.2 ms locally. |
| Higher-scale characterization | Informational finding | At 500 entries the Linux run built in 63.1 seconds with an 83,990-byte search payload, while the catalog reached 155,156 bytes gzip and 36,860 DOM nodes. At 1,000 entries it built in 166.7 seconds and produced a 108,558,639-byte artifact plus a 264,761-byte/71,819-node catalog. Interaction latency is now budgeted and enforced to 1,000 entries (see the scale row above), and off-screen entry cards defer rendering via `content-visibility`; the page-weight and DOM-size characterization here still stands, so pagination or incremental rendering remains the recorded requirement before claiming full support above 100 entries. |
| Protected downstream content | Pass in real tagged update | The machine-readable ownership manifest, ordered merge rules, protected-file checksums, generated-file regeneration, and immutable parent lock protected all 116 BCHC files in the real `v1.9.0-rc.2` updater run and generated PR #4. The real `v1.9.0-rc.6` updater run repeated the gate on 2026-08-28 — checksum-verified protected files in the machine-generated [BCHC PR #30](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/30), after the fail-closed contract check in [run 33134382533](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/33134382533) proved the gate refuses an unmigrated contract. Repeat the same checksum gate for rc.7 and the stable update. |

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

The earlier live updater push failure was a P1 release-path finding. The corrected
`v1.9.0-rc.2` code verifies without the privileged credential, commits with hooks disabled, and
transfers the exact commit through a digest-checked Git bundle to a fresh runner that never checks
out or executes it. Only that isolated job receives the token for push and pull-request operations.
BCHC configured the credential and the corrected candidate created a green update pull request.
No automated P0 or P1 defect is known at this checkpoint.

## Release blockers still open

| ID | Required evidence | Owner | Status |
|---|---|---|---|
| RR-H01 | Review these changes and obtain green required CI plus independent human approval in PHCT and BCHC. | PHCT maintainer | In progress — rc.6's machine-verified update ([BCHC PR #30](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/30)) and the feature adoption ([BCHC PR #31](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/31)) merged 2026-08-28 with green required checks after human review of #30. The [PHCT PR #49](https://github.com/crypticpy/phct/pull/49) merge resets the line: the stable cut now requires an rc.7 candidate and one more human-reviewed BCHC update. |
| RR-H02 | Tag an immutable PHCT release candidate, run the actual BCHC update workflow, review the checksum report and generated changes, then prove revert/rollback of the update pull request. | PHCT maintainer | Complete for rc.6 — immutable `v1.9.0-rc.6` consumed through the live updater with the fail-closed ownership-contract gate proven ([run 33134382533](https://github.com/crypticpy/bchc-ai-use-case-catalog/actions/runs/33134382533)) before [BCHC PR #30](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/30); offline rollback proof retained 2026-08-28: reverting update merge `c0826d9` restores the full `v1.9.0-rc.5` state (58 template files, lock included) touching zero deployment-owned content — the live revert-PR path stays open under RR-H07. Repeat for rc.7 and the stable tag. |
| RR-H03 | Complete a real issue → pull request → media processing → review → merge → Pages deploy → notification rehearsal in both repositories. Use non-sensitive test content and remove it afterward. | Repository admins | In progress — the BCHC leg completed 2026-08-28: a real web-form submission became [BCHC PR #27](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/27) carrying real media (PDF deck plus generated AVIF/WebP derivatives), merged at `610c0fc`, deployed through Pages, and was verified live (entry page, media files, and `search.json`); the test entry was then removed end to end via [BCHC PR #32](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/32) and verified gone. The PHCT leg completed later the same day: form-contract issue [#51](https://github.com/crypticpy/phct/issues/51) was scaffolded into [PR #52](https://github.com/crypticpy/phct/pull/52), the content gates correctly rejected the link-less draft until the maintainer amendment `84dd8bf` (the exact remedies the admin guide prescribes), it merged at `3a3e717`, was verified live on the deployed showcase (entry page and search index), and was removed via [PR #53](https://github.com/crypticpy/phct/pull/53) with the removal verified live. Only the notification-delivery confirmation remains open. |
| RR-H04 | Name a BCHC product owner and backup technical maintainer; grant least-privilege access; update `CODEOWNERS`, `MAINTAINERS.md`, and the private contact system. | BCHC sponsor | Deferred until organizational handoff; it is not a wider-demo prerequisite. |
| RR-H05 | Correct and verify branch rules, required checks/approval, Pages environment protection, Actions permissions, secrets/variables, domain/DNS, security settings, labels, and notifications against `docs/bchc/operations-inventory.yml`. | Repository admins | In progress — a fresh read-only API audit on 2026-08-28 was synced into `docs/bchc/operations-inventory.yml` (BCHC PRs [#31](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/31) and [#33](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/33)); the intentionally-unset repository variables are documented as default-on. Four admin items remain manual: require a human approval, disable Actions PR approval, protect release tags, and confirm notification delivery. |
| RR-H06 | Manually test current Firefox, Safari, Edge, iOS Safari, and Android Chrome plus VoiceOver and NVDA; verify 200%/400% zoom, keyboard-only use, visible focus, forced colors, reduced motion, and representative long/empty/error content. | Accessibility reviewer | Open |
| RR-H07 | Perform the documented bad-deploy rollback, content takedown, credential-response, repository backup, and restore drills; record timestamps, participants, gaps, and corrections. | Primary and backup maintainers | In progress — template update (2026-08-26) and repository backup/restore (2026-08-28, bundle-verified mirrors of both repositories restored and fsck-checked) passed; rollback and content takedown are partial: the offline revert of `c0826d9` is proven but the live revert-PR path is deferred to the rc.7/stable window, and [BCHC PR #32](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/32) rehearsed an ordinary unpublish while the protected-data history purge of `docs/incidents.md` remains unrehearsed. Credential-response and owner-transfer drills remain open. |
| RR-H08 | Run the approved candidate on the intended Pages configuration for one business day with no unresolved P0/P1 defect and review Actions/Pages behavior before the wider demo. | Release owner | In progress — rc.6 is live on the intended Pages configuration with a one-business-day monitor running since 2026-08-28T03:35Z; no P0/P1 defect observed so far. Re-scope the soak once rc.7 is consumed. |
| RR-H09 | Check presentation-critical external links and contact destinations from the deployed candidate; record any intentionally unreachable or staging-only target. | BCHC content owner | Complete for rc.6 — 187 links checked from the deployed candidate on 2026-08-28. One live finding: the three "Ask in the open" links 404 until repository Discussions are enabled (or `contact.ask_in_open` is turned off). The sample entries' intentionally unreachable targets (`example.org`, `github.com/example`) are recorded as such. |

The authenticated 2026-08-22 API audit confirmed that both repositories are public, use `main`,
and publish Pages through Actions with HTTPS. Both now enforce pull requests, strict required
checks, stale-review dismissal, resolved conversations, deletion protection, and non-fast-forward
protection on `main`; their Pages environments accept only `main`. PHCT protects version tags and
future releases are immutable. Both repositories use read-only default workflow permissions and
allow Actions to create or approve pull requests through GitHub's combined switch; project
workflows use creation but do not approve or merge themselves. Allowed actions are restricted and
third-party actions are full-SHA pinned. Dependabot alerts and security updates, private
vulnerability reporting, secret scanning, push protection, and CodeQL are enabled in both
repositories.

The PHCT live metrics rehearsal proved that the built-in token can open a protected pull request,
trusted dispatches can publish every canonical required status, and the automation cannot bypass
review or merge itself. Notification delivery and DNS ownership still require human confirmation.
Never record a credential value in this evidence file or the operations inventory.

## Candidate decision rule

The release owner may change the status to **go** only when every row above has an owner and dated
evidence, both repositories are clean at reviewed commits, required CI is green, and the BCHC lock
references the exact PHCT tag and full commit used by the successful updater rehearsal. Any open
P0/P1 defect, protected-file checksum change without an approved migration, failed accessibility
gate, or unowned operational responsibility is an automatic no-go.
