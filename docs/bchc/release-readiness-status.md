# PHCT and BCHC release-readiness status

- Evidence date: 2026-08-22
- PHCT starting baseline: `c9fcb223826f2fc8c945d894420c16a2b8ff5da0`
- PHCT candidate: `v1.9.0-rc.1` in [PR #14](https://github.com/crypticpy/phct/pull/14);
  implementation head `d1ba9adafaa0f9550cdb378beaa4dbeb748ccccc` passed the exact-head
  [aggregate release run](https://github.com/crypticpy/phct/actions/runs/32565150063), while
  current-head automated re-review, human approval, and the immutable tag remain pending
- BCHC baseline: `7ea8659ffeb4de7c1f8f53eb93e4d74a15d4fc31`; the protected updater
  bootstrap is in [PR #2](https://github.com/crypticpy/bchc-ai-use-case-catalog/pull/2), whose
  implementation/rehearsal head is `047bee6fe4ae01a075ff5a1673a3c57972f106f2`; all checks triggered
  at that head are green, and the broader compatibility mirror remains uncommitted pending a tagged update
- Automated code baseline: **green**
- Stable release and BCHC handoff: **no-go until the human and live-repository gates below pass**

This is the dated evidence record for the canonical
[release-readiness plan](phct-release-readiness-plan.md). A green local test run proves that the
candidate is technically coherent; it does not replace pull-request review, live GitHub workflow
rehearsals, accessibility testing with people and assistive technology, or an operational handoff.

The remaining uncommitted BCHC working tree is a local compatibility mirror used to exercise the
same audit controls against BCHC's preserved configuration, content, media, name, and branding. It
is **not** the final provenance for a downstream code update. The isolated ownership/update
bootstrap is the only preparation change intended for review before the parent release; commit and
tag PHCT first, then regenerate BCHC's generic code diff with the tagged updater. Do not merge a
hand-copied generic update or advance the BCHC lock before that updater succeeds.

## Automated evidence

| Area | Result | Evidence |
|---|---|---|
| Reproducible toolchain | Pass | Node 22.22.2, npm 10.9.4, Ruby 3.3.11, and Bundler 4.0.11 are exact-pinned and checked by `npm run doctor`. |
| Live pull-request CI | Pass at implementation heads | PHCT's exact-head aggregate run at `d1ba9ad` passed Validate, Quality, Performance and scale, Supply chain, and both CodeQL languages; Lint also passed on the pull request. All checks triggered by BCHC head `047bee6` are green, and the preceding implementation head passed its browser-quality workflow. Both PRs remain open for human approval. |
| PHCT release verification | Pass | `npm run verify` completed at `d1ba9ad`: 575 Node tests, 200 Ruby tests with 503 assertions, 98 build-matrix tests, generated-file checks, preset/module/showcase builds, CSS, Jekyll, license, security-exception, SBOM, image, and internal-link gates. |
| Exact BCHC update rehearsal | Pass | An unrelated-history clone at BCHC `047bee6` reconciled 397 template-owned paths to PHCT `d1ba9ad`, preserved 179 deployment-owned paths, kept all 115 protected files byte-identical, and passed 575 Node tests, 200 Ruby tests with 503 assertions, 98 build tests, production Jekyll, and built-site links. |
| Dependency vulnerabilities | Pass | The exact-head Supply chain job passed parsed npm and Bundler audits with zero active exceptions; critical or unidentified findings cannot be waived, and stale/expired/unused exceptions fail closed. |
| Software bill of materials | Pass | The current lockfiles produce 326 CycloneDX components and 327 globally unique references including the application. Repeated npm package/version rows retain every lock path, Ruby platforms have qualified PURLs, and duplicate references fail generation. |
| Secret scanning | Pass | Gitleaks v8.30.1 found no leaks in either working tree or the complete history of either repository. |
| Workflow syntax | Pass | `actionlint` accepted all workflow files in both repositories. |
| Accessibility automation | Pass | Pa11y reported zero errors on 22 PHCT URLs and 18 BCHC URLs; all four keyboard-flow scenarios passed in each repository. |
| Desktop Lighthouse | Pass | Four URLs and two runs per URL in each repository. Every category score was 100. PHCT maxima: FCP 323 ms, LCP 548 ms, TBT 0 ms, CLS 0.00186. BCHC maxima: FCP 324 ms, LCP 551 ms, TBT 0 ms, CLS 0.01155. |
| Mobile Lighthouse | Pass | PHCT and BCHC scored 97–99 performance and 100 accessibility, best practices, and SEO. Maximum observed FCP was 1,280 ms, LCP 2,632 ms, TBT 0 ms, and CLS 0.008. |
| Scale matrix | Pass at supported ceiling | Deterministic 0, 1, 10, 100, 500, and 1,000-entry builds completed. All enforced release budgets passed through the supported 100-entry ceiling. |
| Supported 100-entry target | Pass | 5,278 ms build, 474 files, 21,182,458 output bytes, 61,292-byte gzip catalog, 9,081 DOM nodes, 24,895-byte gzip CSS, and 30,289-byte gzip catalog JavaScript. |
| Higher-scale characterization | Informational finding | At 500 entries the catalog was 175,098 bytes gzip with 37,800 DOM nodes; at 1,000 entries it was 319,579 bytes gzip with 73,700 DOM nodes. Pagination or incremental rendering is required before claiming support above 100 entries. |
| Protected downstream content | Pass in exact-head rehearsal | The machine-readable ownership manifest, ordered merge rules, protected-file checksums, generated-file regeneration, and immutable parent lock protected all 115 BCHC files in the `047bee6` → `d1ba9ad` rehearsal. A real tagged-update pull request remains required. |

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
- Added a path-confined gzip release server so browser tests measure production-style transfer
  behavior instead of an uncompressed local artifact.
- Turned Lighthouse performance, accessibility, best-practice, SEO, FCP, LCP, TBT, and CLS
  expectations into blocking budgets.
- Fixed an empty-slug Jekyll warning and parent/downstream test assumptions around optional
  showcase and lock-file data.
- Made the PHCT showcase build suite explicitly optional in downstream repositories that do not
  ship showcase configuration, while retaining the complete preset/module matrix.
- Made the manual recovery runbook select the candidate runtimes and exact package managers before
  installing dependencies or running target-version scripts.
- Repaired stale BCHC documentation paths and moved this status ledger into the protected
  `docs/bchc/` namespace.

No unresolved automated P0 or P1 code defect is known at this checkpoint.

## Release blockers still open

| ID | Required evidence | Owner | Status |
|---|---|---|---|
| RR-H01 | Review these changes and obtain green required CI plus independent human approval in PHCT and BCHC. | PHCT maintainer | In progress — PRs #14 and #2 are open, triggered CI is green, automated findings have fixes and inline evidence, and fresh current-head automated review plus human approval are pending. |
| RR-H02 | Tag an immutable PHCT release candidate, run the actual BCHC update workflow, review the checksum report and generated changes, then prove revert/rollback of the update pull request. | PHCT maintainer | In progress — the exact commit-to-commit rehearsal passed; creating the immutable tag, running the real workflow, and proving rollback remain open. |
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
