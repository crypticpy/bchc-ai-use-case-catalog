# Supply-chain policy

PHCT releases block on high or critical npm or Ruby dependency advisories, an expired/incomplete
security exception, an unreviewed dependency license, or failure to generate the release SBOM.
The `Supply chain` workflow runs on every pull request and `main`, weekly, and on demand.

Controls:

- `npm ci` and `bundle install` resolve only the committed lockfiles, including Ruby gem checksums;
- `npm run security:audit` runs npm and Bundler audits against current advisory databases, blocks
  unregistered high/critical findings, and applies only exact active P2 exceptions;
- `quality/allowed-licenses.json` is fail-closed: a new or missing npm/gem license blocks review;
- `quality/vendored-assets.json` inventories copied JavaScript, generated icons, and bundled fonts
  by exact SHA-256, license, version, and notice section. `npm run licenses:check` rejects changed or
  missing files, unsafe or duplicate paths, missing attribution, and unreviewed licenses. It also
  independently discovers `_includes/icon.html` and recursively scans `assets/fonts/**/*.woff2`
  and `assets/js/**/*.min.js`, rejecting any copied/generated file omitted from the manifest. Keep
  the `.min.js` suffix on vendored JavaScript so this boundary stays explicit; project-authored
  source uses ordinary `.js` names;
- `npm run sbom` creates a deterministic CycloneDX 1.5 inventory from both lockfiles, consolidates
  repeated npm package/version entries while retaining their lockfile paths, assigns distinct
  package URLs to Ruby platform artifacts, and fails if any BOM reference is duplicated; and
- all GitHub Actions are full-SHA pinned and Dependabot proposes their updates.

GPL/LGPL dependencies presently approved are build/development tools, not code copied into the
published static site: `eventmachine` is dual GPL-2.0/Ruby licensed, `bundler-audit` is GPL-3.0,
and Sharp's libvips distribution accounts for the LGPL metadata in npm's tree. Any change to how
those packages are distributed requires a fresh license review.

The full license text, copyright, modification history, and upstream source for each shipped
third-party file are in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Keep that file with
source archives and built-site distributions. When a vendored file is regenerated or upgraded,
review the upstream license first, update its notice and manifest entry, then record the new digest;
never update a digest merely to make the check green.

## Exceptions

The default is zero. If a vulnerability cannot be patched immediately, add a narrowly identified
record to `quality/security-exceptions.yml` with the ecosystem (`npm` or `rubygems`), advisory ID,
exact package, `high` severity, `P2` priority, accountable GitHub owner/team, concrete reason and
mitigation, and an ISO expiry date. The register validator fails when a field is absent, the date
expires, or the record is duplicated. The audit matches all four identity fields and also fails
when a registered exception no longer matches a current finding, so stale waivers cannot remain
latent. Critical, unidentified, P0, and P1 findings cannot be waived. The pull request must link
the tracking issue and release approval.

## Release evidence

Download the `sbom-<sha>` artifact from the exact stable-tag workflow run and attach
`sbom.cdx.json` to the GitHub release. Record the CodeQL run, npm audit, Bundler audit, license
review, and exception count in the release notes. Organization administrators separately enable
secret scanning, push protection, Dependabot alerts, and private vulnerability reporting; those
settings cannot be enforced by repository files.
