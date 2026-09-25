# Transfer runbook: moving the catalog to BCHC's GitHub organization

- Planned for: 2026-09-25 (one-hour working session)
- From: `crypticpy/bchc-ai-use-case-catalog`
- To: `<ORG>/bchc-ai-use-case-catalog` (replace `<ORG>` with the organization slug everywhere below;
  `<org>` means the same slug in lower case, as GitHub Pages hostnames are lower case)
- Live state this plan was written against: read-only `gh` checks on 2026-09-24

This is the step-by-step script for handing the catalog repository to the Big Cities Health
Coalition. It is specific to this deployment. The generic checklist it builds on is the
[ownership transfer checklist in `docs/maintaining.md`](../maintaining.md#ownership-transfer-checklist);
this runbook does not replace it, it sequences it for the day and adds what is particular to BCHC.

BCHC will own the repository and everything published from it. The repository stays public.
`@crypticpy` stays on as the contracted interim technical maintainer, with enough access to keep
fixing and adjusting things until BCHC names its own maintainer.

## Who does what

| Role | Who | Does |
|---|---|---|
| BCHC org owner | Named in the inputs table | Phase 1 settings, granting `@crypticpy` access after the move, approving the reissued token if the org requires it, naming the product owner and backup maintainer. There is no step to accept the transfer itself. |
| Interim technical maintainer | `@crypticpy` | The transfer itself, the identity-fix pull request, reissuing the update token, redeploying Pages, the Phase 3 checks. |
| AI assistant | Claude Code, driven by `@crypticpy` | Read-only verification commands, preparing the identity-fix branch, reading workflow logs. It never sees a token value and runs no write command without being told to. |

## Inputs to collect from BCHC in the meeting

Fill this in first. Several later steps cannot start without it. The plain-language guide for BCHC
staff, [`transfer-guide-for-bchc.md`](transfer-guide-for-bchc.md), walks them through creating the
org, inviting `@crypticpy` as a temporary Owner (so `@crypticpy` does Phase 1 on their behalf) and
answering these questions.

| Input | Answer | Notes |
|---|---|---|
| Organization slug (`<ORG>`) | | Exactly as it appears in `github.com/<ORG>`. |
| Org owner(s) | | GitHub accounts with the Owner role. At least two is safer than one. |
| Is the org Enterprise Managed Users (EMU)? | yes / no | If yes, stop: a personal account like `@crypticpy` cannot be added to an EMU org. Needs a different plan. |
| BCHC product owner | | GitHub account. Goes in `MAINTAINERS.md`. |
| Backup release maintainer | | GitHub account, or "not yet". Still a release blocker if not yet. |
| Maintainer team name | | Suggest `catalog-maintainers`. Used for repository access and `CODEOWNERS`. |
| Custom domain? | yes / no | Recommended, e.g. `catalog.bigcitieshealth.org`, so the URL never has to change again. |
| DNS contact | | Person who can add a `CNAME` record on the BCHC domain. |
| Review tooling | Copilot code review / none | Optional. Nothing in the repository depends on a review bot. |
| Does PHCT transfer too? | defer | Separate, optional track; see the end of this document. |

## Phase 0: before the meeting

- [ ] Open pull request queue is empty or every open PR is intentionally left open:
      `gh pr list -R crypticpy/bchc-ai-use-case-catalog --state open --json number,title --jq '.[] | "\(.number) \(.title)"'`
- [ ] Stale branches deleted; only `main` (and any branch deliberately kept) remains:
      `gh api repos/crypticpy/bchc-ai-use-case-catalog/branches --jq '.[].name'`
- [ ] `main` is green:
      `gh run list -R crypticpy/bchc-ai-use-case-catalog --branch main --limit 10 --json workflowName,conclusion --jq '.[] | "\(.conclusion) \(.workflowName)"'`
- [ ] Live site loads: `curl -sI https://crypticpy.github.io/bchc-ai-use-case-catalog/ | head -1`
- [ ] Local checkout is clean and up to date (`git status`, `git pull`), and `npm ci` has been run
      so `npm run generate` and `npm run validate` work offline during the meeting.
- [ ] `@crypticpy` has two-factor authentication on and recovery codes to hand.

## Phase 1: BCHC org owner prepares the organization

Done by the BCHC org owner, in the organization's settings (`github.com/organizations/<ORG>/settings`).
Every item below is an existing GitHub setting; names can shift slightly as GitHub updates its UI.

**Membership and access**

- [ ] Invite `@crypticpy` as a member: People → Invite member. `@crypticpy` accepts the email
      invitation (or at `github.com/orgs/<ORG>/invitation`).
      Check: `gh api user/memberships/orgs/<ORG> --jq '{state, role}'` shows `"state": "active"`.
- [ ] Give `@crypticpy` the right to create repositories in the org, which a transfer into an
      organization requires. Either:
      - Member privileges → Repository creation → tick **Public**, or
      - make `@crypticpy` an Owner for the session (People → role → Owner) and change the role back to
        Member at the end of Phase 3.
- [ ] Member privileges → Base permissions: **Read** or **No permission** (the repository grants its
      own access; there is no need for broad write).
- [ ] Member privileges → Pages creation: **Public** ticked.
- [ ] Member privileges → "Allow members to delete or transfer repositories for this organization":
      note the current value. If it is off, only org owners can transfer the repository back out,
      which matters for rollback.
- [ ] Create the maintainer team: Teams → New team → the name from the inputs table, visibility
      **Visible** (a secret team cannot be used in `CODEOWNERS`). Add `@crypticpy` and any BCHC
      maintainers.
- [ ] Authentication security: if "Require two-factor authentication" is on, confirm every invitee
      already has 2FA, or the invitation fails.

**Actions**

- [ ] Actions → General → Policies. Either **Allow all actions and reusable workflows** (the
      repository keeps its own narrower list), or the "selected" option with all of:
      - **Allow actions created by GitHub** ticked
      - Allow specified actions: `peter-evans/create-pull-request@*, ruby/setup-ruby@*`
- [ ] Actions → General → "Require actions to be pinned to a full-length commit SHA": on or off is
      fine; every workflow here is already SHA-pinned and the repository requires it.
- [ ] Actions → General → Workflow permissions: **Read repository contents and packages
      permissions** is fine (workflows declare their own scopes).
- [ ] Actions → General → **Allow GitHub Actions to create and approve pull requests**: ticked.
      If this is off at the org level the repository cannot turn it on, and the entry, event,
      metrics, date-stamp and PHCT update workflows all fail at the "open pull request" step.

**Tokens, Pages, security**

- [ ] Personal access tokens → Settings → Fine-grained tokens: **Allow access via fine-grained
      personal access tokens**. If "Require administrator approval" is on, the org owner will need
      to approve the reissued token in Personal access tokens → Pending requests during Phase 3.
- [ ] Code security → Configurations: do not attach a configuration that turns on **CodeQL default
      setup** for this repository. The repository runs CodeQL through its own workflow, and default
      setup blocks those uploads, which would break the required "Analyze" checks. Secret scanning,
      push protection, Dependabot alerts and private vulnerability reporting are all welcome.
- [ ] Optional, if using a custom domain: Pages → Add a domain, to verify the BCHC domain for the
      org (protects the subdomain from takeover). Needs the DNS contact to add a `TXT` record.

**Check (AI assistant, read-only).** Most org endpoints only answer for an org owner. If
`@crypticpy` is not an owner, the BCHC org owner confirms these on screen instead.

```bash
gh api orgs/<ORG> --jq '{login, plan: .plan.name, two_factor_requirement_enabled, default_repository_permission, members_can_create_public_repositories, members_can_create_public_pages}'
gh api orgs/<ORG>/actions/permissions --jq '{enabled_repositories, allowed_actions, sha_pinning_required}'
gh api orgs/<ORG>/actions/permissions/selected-actions --jq '{github_owned_allowed, patterns_allowed}'
gh api orgs/<ORG>/actions/permissions/workflow --jq '{default_workflow_permissions, can_approve_pull_request_reviews}'
```

Expected: `can_approve_pull_request_reviews: true`; `allowed_actions` is `all`, or `selected` with
`github_owned_allowed: true` and both patterns listed.

## Phase 2: the transfer

- [ ] **Last look at the source.** `gh repo view crypticpy/bchc-ai-use-case-catalog --json owner,visibility --jq '{owner: .owner.login, visibility}'`
      shows `crypticpy` and `PUBLIC`.
- [ ] **Transfer.** `@crypticpy`, on `github.com/crypticpy/bchc-ai-use-case-catalog`:
      Settings → General → Danger Zone → **Transfer ownership** → choose `<ORG>` as the new owner →
      type the repository name to confirm → transfer. Keep the name `bchc-ai-use-case-catalog`.
      There is no accept step when the transferring user can create repositories in the org.
- [ ] **Check the move.**
      `gh repo view <ORG>/bchc-ai-use-case-catalog --json owner,visibility --jq '{owner: .owner.login, visibility}'`
      shows `<ORG>` and `PUBLIC`.
- [ ] **Check the old name redirects.** `gh api repos/crypticpy/bchc-ai-use-case-catalog --jq .full_name`
      prints `<ORG>/bchc-ai-use-case-catalog`. GitHub keeps this redirect only while no repository
      named `crypticpy/bchc-ai-use-case-catalog` exists: never create or fork one under that name.
- [ ] **Point local checkouts at the new home.** In every clone and worktree base:
      ```bash
      git remote set-url origin https://github.com/<ORG>/bchc-ai-use-case-catalog.git
      git remote -v
      git fetch origin
      ```
- [ ] **Expect a Pages gap.** GitHub does not redirect Pages sites. From this moment
      `https://crypticpy.github.io/bchc-ai-use-case-catalog/` stops serving, and the new URL serves
      nothing until Pages is redeployed (next phase, first item after access).

## Phase 3: first hour after the transfer

Work top to bottom; the order matters.

**1. Access for the interim maintainer**

- [ ] BCHC org owner: repository Settings → Collaborators and teams → add `@crypticpy` (or the
      maintainer team with `@crypticpy` in it) with role **Admin**. Maintain is not enough: it
      cannot manage secrets, Pages, rulesets, environments or Actions settings.
- [ ] Check: `gh api repos/<ORG>/bchc-ai-use-case-catalog/collaborators/crypticpy/permission --jq '{permission, role_name}'`
      shows `admin`.

**2. Bring the site back**

- [ ] Dispatch a deploy (the Build & Deploy workflow does not run the repository-identity check, so
      it works before the identity fix): `gh workflow run pages.yml -R <ORG>/bchc-ai-use-case-catalog`
- [ ] Watch it: `gh run list -R <ORG>/bchc-ai-use-case-catalog --workflow pages.yml --limit 1 --json status,conclusion,url --jq '.[0]'`
- [ ] Check Pages: `gh api repos/<ORG>/bchc-ai-use-case-catalog/pages --jq '{build_type, html_url, https_enforced, cname}'`
      shows `build_type: "workflow"` and `html_url: "https://<org>.github.io/bchc-ai-use-case-catalog/"`.
- [ ] `curl -sI https://<org>.github.io/bchc-ai-use-case-catalog/ | head -1` returns `200`.
      Until the identity fix lands, the site's GitHub links still say `crypticpy/...`; they work
      through the repository redirect.

**3. Identity-fix pull request**

Every pull request fails `npm run validate` in CI ("_data/site.yml github.repository matches this
repository") until this lands, so it goes first. It cannot be merged before the transfer.

- [ ] On a new branch, `fix/identity-<org>`, change:
      - `_data/site.yml`: `github.repository` (line 26) to `"<ORG>/bchc-ai-use-case-catalog"`, and the
        footer "Maintainer guide" URL (line 114) to `https://github.com/<ORG>/bchc-ai-use-case-catalog/blob/main/docs/admin-guide.md`
      - run `npm run generate`, which regenerates `.github/ISSUE_TEMPLATE/config.yml` and
        `assets/js/configurator/defaults.generated.js` from `site.yml` (never hand-edit those two)
      - `README.md`: the live-site link, the Submit form link, and the two issue-form links
        (feature request, Submit a use case) that name `crypticpy/bchc-ai-use-case-catalog` or
        `crypticpy.github.io`; and reword the "Ownership" paragraph from "is moving" to "has moved"
      - `docs/bchc/feature-ledger.md`: the feature-request link near the top
      - `docs/bchc/operations-inventory.yml`: `repository:` (line 2)
      - `.github/CODEOWNERS`: add `@<ORG>/<team>` alongside `@crypticpy` on each line (the team needs
        Write or higher on the repository for GitHub to honour it)
- [ ] Check nothing was missed: `grep -rn "crypticpy/bchc-ai-use-case-catalog\|crypticpy.github.io/bchc" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=_site .`
      Remaining hits should be only historical evidence links in `docs/bchc/` and template-owned
      files (`CHANGELOG.md`, `docs/*.md`, `CLAUDE.md`), which are fixed in PHCT, not here.
- [ ] `npm run validate` passes locally (the identity check is skipped outside Actions; CI runs it).
- [ ] Push, open the PR, wait for the seven required checks, resolve any threads, merge. The merge
      triggers Build & Deploy again.
- [ ] Check the committed identity: `gh api repos/<ORG>/bchc-ai-use-case-catalog/contents/_data/site.yml -H 'Accept: application/vnd.github.raw' | grep 'repository:'`

**4. Reissue the update token**

The existing `PHCT_UPDATE_TOKEN` is a fine-grained token whose resource owner is `crypticpy`, so it
no longer reaches this repository.

- [ ] Create a new fine-grained token (github.com → Settings → Developer settings → Fine-grained
      tokens): resource owner **`<ORG>`**, repository access **only `bchc-ai-use-case-catalog`**,
      permissions **Contents: Read and write**, **Pull requests: Read and write**, **Workflows: Read
      and write**, short expiry. GitHub only offers organizations you are a member of as the
      resource owner. In the longer run the token should belong to a BCHC-controlled account.
- [ ] If the org requires approval, the BCHC org owner approves it under Personal access tokens →
      Pending requests.
- [ ] Store it without the value passing through the AI assistant or a transcript: either repository
      Settings → Secrets and variables → Actions → `PHCT_UPDATE_TOKEN` → Update, or run
      `gh secret set PHCT_UPDATE_TOKEN -R <ORG>/bchc-ai-use-case-catalog` yourself and paste at the
      prompt.
- [ ] Check (names and dates only): `gh secret list -R <ORG>/bchc-ai-use-case-catalog`
- [ ] Revoke the old token under github.com → Settings → Developer settings → Fine-grained tokens.
- [ ] Record the token owner and expiry date outside this public repository.

**5. Repository settings survived**

- [ ] Homepage field: `gh repo edit <ORG>/bchc-ai-use-case-catalog --homepage https://<org>.github.io/bchc-ai-use-case-catalog/`
      then `gh repo view <ORG>/bchc-ai-use-case-catalog --json homepageUrl --jq .homepageUrl`
- [ ] Ruleset: `gh api repos/<ORG>/bchc-ai-use-case-catalog/rules/branches/main --jq '[.[].type]'`
      includes `deletion`, `non_fast_forward`, `pull_request`, `required_status_checks`; and
      `gh api repos/<ORG>/bchc-ai-use-case-catalog/rules/branches/main --jq '.[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'`
      lists the seven checks: Lint, test and build; Build every preset and module combination;
      Coverage evidence; Analyze javascript-typescript; Analyze ruby; scale; lint.
- [ ] Environment: `gh api repos/<ORG>/bchc-ai-use-case-catalog/environments --jq '.environments[] | {name, deployment_branch_policy}'`
      and `gh api repos/<ORG>/bchc-ai-use-case-catalog/environments/github-pages/deployment-branch-policies --jq '.branch_policies[].name'`
      shows `github-pages` limited to `main`.
- [ ] Actions: `gh api repos/<ORG>/bchc-ai-use-case-catalog/actions/permissions --jq '{enabled, allowed_actions, sha_pinning_required}'`
      shows `selected` and `true`;
      `gh api repos/<ORG>/bchc-ai-use-case-catalog/actions/permissions/selected-actions --jq '{github_owned_allowed, patterns_allowed}'`
      lists both patterns;
      `gh api repos/<ORG>/bchc-ai-use-case-catalog/actions/permissions/workflow`
      shows `default_workflow_permissions: "read"` and `can_approve_pull_request_reviews: true`.
      If the last is false, tick it in Settings → Actions → General (needs the org setting first).
- [ ] Variables: `gh variable list -R <ORG>/bchc-ai-use-case-catalog` is empty, as intended. Unset
      means `SUBMISSIONS_OPEN`, `CATALOG_METRICS`, `SECURITY_SIGNALS` and `VERIFICATION_SWEEP` are
      on and `CATALOG_SHOWCASE` is off (see `operations-inventory.yml`).
- [ ] Organization variables shared with this repository also reach the workflows, and the
      repository list above does not show them. Check they are empty too:
      `gh api repos/<ORG>/bchc-ai-use-case-catalog/actions/organization-variables --jq '.variables[].name'`.
      An inherited `SUBMISSIONS_OPEN=false` would silently close intake, and `CATALOG_SHOWCASE=true`
      would deploy the template showcase. If any appear, ask the org owner to remove this repository
      from that variable's access list, or set a repository variable of the same name, which wins.
- [ ] Security features:
      ```bash
      gh api repos/<ORG>/bchc-ai-use-case-catalog --jq '.security_and_analysis'
      gh api repos/<ORG>/bchc-ai-use-case-catalog/private-vulnerability-reporting --jq .enabled
      gh api repos/<ORG>/bchc-ai-use-case-catalog/automated-security-fixes --jq .enabled
      gh api repos/<ORG>/bchc-ai-use-case-catalog/vulnerability-alerts --silent && echo "Dependabot alerts on"
      ```
      Secret scanning and push protection `enabled`; the rest `true` / "on".
- [ ] No surprise hooks or keys: `gh api repos/<ORG>/bchc-ai-use-case-catalog/hooks --jq length` and
      `gh api repos/<ORG>/bchc-ai-use-case-catalog/keys --jq length` both `0`.
- [ ] Labels: Actions → **Bootstrap labels** → Run workflow (`gh workflow run bootstrap-labels.yml -R <ORG>/bchc-ai-use-case-catalog`).
      It is idempotent and its run summary includes a settings preflight. Then
      `gh label list -R <ORG>/bchc-ai-use-case-catalog --search "content:" --json name --jq '.[].name'`.
- [ ] If `@crypticpy` was made a temporary org Owner in Phase 1, the BCHC org owner changes the role back
      to Member now and re-checks the repository Admin role (item 1).

## Phase 4: before going into service

Not required in the meeting, but required before the handoff is called done.

- [ ] **Custom domain** (if chosen). DNS contact adds a `CNAME` record from the chosen host (e.g.
      `catalog.bigcitieshealth.org`) to `<org>.github.io`. Then, in one PR, add a `CNAME` file at the
      repository root containing only the host name (Build & Deploy reads it to set the site URL),
      and update the README links. Set the same host in Settings → Pages → Custom domain, wait for
      the certificate, tick **Enforce HTTPS**. Check with the `pages` command from Phase 3.
- [ ] **Name the roles.** Product owner and backup release maintainer go into `MAINTAINERS.md`,
      `.github/CODEOWNERS` and `docs/bchc/operations-inventory.yml` (`people:`), as real accounts,
      only after each person accepts. Step 1 of the maintaining checklist.
- [ ] **Require a human approval** once a second maintainer exists: Settings → Rules → Rulesets →
      `protect-main` → Require a pull request before merging → Required approvals **1**. Until then
      it stays at 0, or the only maintainer cannot merge.
- [ ] **Review tooling (optional).** No review bot is required and none is assumed. The Sourcery and
      Codex apps were installed on `@crypticpy`'s account and do not follow the repository. If BCHC
      has a Copilot plan that includes code review, request it per PR on code changes (Reviewers →
      Copilot). Do not turn on the ruleset option to request Copilot review automatically: it
      applies to every PR into `main`, including scaffolded content PRs, and because the ruleset
      requires conversation resolution, bot threads would block content merges (see the admin
      guide's note on review bots).
- [ ] **Update path end to end.** Actions → Update from PHCT → Run workflow with the next PHCT
      release tag, driven by the new maintainers. Re-running the current `v1.9.0` finishes green as
      "Already up to date" without exercising the token or the pull request step, so the full test
      waits for the next release. Step 11 of the maintaining checklist.
- [ ] **Drills.** Takedown, rollback, credential rotation and backup-restore, per step 12 of the
      maintaining checklist, run by the backup maintainer without live coaching.
- [ ] **Record it.** Update `docs/bchc/operations-inventory.yml`: `owner_transfer` and
      `credential_rotation` drills (date, result, evidence), `token_owner`, `token_expiry_reviewed`,
      `custom_domain` and its owners, `people`. Never record secret values.
- [ ] Update `docs/bchc/release-readiness-status.md` row RR-H04 when the roles are filled.

## Optional track: transferring PHCT

The template `crypticpy/phct` may also move to BCHC later. It is a separate decision and a separate
session, best done once the catalog transfer has been stable for a while. What it would touch:

- PHCT's own Pages site and showcase move to `https://<org>.github.io/phct/` (no redirect), and
  every link to it (this README, the admin guide links) needs updating.
- In PHCT itself: the template-repository setting, its own secrets, rulesets and identity fix, and
  the checks in `pages.yml`, `quality.yml` and `update-phct.yml` that name `crypticpy/phct`.
- In every downstream deployment, this one included: `.phct-version.json` and `.phct/ownership.yml`
  (which must agree) and the hardcoded `crypticpy/phct` URLs in `update-phct.yml`. GitHub redirects
  the clone URL, so updates keep working in the meantime, but the change should ship as a PHCT
  release that deployments consume normally, not as a hand edit here.

## Rollback: if something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| Transfer option does not list `<ORG>` | `@crypticpy` cannot create repositories in the org | Phase 1 repository-creation item, or temporary Owner role. |
| Wrong org, or BCHC wants to pause | Decision, not a fault | Transfer back: Settings → Danger Zone → Transfer to `crypticpy`. Needs Admin on the repo, and if the org disallows member transfers, an org owner does it. Then redeploy Pages. |
| Every PR fails "Lint, test and build" at validate | Identity check: `site.yml` still names `crypticpy` | Land the identity-fix PR (Phase 3, item 3). |
| New URL returns 404 | Pages not redeployed, or source not "GitHub Actions" | Settings → Pages → Source **GitHub Actions**; Settings → Environments → `github-pages` allows `main`; re-run `pages.yml`. |
| Build & Deploy fails at "Deploy" | Environment branch policy lost | Re-add `main` to the `github-pages` deployment branches. |
| Workflows fail at once saying an action is not allowed | Org Actions policy | Phase 1 Actions items. |
| Entry or update workflows fail opening a PR | "Allow GitHub Actions to create and approve pull requests" off at org or repo | Tick it at both levels. |
| "Analyze" checks fail after the move | Org code security configuration enabled CodeQL default setup | Settings → Code security → CodeQL analysis: switch the repository back from default to advanced setup. |
| Update from PHCT fails pushing | Old or unapproved token | Phase 3, item 4. |
| BCHC editors' issues are ignored by automation | Not org members or collaborators | Gated workflows accept OWNER, MEMBER or COLLABORATOR only; on an org repository nobody is OWNER, so editors must be org members or have repository access. |

## Prompts for the AI assistant

Copy these into Claude Code, replacing `<ORG>`. Each one is scoped so the assistant stays read-only
unless the prompt says otherwise.

- Phase 0: "Read-only: check crypticpy/bchc-ai-use-case-catalog is ready to transfer. List open PRs,
  non-main branches, and the last run of each workflow on main. Use narrow gh queries. Change
  nothing."
- Phase 1: "Read-only: verify the Phase 1 org settings in docs/bchc/transfer-runbook.md for <ORG>.
  Run the check commands there, report each item as ok / wrong / cannot see (needs org owner).
  Change nothing."
- Phase 2: "Read-only: confirm the repository now lives at <ORG>/bchc-ai-use-case-catalog, that the
  old name redirects, then update this checkout's origin remote to the new URL."
- Phase 3: "Prepare the identity-fix PR for <ORG> per Phase 3 item 3 of
  docs/bchc/transfer-runbook.md: branch, edits, npm run generate, npm run validate, and the leftover
  grep. Show me the diff and wait before pushing."
- Phase 3: "Read-only: run every check in Phase 3 item 5 of docs/bchc/transfer-runbook.md against
  <ORG>/bchc-ai-use-case-catalog and give me a pass/fail table."
- Any time: "The latest run of <workflow> on <ORG>/bchc-ai-use-case-catalog failed. Read its log and
  tell me the cause and the fix. Change nothing."

Never paste a token into the assistant, and do not ask it to create, set or read a secret value.
