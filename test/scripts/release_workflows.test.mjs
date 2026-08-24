import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function workflow(name) {
  return fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
}

test('the PHCT updater bootstraps a missing lock and refuses an inconsistent existing lock', () => {
  const source = workflow('update-phct.yml');
  assert.match(source, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(source, /if \[ -f \.phct-version\.json \]/);
  assert.match(source, /'v' \+ require\('\.\/package\.json'\)\.version/);
  assert.match(source, /lock_state=bootstrapped/);
  assert.match(source, /refs\/phct-update\/from\/\$from/);
  assert.match(source, /refs\/phct-update\/to\/\$RELEASE/);
  assert.match(source, /resolved_from=.*git rev-parse/);
  assert.match(source, /\[ -n "\$locked_commit" \].*\[ "\$resolved_from" != "\$locked_commit" \]/);
  assert.match(source, /from_commit=%s/);
  assert.match(source, /first lock-aware update/);
  assert.match(source, /FROM_REF: \$\{\{ steps\.release\.outputs\.from_ref \}\}/);
  assert.match(source, /--from "\$FROM_REF" --to "\$TAG_REF"/);
  const apply = source.indexOf('Apply the immutable PHCT candidate');
  const candidateRuby = source.indexOf('Setup candidate Ruby from the applied .ruby-version');
  const candidateNode = source.indexOf('Setup candidate Node from the applied .node-version');
  assert.match(source, /apply_phct_update\.mjs --from "\$FROM_REF" --to "\$TAG_REF"/);
  assert.doesNotMatch(source, /allow-unrelated-histories/);
  assert.ok(apply >= 0 && candidateRuby > apply && candidateNode > candidateRuby);
});

test('the PHCT updater preserves review evidence and never blindly overwrites a branch', () => {
  const source = workflow('update-phct.yml');
  assert.match(source, /deployment-protected-before\.json/);
  assert.match(source, /deployment-protected-after\.json/);
  assert.match(source, /push --force-with-lease/u);
  assert.doesNotMatch(source, /git push --force origin/);
  assert.match(source, /BASE_BRANCH: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(source, /gh pr list --head "\$BRANCH" --state open/);
  assert.match(source, /gh pr create --base "\$BASE_BRANCH"/);
});

test('workflow-file updates require a dedicated credential and publish from a clean runner', () => {
  const source = workflow('update-phct.yml');
  const publishStart = source.indexOf('\n  publish:');
  const updateJob = source.slice(source.indexOf('\n  update:'), publishStart);
  const publishJob = source.slice(publishStart);
  const checkout = source.slice(
    source.indexOf('- name: Checkout downstream repository'),
    source.indexOf('- name: Setup Node from .node-version')
  );
  const apply = source.indexOf('Apply the immutable PHCT candidate');
  const preflight = source.indexOf('Require a workflow-capable token when workflows change');
  const candidateRuby = source.indexOf('Setup candidate Ruby from the applied .ruby-version');
  const verify = source.indexOf('Run every non-browser release gate');

  assert.ok(publishStart > verify, 'publication must be a separate job after candidate verification');
  assert.match(checkout, /token: \$\{\{ secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(checkout, /persist-credentials: false/u);
  assert.doesNotMatch(checkout, /PHCT_UPDATE_TOKEN/u);
  assert.match(updateJob, /permissions:\n\s+contents: read/u);
  assert.doesNotMatch(updateJob, /secrets\.PHCT_UPDATE_TOKEN \|\| secrets\.GITHUB_TOKEN/u);
  assert.match(
    source,
    /workflow_changes=.*git status --porcelain --untracked-files=all -- \.github\/workflows/u
  );
  assert.match(source, /UPDATE_TOKEN_CONFIGURED: \$\{\{ secrets\.PHCT_UPDATE_TOKEN != '' \}\}/u);
  assert.match(source, /\[ "\$UPDATE_TOKEN_CONFIGURED" = "true" \]/u);
  assert.match(source, /PHCT_UPDATE_TOKEN required/u);
  assert.match(source, /GitHub's built-in Actions token cannot push/u);
  assert.match(updateJob, /git -c core\.hooksPath=\/dev\/null commit --no-verify/u);
  assert.match(updateJob, /git bundle create/u);
  assert.match(updateJob, /name: phct-publication-\$\{\{ steps\.release\.outputs\.release \}\}/u);

  assert.match(publishJob, /needs: update/u);
  assert.match(publishJob, /Checkout the trusted downstream base on a fresh runner/u);
  assert.match(publishJob, /persist-credentials: false/u);
  assert.match(publishJob, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/u);
  assert.match(publishJob, /digest-mismatch: error/u);
  assert.match(publishJob, /Verify the exact bundled candidate without checking it out/u);
  assert.match(publishJob, /actual=.*refs\/phct-publish\/candidate\^\{commit\}/u);
  assert.match(publishJob, /\[ "\$actual" != "\$EXPECTED_COMMIT" \]/u);
  assert.doesNotMatch(publishJob, /^\s+(?:npm ci|npm run|node scripts\/)\b/mu);
  assert.match(publishJob, /PUSH_TOKEN: \$\{\{ secrets\.PHCT_UPDATE_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(publishJob, /GIT_ASKPASS="\$askpass" GIT_TERMINAL_PROMPT=0/u);
  assert.match(
    publishJob,
    /git -c core\.hooksPath=\/dev\/null -c credential\.helper= \\\n\s+push --force-with-lease origin/u
  );
  assert.doesNotMatch(source, /https:\/\/x-access-token:/u);
  assert.match(publishJob, /GH_TOKEN: \$\{\{ secrets\.PHCT_UPDATE_TOKEN \|\| secrets\.GITHUB_TOKEN \}\}/u);
  assert.match(source, /UPDATE_TOKEN_CONFIGURED: \$\{\{ secrets\.PHCT_UPDATE_TOKEN != '' \}\}/u);
  assert.doesNotMatch(source, /secrets\.CONTENT_BOT_TOKEN/u);
  assert.ok(apply >= 0 && preflight > apply && candidateRuby > preflight);
});

test('a built-in-token update dispatches stable entrypoints that fan out to every release gate', () => {
  const updater = workflow('update-phct.yml');
  assert.match(updater, /for workflow in validate\.yml quality\.yml/u);
  assert.doesNotMatch(
    updater,
    /for workflow in[^\n]*(?:performance|supply-chain|codeql)\.yml/u,
    'the updater cannot dispatch a workflow absent from an older default branch'
  );

  const validate = workflow('validate.yml');
  for (const name of ['performance.yml', 'supply-chain.yml', 'codeql.yml']) {
    assert.match(validate, new RegExp(`uses: \\.\\/.github/workflows/${name.replace('.', '\\.')}`, 'u'));
    assert.match(workflow(name), /workflow_call:/u, `${name} cannot be called by validate.yml`);
  }
  assert.match(validate, /needs: \[checks, build-matrix, coverage, performance, supply-chain, codeql\]/u);
});

test('validation enforces coverage floors and always retains the evidence', () => {
  const source = workflow('validate.yml');
  const start = source.indexOf('\n  coverage:');
  const end = source.indexOf('\n  performance:', start);
  assert.ok(start >= 0 && end > start, 'validate.yml has no bounded coverage job');
  const coverage = source.slice(start, end);
  assert.match(coverage, /name: Coverage evidence/u);
  assert.match(coverage, /name: Setup Ruby\n\s+uses: ruby\/setup-ruby@/u);
  assert.match(coverage, /run: npm run coverage/u);
  assert.match(coverage, /name: Upload coverage evidence\n\s+if: \$\{\{ always\(\) \}\}/u);
  assert.match(coverage, /path: coverage\//u);
  assert.match(coverage, /if-no-files-found: warn/u);
});
test('release performance always exercises the complete deterministic matrix', () => {
  const source = workflow('performance.yml');
  assert.match(source, /DISPATCH_COUNTS:-0,1,10,100,500,1000/);
  assert.match(source, /--site-output "\$PERFORMANCE_SITE"/);
  assert.match(source, /npm run performance:interactions/);
  assert.match(source, /PUPPETEER_SKIP_DOWNLOAD: "1"/);
  assert.match(source, /push:\n\s+branches: \[main\]/);
  assert.doesNotMatch(source, /pull_request:\n\s+paths:/);
});

test('the canonical PHCT Pages and quality workflows cannot silently skip the showcase', () => {
  for (const name of ['pages.yml', 'quality.yml']) {
    const source = workflow(name);
    assert.match(source, /REPOSITORY: \$\{\{ github\.repository \}\}/);
    assert.match(source, /"\$REPOSITORY" == "crypticpy\/phct"/);
    assert.match(source, /"\$CATALOG_SHOWCASE" == "true"/);
  }
});

test('machine-maintained branches use lease-protected force pushes', () => {
  for (const name of ['apply-setup.yml', 'new-entry.yml']) {
    const source = workflow(name);
    assert.doesNotMatch(source, /git push --force origin/);
    assert.match(source, /git push --force-with-lease origin/);
  }

  const updater = workflow('update-phct.yml');
  assert.doesNotMatch(updater, /git push --force /u);
  assert.match(updater, /push --force-with-lease origin/u);
});

test('every npm dependency install selects the exact package manager after setup-node', () => {
  const directory = path.join(ROOT, '.github', 'workflows');
  for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.yml'))) {
    const source = workflow(name);
    for (const match of source.matchAll(/^\s+(?:run:\s*)?npm ci\b/gmu)) {
      const cursor = match.index;
      const setup = source.lastIndexOf('actions/setup-node@', cursor);
      const exact = source.lastIndexOf('node scripts/install_exact_npm.mjs', cursor);
      assert.ok(setup >= 0 && exact > setup, `${name} runs npm ci without selecting exact npm`);
    }
  }
});
