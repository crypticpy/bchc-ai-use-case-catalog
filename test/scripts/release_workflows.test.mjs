import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function workflow(name) {
  return fs.readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8');
}

function workflowStepScript(name, jobName, stepName) {
  const parsed = YAML.parse(workflow(name));
  const step = parsed.jobs[jobName].steps.find((candidate) => candidate.name === stepName);
  assert.ok(step?.run, `${name} has no ${stepName} script`);
  return step.run;
}

function runUpdaterDispatch({ failWorkflow = '', failAttempts = 0 } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-dispatch-test-'));
  const bin = path.join(directory, 'bin');
  const state = path.join(directory, 'state');
  const summary = path.join(directory, 'summary.md');
  fs.mkdirSync(bin);
  fs.mkdirSync(state);

  fs.writeFileSync(
    path.join(bin, 'timeout'),
    `#!/bin/sh
[ "$1" = "--signal=TERM" ] || exit 90
[ "$2" = "45s" ] || exit 91
shift 2
exec "$@"
`
  );
  fs.writeFileSync(
    path.join(bin, 'sleep'),
    `#!/bin/sh
exit 0
`
  );
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/bin/sh
workflow="$3"
count_file="$FAKE_GH_STATE/$workflow"
count=0
[ ! -f "$count_file" ] || count="$(cat "$count_file")"
count=$((count + 1))
printf '%s\n' "$count" > "$count_file"
if [ "$workflow" = "$FAKE_FAIL_WORKFLOW" ] && [ "$count" -le "$FAKE_FAIL_ATTEMPTS" ]; then
  echo "simulated GitHub API failure for $workflow" >&2
  exit 1
fi
exit 0
`
  );
  for (const command of ['timeout', 'sleep', 'gh']) {
    fs.chmodSync(path.join(bin, command), 0o755);
  }

  const result = spawnSync(
    'bash',
    [
      '-c',
      workflowStepScript(
        'update-phct.yml',
        'publish',
        'Dispatch checks when the built-in token opened the pull request'
      ),
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        UPDATE_TOKEN_CONFIGURED: 'false',
        BRANCH: 'upgrade/phct-v1.9.0-rc.3',
        PR_URL: 'https://github.com/example/catalog/pull/42',
        GITHUB_STEP_SUMMARY: summary,
        RUNNER_TEMP: directory,
        FAKE_GH_STATE: state,
        FAKE_FAIL_WORKFLOW: failWorkflow,
        FAKE_FAIL_ATTEMPTS: String(failAttempts),
      },
    }
  );

  const captured = {
    ...result,
    calls: Object.fromEntries(
      fs
        .readdirSync(state)
        .map((workflowName) => [
          workflowName,
          Number(fs.readFileSync(path.join(state, workflowName), 'utf8').trim()),
        ])
    ),
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
  };
  fs.rmSync(directory, { force: true, recursive: true });
  return captured;
}

/**
 * Run the release-resolution step against a fake `git` whose only knowledge of
 * the template repository is the tag → commit map passed in, so every
 * fail-closed branch can be observed exactly as a deployment owner sees it.
 */
function runReleaseStep({ release, tags = {}, lock = null, packageVersion = '1.9.0' }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-release-test-'));
  const bin = path.join(directory, 'bin');
  const state = path.join(directory, 'state');
  const repository = path.join(directory, 'repository');
  const summary = path.join(directory, 'summary.md');
  const output = path.join(directory, 'output.env');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(state, 'tags'), { recursive: true });
  fs.mkdirSync(repository);

  for (const [tag, commit] of Object.entries(tags)) {
    fs.writeFileSync(path.join(state, 'tags', tag), `${commit}\n`);
  }
  fs.writeFileSync(
    path.join(repository, 'package.json'),
    `${JSON.stringify({ name: 'downstream', version: packageVersion }, null, 2)}\n`
  );
  if (lock) {
    fs.writeFileSync(path.join(repository, '.phct-version.json'), `${JSON.stringify(lock, null, 2)}\n`);
  }

  fs.writeFileSync(
    path.join(bin, 'git'),
    `#!/bin/sh
state="$FAKE_GIT_STATE"
case "$1" in
  remote) exit 0 ;;
  fetch)
    for arg in "$@"; do refspec="$arg"; done
    tag="\${refspec%%:*}"
    tag="\${tag#refs/tags/}"
    ref="\${refspec#*:}"
    if [ ! -f "$state/tags/$tag" ]; then
      echo "fatal: couldn't find remote ref refs/tags/$tag" >&2
      exit 128
    fi
    mkdir -p "$state/refs"
    cp "$state/tags/$tag" "$state/refs/$(printf '%s' "$ref" | tr '/' '_')"
    exit 0 ;;
  rev-parse)
    ref="$(printf '%s' "$2" | sed 's/\\^{commit}$//')"
    file="$state/refs/$(printf '%s' "$ref" | tr '/' '_')"
    [ -f "$file" ] || { echo "fatal: bad revision '$2'" >&2; exit 128; }
    cat "$file"
    exit 0 ;;
