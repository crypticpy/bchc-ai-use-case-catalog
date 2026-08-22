# BCHC AI Use Case Catalog maintainers

The BCHC AI Use Case Catalog is a BCHC-owned deployment of the PHCT open-source template. BCHC
owns the catalog's content, policy, branding, publication decisions, and operational access; shared
software fixes are developed and released in PHCT before this repository consumes them. Neither
project promises paid support, 24-hour response, or uninterrupted service.

## Current roles

| Role | Account | Responsibilities |
|---|---|---|
| Primary technical maintainer | `@crypticpy` | Shared code review, security triage, PHCT releases, CI, and protected BCHC updates. |
| BCHC product owner | To be named by BCHC before transfer | Content policy, demo/publication decisions, taxonomy, governance language, and final go/no-go. |
| Backup release maintainer | **Unassigned — release blocker** | Must be able to run a release, update BCHC, roll back, rotate credentials, and handle a takedown without the primary maintainer. |

The BCHC deployment is not ready for operational handoff while the backup role is unassigned. Add the
real GitHub account to `.github/CODEOWNERS`, branch rules, Pages/admin access, and this table only
after that person accepts the role and completes the drills in `docs/maintaining.md`.

## Decision and access rules

- Two approvals are required for shared workflow, security, dependency, ownership, or release
  changes once the backup is assigned.
- The BCHC product owner approves public content and policy; technical maintainers do not silently
  rewrite adopted governance.
- No shared code change begins in this repository. Reproduce and fix it in PHCT, release it, then consume the
  immutable release downstream.
- Maintainer access is individual, least-privilege, protected by MFA, and reviewed quarterly. Do
  not share accounts, personal access tokens, recovery codes, or signing keys.
- A maintainer stepping down transfers open incidents and releases, removes their credentials,
  and identifies whether another accepted maintainer covers each role.

See `SUPPORT.md` for response expectations, `SECURITY.md` for private reports, and
`docs/maintaining.md` for the operating and succession runbook.
