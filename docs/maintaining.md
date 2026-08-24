# Maintainer operations and handoff

This is the routine and emergency runbook for people who did not build PHCT. Commands are the
developer/recovery path; the GitHub interface is the normal BCHC path. Never paste a secret into
an issue, pull request, document, Actions input, or terminal transcript.

## The two repositories

- `crypticpy/phct` owns reusable layouts, scripts, workflows, tests, presets, docs, and releases.
- `crypticpy/bchc-ai-use-case-catalog` owns BCHC identity, policy, configuration, content, media,
  and its `.phct-version.json` lock.
- Generic defects discovered in BCHC are fixed and released in PHCT first. BCHC then consumes the
  immutable tag through **Actions → Update from PHCT**.

If a file's owner is uncertain, run `npm run ownership:check` and inspect `.phct/ownership.yml`
before editing. Do not resolve an update conflict by casually choosing “theirs” for `_data/`,
content, images, or `docs/bchc/`.

## Routine operating schedule

### Each content pull request

1. Confirm the submitter and links are appropriate for publication.
2. Check the generated review criteria, closer-review labels, plain language, alt text, licensing,
   and absence of PII/PHI, credentials, or non-public data.
3. Require **Validate Content** and **Quality** on the latest commit.
4. Preview changed pages; approve and merge only when another reviewer could understand the diff.
5. Confirm **Build & Deploy** succeeds and the published entry/search/feed work.

### Weekly

- Triage bug, accessibility, dependency, CodeQL, failed workflow, and security notifications.
- Review Dependabot in PHCT first. Never merge an update only because a bot opened it.
- Check the BCHC Actions page for scheduled failures and confirm the demo banner is still accurate.

### Monthly

- Complete the verification-sweep issue and confirm catalog metrics were updated.
- Test one submission through issue → pull request → checks → merge → deploy → notification using
  fictional/public data, then remove or clearly label the test entry.
- Check Pages, custom domain, repository variables, expiring tokens, security reporting, and both
  named maintainers against `docs/bchc/operations-inventory.yml`.

### Quarterly

- Run the 0/1/10/100/500/1,000 performance matrix, its supported-scale Chrome interaction gate,
  and the browser/accessibility sample.
- Download a backup, run a rollback rehearsal, and test the protected-content checksum workflow.
- Review access, branch rules, Actions permissions, secrets/variables, DNS ownership, and the
  primary/backup succession plan. Remove access no longer needed.

## PHCT release procedure

1. Create a release branch and update `package.json`, lock metadata, `CHANGELOG.md`, migration
   notes, and the release-readiness evidence.
2. Run `npm run verify`; then pa11y, assistive-technology flows, both Lighthouse lanes, the full
   performance matrix, CodeQL, supply-chain checks, workflow lint, and link checks.
3. Build the PHCT landing page and every preset from the candidate commit. Retain the artifacts.
4. Tag the commit `vNEXT-rc.1` and publish candidate notes with the full SHA and rollback point.
5. Confirm the downstream `PHCT_UPDATE_TOKEN` is present and unexpired when the release changes
   `.github/workflows`. In BCHC, run **Update from PHCT** with that exact candidate tag. Review its
   checksum evidence, preview, migrations, and full downstream checks. Perform the real
   issue-to-deploy rehearsal.
6. Fix compatibility failures in PHCT and issue `rc.2`; do not patch generic code in BCHC.
7. Only after BCHC is green, put stable `vNEXT` on the same audited PHCT commit and attach the
   CycloneDX SBOM. Run the updater once more for the stable lock, approve, and deploy BCHC.
8. Record stable tag/SHA, SBOM, BCHC lock/deploy SHA, checks, approvers, and rollback point in the
   release notes. Observe at least one business day before closing the release record.

Bots may open release/update pull requests but may never approve or merge them.

## Rollback

### Before an update pull request merges

Close the pull request and delete its machine branch. The published site has not changed.

### After a BCHC update merges

1. Open the update pull request and identify its merge commit and the previous
   `.phct-version.json` release/SHA.
2. Use GitHub's **Revert** button, or create a branch and run `git revert -m 1 <merge-commit>`.
3. Require normal checks and human approval on the revert pull request.
4. Merge, confirm Pages redeploys, and verify home, catalog, search, submission, governance, and
   the affected feature.
5. Open a PHCT incident/defect with the exact candidate SHA. Do not re-run the failed update until
   PHCT publishes a corrected candidate.

Never delete history or force-push `main` as rollback. For published sensitive data, follow
`docs/incidents.md`; a normal revert does not remove the material from Git history or caches.

## Backup and restore

- A Git clone with all branches/tags is the source backup; Pages output alone cannot restore issue
  history, settings, secrets, branch rules, Discussions, or DNS.
- Export/record repository settings and issue/PR metadata using organization-approved tools. Store
  backups in an access-controlled BCHC location, not in this public repository.
- Quarterly, create a private throwaway repository, restore the code and required settings from the
  inventory, build Pages, and verify a fictional submission and rollback. Delete it through the
  organization's normal recoverable process after evidence is retained.

## Ownership transfer checklist

Before transfer, the receiving organization names the product owner and backup release maintainer
in `MAINTAINERS.md` and `.github/CODEOWNERS`. With both people present:

- confirm admin access, MFA/recovery, repository visibility, default branch, branch rules, tag
  rules, Actions workflow permissions, Pages source/environment, custom domain/DNS, environments,
  variables, secrets, labels, Discussions, private vulnerability reporting, secret scanning,
  Dependabot, and CodeQL;
- replace personal/bot tokens with organization-owned, least-privilege, expiring credentials;
- update repository URLs and contact data through the setup workflow, then regenerate outputs;
- confirm PHCT remains the upstream source and run one candidate update without primary-developer
  coaching; and
- run takedown, rollback, credential rotation, and backup-restore drills. Record only outcomes and
  dates—never secret values—in the downstream operations inventory.

Transfer is incomplete until the new backup maintainer can perform all four drills from these
documents without live coaching.

## When to escalate

- Stop publication for suspected credentials, PII/PHI, arbitrary execution, permission bypass,
  destructive loss, or a broken default-branch protection rule.
- Stop the wider demo for a failed submission/deploy/update path, inaccessible critical task,
  unsupported browser failure, checksum mismatch, or release performance gate.
- Use private vulnerability reporting for security defects and the incident runbook for urgent
  content. Ordinary support expectations are in `SUPPORT.md`.
