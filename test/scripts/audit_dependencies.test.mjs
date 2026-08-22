import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateAuditReports,
  npmAuditFindings,
  rubyAuditFindings,
} from '../../scripts/audit_dependencies.mjs';

const emptyNpm = { auditReportVersion: 2, vulnerabilities: {} };
const emptyRuby = { results: [] };

const npmHigh = {
  auditReportVersion: 2,
  vulnerabilities: {
    'example-package': {
      name: 'example-package',
      severity: 'high',
      via: [
        {
          source: 12345,
          name: 'example-package',
          severity: 'high',
          title: 'Example advisory',
          url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        },
      ],
    },
  },
};

const rubyHigh = {
  results: [
    {
      type: 'unpatched_gem',
      gem: { name: 'example-gem', version: '1.0.0' },
      advisory: {
        id: 'CVE-2026-1234',
        cve: '2026-1234',
        ghsa: 'dddd-eeee-ffff',
        criticality: 'high',
        title: 'Example Ruby advisory',
      },
    },
  ],
};

function exception(overrides = {}) {
  return {
    id: 'GHSA-aaaa-bbbb-cccc',
    ecosystem: 'npm',
    package: 'example-package',
    severity: 'high',
    priority: 'P2',
    owner: '@maintainer',
    reason: 'Feature disabled while the upstream patch is reviewed.',
    expires: '2026-09-01',
    ...overrides,
  };
}

test('npm audit findings retain both public and numeric advisory identifiers', () => {
  assert.deepEqual(npmAuditFindings(npmHigh)[0].identifiers, ['GHSA-AAAA-BBBB-CCCC', '12345']);
});

test('an exact active npm exception waives only its matching high-severity advisory', () => {
  const evaluation = evaluateAuditReports({
    npmReport: npmHigh,
    rubyReport: emptyRuby,
    exceptions: [exception()],
  });
  assert.equal(evaluation.approved.length, 1);
  assert.deepEqual(evaluation.unapproved, []);
  assert.deepEqual(evaluation.unused, []);

  const mismatch = evaluateAuditReports({
    npmReport: npmHigh,
    rubyReport: emptyRuby,
    exceptions: [exception({ package: 'different-package' })],
  });
  assert.equal(mismatch.unapproved.length, 1);
  assert.equal(mismatch.unused.length, 1);
});

test('critical and unidentified npm findings cannot be waived', () => {
  const report = structuredClone(npmHigh);
  report.vulnerabilities['example-package'].severity = 'critical';
  report.vulnerabilities['example-package'].via[0].severity = 'critical';
  const evaluation = evaluateAuditReports({
    npmReport: report,
    rubyReport: emptyRuby,
    exceptions: [exception({ severity: 'critical' })],
  });
  assert.equal(evaluation.unapproved.length, 1);
  assert.equal(evaluation.approved.length, 0);
});

test('Ruby findings match any identifier but still require the exact ecosystem and package', () => {
  assert.deepEqual(rubyAuditFindings(rubyHigh)[0].identifiers, ['CVE-2026-1234', 'GHSA-DDDD-EEEE-FFFF']);
  const evaluation = evaluateAuditReports({
    npmReport: emptyNpm,
    rubyReport: rubyHigh,
    exceptions: [
      exception({
        id: 'GHSA-dddd-eeee-ffff',
        ecosystem: 'rubygems',
        package: 'example-gem',
      }),
    ],
  });
  assert.equal(evaluation.approved.length, 1);
  assert.deepEqual(evaluation.unapproved, []);
});

test('unused exceptions fail closed instead of becoming latent broad waivers', () => {
  const evaluation = evaluateAuditReports({
    npmReport: emptyNpm,
    rubyReport: emptyRuby,
    exceptions: [exception()],
  });
  assert.deepEqual(evaluation.unapproved, []);
  assert.equal(evaluation.unused.length, 1);
});
