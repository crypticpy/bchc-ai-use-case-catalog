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
