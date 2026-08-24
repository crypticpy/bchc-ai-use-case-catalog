const REPOSITORY = /^[\w.-]+\/[\w.-]+$/u;

/** @returns {boolean} whether a value is a complete owner/repository identity. */
export function isRepositoryIdentity(value) {
  return REPOSITORY.test(String(value ?? '').trim());
}

/**
 * Render the issue chooser from deployment-owned repository identity.
 *
 * The chooser itself is protected during a PHCT update, so the updater runs
 * this generator after reconciliation to migrate its structure without
 * replacing the deployment's identity or content.
 */
export function renderIssueChooser(repository, branch = 'main') {
  const configuredRepository = String(repository ?? '').trim();
  if (!isRepositoryIdentity(configuredRepository)) {
    throw new Error('github.repository must use the owner/repository form');
  }
  const configuredBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const branchPath = configuredBranch.split('/').map(encodeURIComponent).join('/');

  return `# Generated from _data/site.yml by scripts/generate.mjs — do not hand-edit.
# Regenerate with \`npm run generate\` after changing github.repository, github.branch, or PHCT.
blank_issues_enabled: false
contact_links:
  - name: Report a security vulnerability privately
    url: https://github.com/${configuredRepository}/security/advisories/new
    about: Never put credentials, personal information, PHI, private URLs, or exploit details in a public issue.
  - name: Security reporting help
    url: https://github.com/${configuredRepository}/blob/${branchPath}/SECURITY.md
    about: Use the documented private email fallback if private vulnerability reporting is not available.
  - name: Maintainer guide
    url: https://github.com/${configuredRepository}/blob/${branchPath}/docs/admin-guide.md
    about: How submissions become pull requests, how to review them, and how to configure the site.
  - name: Launch checklist
    url: https://github.com/${configuredRepository}/blob/${branchPath}/docs/launch.md
    about: Setting this catalog up for the first time — settings, the /setup/ wizard, and clearing the demo content.
`;
}