esac
exit 99
`
  );
  fs.chmodSync(path.join(bin, 'git'), 0o755);

  const result = spawnSync(
    'bash',
    ['-c', workflowStepScript('update-phct.yml', 'update', 'Fetch and resolve the exact PHCT tag')],
    {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RELEASE: release,
        FAKE_GIT_STATE: state,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_OUTPUT: output,
      },
    }
  );

  const captured = {
    ...result,
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
    outputs: Object.fromEntries(
      (fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    ),
  };
  fs.rmSync(directory, { force: true, recursive: true });
  return captured;
}

/** Run the commit step inside a real, clean repository: nothing to commit. */
function runCandidateStepOnUnchangedTree() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-candidate-test-'));
  const repository = path.join(directory, 'repository');
  const summary = path.join(directory, 'summary.md');
  const output = path.join(directory, 'output.env');
  fs.mkdirSync(repository);
  const git = (...args) => spawnSync('git', args, { cwd: repository, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  fs.writeFileSync(path.join(repository, 'README.md'), 'downstream\n');
  git('add', '-A');
  git('commit', '-qm', 'base');

  const result = spawnSync(
    'bash',
    [
      '-c',
      workflowStepScript(
        'update-phct.yml',
        'update',
        'Commit the verified candidate and create its publication bundle'
      ),
    ],
    {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...process.env,
        BRANCH: 'upgrade/phct-v1.9.0',
        RELEASE: 'v1.9.0',
        PARENT_COMMIT: 'a'.repeat(40),
        RUNNER_TEMP: directory,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_OUTPUT: output,
      },
    }
  );

  const captured = {
    ...result,
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
    outputs: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
  };
  fs.rmSync(directory, { force: true, recursive: true });
  return captured;
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
  assert.match(source, /first update that records which template release/);
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

test('the updater retries transient check-dispatch failures before reporting success', () => {
  const result = runUpdaterDispatch({ failWorkflow: 'quality.yml', failAttempts: 2 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls, { 'quality.yml': 3, 'validate.yml': 1 });
  assert.match(result.summary, /Quality were dispatched/u);
  assert.doesNotMatch(result.summary, /Do not merge/u);
});

test('the updater fails safely with actionable recovery when a required dispatch never starts', () => {
  const result = runUpdaterDispatch({ failWorkflow: 'quality.yml', failAttempts: 3 });
  assert.equal(result.status, 1);
  assert.deepEqual(result.calls, { 'quality.yml': 3, 'validate.yml': 1 });
  assert.match(result.stderr, /simulated GitHub API failure/u);
  assert.match(result.stdout, /::error title=Required update checks were not dispatched/u);
  assert.match(
    result.summary,
    /^The verified update pull request already exists: https:\/\/github\.com\/example\/catalog\/pull\/42$/mu
  );
  assert.match(result.summary, /Main is unchanged\. Do not merge/u);
  assert.match(result.summary, /quality\.yml/u);
  assert.match(result.summary, /Actions → Quality \(a11y \+ Lighthouse\) → Run workflow/u);
  assert.match(result.summary, /API outage or rate limit/u);
  assert.match(result.summary, /safely updates the same branch and pull request/u);
});

const LOCKED_COMMIT = 'a'.repeat(40);
const MOVED_COMMIT = 'c'.repeat(40);
const TARGET_COMMIT = 'd'.repeat(40);

function versionLock(release, commit) {
  return {
    schema_version: 1,
    source_repository: 'https://github.com/crypticpy/phct',
    release,
    version: release.slice(1),
    commit,
    recorded_at: '2026-08-01',
  };
}

test('a rejected release tag explains itself without echoing a forged workflow command', () => {
  const malformed = runReleaseStep({ release: 'release-1.9' });
  assert.equal(malformed.status, 2);
  assert.match(malformed.stdout, /::error title=That is not a PHCT release tag/u);
  assert.match(malformed.summary, /## That is not a PHCT release tag/u);
  assert.match(malformed.summary, /Nothing was changed\./u);
  assert.match(malformed.summary, /You entered `release-1\.9`/u);
  assert.ok(malformed.summary.includes('https://github.com/crypticpy/phct/releases'));

  const forged = runReleaseStep({ release: '`v1.9.0`\n::error::forged' });
  assert.equal(forged.status, 2);
  assert.doesNotMatch(forged.summary, /::error::forged/u);
  assert.doesNotMatch(forged.stdout, /^::error::forged/mu);
  assert.match(forged.summary, /You entered `\?v1\.9\.0\?+error\?+forged`/u);

  // The gate matches the whole input, not the first line: a valid tag with a
  // trailing payload must never reach the release= output write.
  const multiline = runReleaseStep({ release: 'v1.9.0\nbranch=evil', tags: { 'v1.9.0': 'a'.repeat(40) } });
  assert.equal(multiline.status, 2);
  assert.match(multiline.summary, /## That is not a PHCT release tag/u);
  assert.deepEqual(multiline.outputs, {}, 'nothing may be written to GITHUB_OUTPUT on rejection');
});

test('a bootstrap run whose reported version was never released says what to do next', () => {
  const result = runReleaseStep({
    release: 'v1.9.0',
    packageVersion: '1.10.0',
    tags: { 'v1.9.0': TARGET_COMMIT },
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /::error title=This copy reports a template version that has no release/u);
  assert.match(result.summary, /This copy reports template version `v1\.10\.0`, but no such release exists/u);
  assert.match(result.summary, /created between releases/u);
  assert.ok(result.summary.includes('https://github.com/crypticpy/phct/releases'));
  assert.ok(result.summary.includes('https://github.com/crypticpy/phct/issues'));
  assert.match(result.summary, /Nothing was changed\./u);
});

test('a recorded starting release that disappeared is reported to the maintainers', () => {
  const result = runReleaseStep({
    release: 'v1.9.0',
    packageVersion: '1.8.0',
    lock: versionLock('v1.8.0', LOCKED_COMMIT),
    tags: { 'v1.9.0': TARGET_COMMIT },
  });
  assert.equal(result.status, 2);
  assert.match(result.summary, /## The release this deployment records has disappeared/u);
  assert.ok(result.summary.includes('https://github.com/crypticpy/phct/issues'));
});

test('an unknown target release names the tag and points at the releases page', () => {
  const result = runReleaseStep({
    release: 'v9.9.9',
    packageVersion: '1.9.0',
    tags: { 'v1.9.0': TARGET_COMMIT },
  });
  assert.equal(result.status, 2);
  assert.match(result.summary, /## There is no PHCT release named `v9\.9\.9`/u);
  assert.match(result.summary, /Nothing was changed\./u);
  assert.ok(result.summary.includes('https://github.com/crypticpy/phct/releases'));
});

test('a moved tag is still refused, now with both commits and who to tell', () => {
  const result = runReleaseStep({
    release: 'v1.9.0',
    packageVersion: '1.8.0',
    lock: versionLock('v1.8.0', LOCKED_COMMIT),
    tags: { 'v1.8.0': MOVED_COMMIT, 'v1.9.0': TARGET_COMMIT },
  });
  assert.equal(result.status, 2);
  assert.match(result.stdout, /::error title=The recorded template release no longer matches/u);
  assert.match(result.summary, /## The update was refused for safety/u);
  assert.match(result.summary, new RegExp(LOCKED_COMMIT, 'u'));
  assert.match(result.summary, new RegExp(MOVED_COMMIT, 'u'));
  assert.match(result.summary, /Do not merge any template update/u);
  assert.ok(result.summary.includes('https://github.com/crypticpy/phct/issues'));
});

test('a consistent lock resolves both immutable tags and reports nothing to the owner', () => {
  const result = runReleaseStep({
    release: 'v1.9.0',
    packageVersion: '1.8.0',
    lock: versionLock('v1.8.0', LOCKED_COMMIT),
    tags: { 'v1.8.0': LOCKED_COMMIT, 'v1.9.0': TARGET_COMMIT },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.summary, '');
  assert.deepEqual(result.outputs, {
    release: 'v1.9.0',
    tag_ref: 'refs/phct-update/to/v1.9.0',
    commit: TARGET_COMMIT,
    from: 'v1.8.0',
    from_commit: LOCKED_COMMIT,
    from_ref: 'refs/phct-update/from/v1.8.0',
    lock_state: 'verified',
    branch: 'upgrade/phct-v1.9.0',
  });
});

test('a deployment that already runs the release finishes green with nothing to do', () => {
  const result = runCandidateStepOnUnchangedTree();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::notice title=Already up to date/u);
  assert.match(
    result.summary,
    /Already up to date — this deployment already runs `v1\.9\.0`\. Nothing to do\./u
  );
  assert.match(result.summary, /created no branch and no pull request/u);
  assert.match(result.summary, /This run succeeded/u);
  assert.match(result.outputs, /^up_to_date=true$/mu);
});

test('the updater tells a site owner where the tags, the preview and the checks are', () => {
  const source = workflow('update-phct.yml');
  assert.match(
    source,
    /description: Exact PHCT release tag, e\.g\. v1\.9\.0 — copy it from https:\/\/github\.com\/crypticpy\/phct\/releases/u
  );
  // An "already up to date" run has no candidate commit to publish, and must
  // not drag the publication job into a red run.
  assert.match(
    source,
    /if: needs\.update\.result == 'success' && needs\.update\.outputs\.candidate_commit != ''/u
  );
  assert.match(source, /if: steps\.candidate\.outputs\.up_to_date != 'true'/u);
  assert.match(source, /The update's full test suite failed on the candidate\. Nothing was published/u);
  assert.match(
    source,
    /report it to the template maintainers at https:\/\/github\.com\/crypticpy\/phct\/issues/u
  );

  // The pull request is read by the deployment owner, not a release engineer.
  assert.match(source, /find `%s`, and check the commit shown beside the tag starts with `%\.7s`/u);
  assert.match(source, /Read the release notes: https:\/\/github\.com\/crypticpy\/phct\/releases\/tag\/%s/u);
  assert.match(source, /Every check in the Checks box on this pull request shows a green tick/u);
  assert.match(source, /Download the site preview \(the `phct-update-%s` artifact\)/u);
  assert.match(source, /run_url="\$GITHUB_SERVER_URL\/\$GITHUB_REPOSITORY\/actions\/runs\/\$GITHUB_RUN_ID"/u);
  assert.doesNotMatch(source, /release-candidate rehearsal/u);
  assert.doesNotMatch(source, /Confirm Validate Content, Quality, Performance/u);
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

// The content workflows are the only interface a non-coder has. A run that goes
// red without saying anything on the issue is indistinguishable, from the
// submitter's side, from a submission nobody read — so every one of them has to
// answer on both paths.
test('every issue-driven content workflow answers on the issue, in success and in failure', () => {
  const contentWorkflows = [
    'apply-setup.yml',
    'new-entry.yml',
    'new-event.yml',
    'new-year.yml',
    'update-event-attachments.yml',
    'update-schedule.yml',
  ];

  for (const name of contentWorkflows) {
    const source = workflow(name);
    const parsed = YAML.parse(source);
    const steps = Object.values(parsed.jobs).flatMap((job) => job.steps ?? []);

    const success = steps.filter(
      (step) => /^(Link the pull request|Say the pull request was updated)/u.test(step.name ?? '') && step.if
    );
    assert.ok(success.length > 0, `${name} never links the pull request back to the issue`);

    // The catch-all: a refused push or a refused `create-pull-request` (the
    // repository setting below) must not leave the issue silent.
    const catchAll = steps.find((step) => /failure\(\)/u.test(String(step.if ?? '')));
    assert.ok(catchAll, `${name} has no if: failure() comment step`);
    assert.match(
      String(catchAll.with?.script ?? ''),
      /Settings → Actions → General → Workflow permissions/u,
      `${name} does not tell the maintainer which setting to change`
    );
    assert.match(String(catchAll.with?.script ?? ''), /issues\.createComment/u);
  }

  // The label the forms apply has to exist before any of the above can run.
  const missing = workflow('missing-label.yml');
  assert.match(missing, /types:\n\s+- opened/u);
  assert.match(missing, /Bootstrap labels/u);
  assert.match(missing, /issues: write/u);
});

test('protected-main automation stays reviewable and generated PRs can satisfy required checks', () => {
  const generatedPullRequestWorkflows = [
    'apply-setup.yml',
    'new-entry.yml',
    'new-event.yml',
    'new-year.yml',
    'update-event-attachments.yml',
    'update-schedule.yml',
    'metrics.yml',
    'pages.yml',
    'thumbnails.yml',
  ];
  for (const name of generatedPullRequestWorkflows) {
    assert.match(
      workflow(name),
      /for workflow in validate\.yml quality\.yml lint-workflows\.yml/u,
      `${name} does not dispatch every default-branch entrypoint required for a built-in-token PR`
    );
  }

  const lint = workflow('lint-workflows.yml');
  assert.match(lint, /pull_request:\n\s+workflow_dispatch:/u);
  assert.doesNotMatch(lint, /pull_request:\n\s+paths:/u);
  assert.match(lint, /statuses: write/u);
  assert.match(lint, /context: 'lint'/u);

  const validate = workflow('validate.yml');
  assert.match(validate, /\['checks', 'Lint, test and build'\]/u);
  assert.match(validate, /\['build-matrix', 'Build every preset and module combination'\]/u);
  assert.match(validate, /\['coverage', 'Coverage evidence'\]/u);

  const metrics = workflow('metrics.yml');
  assert.match(metrics, /uses: peter-evans\/create-pull-request@/u);
  assert.match(metrics, /branch: automation\/catalog-metrics/u);
  assert.match(metrics, /pull-requests: write/u);
  assert.doesNotMatch(metrics, /git push/u);

  const pages = workflow('pages.yml');
  assert.match(pages, /uses: peter-evans\/create-pull-request@/u);
  assert.match(pages, /branch: automation\/stamp-entry-updates/u);
  assert.match(pages, /ref: \$\{\{ github\.sha \}\}/u);
  assert.doesNotMatch(pages, /needs\.stamp\.outputs\.sha/u);
  assert.doesNotMatch(pages, /git push/u);

  const thumbnails = workflow('thumbnails.yml');
  assert.match(thumbnails, /branch: automation\/entry-media/u);
  assert.match(
    thumbnails,
    /if: steps\.media\.outputs\.changed == 'true' && github\.event_name == 'pull_request'/u
  );
  assert.match(thumbnails, /git push origin "HEAD:refs\/heads\/\$BRANCH"/u);

  const codeql = workflow('codeql.yml');
  assert.match(codeql, /'Analyze javascript-typescript'/u);
  assert.match(codeql, /'Analyze ruby'/u);
  assert.match(workflow('performance.yml'), /\['scale', 'Performance and scale \(dispatch\)'\]/u);
});
