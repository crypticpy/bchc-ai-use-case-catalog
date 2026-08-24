import test from 'node:test';
import assert from 'node:assert/strict';

import { exceptionFindings } from '../../scripts/check_security_exceptions.mjs';

test('security exceptions require complete, unexpired accountability', () => {
  const document = {
    schema_version: 1,
    exceptions: [
      {
        id: 'GHSA-example',
        ecosystem: 'npm',
        package: 'example',
        severity: 'high',
        priority: 'P2',
        owner: '@maintainer',
        reason: 'No patched version exists; feature disabled.',
        expires: '2026-08-21',
      },
    ],
  };
  assert.deepEqual(exceptionFindings(document, '2026-08-22'), ['exceptions[0] expired on 2026-08-21']);
  assert.deepEqual(exceptionFindings({ schema_version: 1, exceptions: [] }, '2026-08-22'), []);
});

test('security exceptions are exact P2 records and critical findings cannot be waived', () => {
  const record = {
    id: 'GHSA-example',
    ecosystem: 'unknown',
    package: 'example',
    severity: 'critical',
    priority: 'P1',
    owner: '@maintainer',
    reason: 'Example.',
    expires: '2026-02-30',
  };
  assert.deepEqual(exceptionFindings({ schema_version: 1, exceptions: [record] }, '2026-01-01'), [
    'exceptions[0].ecosystem must be npm or rubygems',
    'exceptions[0].severity must be high; critical findings cannot be waived',
    'exceptions[0].priority must be P2; P0/P1 findings cannot be waived',
    'exceptions[0].expires must be a real calendar date',
  ]);
});
