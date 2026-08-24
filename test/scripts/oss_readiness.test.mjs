import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function form(name) {
  return YAML.parse(read(`.github/ISSUE_TEMPLATE/${name}.yml`));
}

function isSameRepository(left, right) {
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

function isCanonicalParent() {
  const site = YAML.parse(read('_data/site.yml'));
  const manifest = YAML.parse(read('.phct/ownership.yml'));
  const parentRepository = new URL(manifest.template.repository).pathname.replace(/^\//u, '');
  return isSameRepository(site.github.repository, parentRepository);
}

test('canonical repository identity comparison matches GitHub casing semantics', () => {
  assert.equal(isSameRepository('CrypticPy/phct', 'crypticpy/phct'), true);
  assert.equal(isSameRepository('crypticpy/phct', 'crypticpy/another-repository'), false);
});

for (const [name, label] of [
  ['bug', 'bug'],
  ['accessibility', 'accessibility'],
  ['documentation', 'documentation'],
  ['feature', 'enhancement'],
]) {
  test(`${name} reports have a structured, labelled public route`, () => {
    const issue = form(name);
    assert.ok(issue.name);
    assert.ok(issue.description);
    assert.ok(issue.labels.includes(label));
    assert.ok(Array.isArray(issue.body) && issue.body.length > 0);
    assert.ok(
      issue.body.some((item) => item.type === 'checkboxes'),
      `${name}.yml must make the reporter acknowledge its routing or safety constraint`
    );
  });
}

test('the issue chooser disables unstructured reports and exposes private security reporting', () => {
  const chooser = YAML.parse(read('.github/ISSUE_TEMPLATE/config.yml'));
  assert.equal(chooser.blank_issues_enabled, false);
  const security = chooser.contact_links.find((link) => link.url.endsWith('/security/advisories/new'));
  assert.ok(security, 'missing private security contact link');
  assert.match(security.about, /never put.*public issue/iu);
  const fallback = chooser.contact_links.find((link) => link.url.endsWith('/blob/main/SECURITY.md'));
  assert.ok(fallback, 'missing durable security-reporting fallback');
  assert.match(fallback.about, /private email fallback/iu);
});

test('bootstrap covers every reusable label and support guidance retains safe report routes', () => {
  const labels = read('.github/workflows/bootstrap-labels.yml');
  const support = read('SUPPORT.md');
  for (const label of ['bug', 'accessibility', 'documentation', 'enhancement']) {
    assert.match(labels, new RegExp(`create "${label}"`, 'u'));
  }
  assert.match(support, /structured.*bug.*accessibility.*feature issue form/isu);
  if (isCanonicalParent()) {
    assert.match(support, /bug, accessibility, documentation, or feature issue form/u);
  }
  assert.match(read('SECURITY.md'), /private vulnerability reporting/iu);
  assert.match(read('docs/launch.md'), /Private vulnerability reporting.*Enable/isu);
  assert.match(read('docs/launch.md'), /organization\.contact_email.*fallback/isu);
});

test('canonical backup ownership blocks handoff while downstream maintainer policy stays protected', () => {
  const maintainers = read('MAINTAINERS.md');
  assert.match(maintainers, /Backup release maintainer/u);
  if (isCanonicalParent()) {
    assert.match(maintainers, /Unassigned — handoff blocker/u);
    assert.doesNotMatch(maintainers, /Unassigned — release blocker/u);
  }
});
