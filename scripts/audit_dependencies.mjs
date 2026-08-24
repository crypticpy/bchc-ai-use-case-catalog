#!/usr/bin/env node
/** Run npm and Ruby dependency audits, allowing only exact, active P2 exceptions. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

import { exceptionFindings } from './check_security_exceptions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function severity(value) {
  return typeof value === 'string' ? value.toLowerCase() : 'unknown';
}

function identifiersFromNpmAdvisory(advisory) {
  const identifiers = [];
  if (advisory?.source !== undefined && advisory?.source !== null) {
    identifiers.push(String(advisory.source));
  }
  if (typeof advisory?.url === 'string') {
    const match = advisory.url.match(/(?:GHSA-[0-9a-z-]+|CVE-\d{4}-\d+)/iu);
    if (match) identifiers.unshift(match[0]);
  }
  return [...new Set(identifiers.map((id) => id.toUpperCase()))];
}

function npmLeaves(vulnerabilities, packageName, seen = new Set()) {
  if (seen.has(packageName)) return [];
  const nextSeen = new Set(seen).add(packageName);
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !BLOCKING_SEVERITIES.has(severity(vulnerability.severity))) return [];

  const leaves = [];
  for (const via of Array.isArray(vulnerability.via) ? vulnerability.via : []) {
    if (typeof via === 'string') {
      leaves.push(...npmLeaves(vulnerabilities, via, nextSeen));
      continue;
    }
    const advisorySeverity = severity(via?.severity ?? vulnerability.severity);
    if (!BLOCKING_SEVERITIES.has(advisorySeverity)) continue;
    const identifiers = identifiersFromNpmAdvisory(via);
    leaves.push({
      ecosystem: 'npm',
      package: via?.name || vulnerability.name || packageName,
      severity: advisorySeverity,
      identifiers,
      id: identifiers[0] || 'UNIDENTIFIED',
      title: via?.title || 'npm audit vulnerability',
      waivable: advisorySeverity === 'high' && identifiers.length > 0,
    });
  }

  if (leaves.length === 0) {
    leaves.push({
      ecosystem: 'npm',
      package: vulnerability.name || packageName,
      severity: severity(vulnerability.severity),
      identifiers: [],
      id: 'UNIDENTIFIED',
      title: 'npm reported a blocking vulnerability without an advisory identifier',
      waivable: false,
    });
  }
  return leaves;
}

function deduplicate(findings) {
  const unique = new Map();
  for (const finding of findings) {
    const key = [finding.ecosystem, finding.package, finding.severity, finding.id].join(':');
    if (!unique.has(key)) unique.set(key, finding);
  }
  return [...unique.values()];
}

export function npmAuditFindings(report) {
  if (report?.auditReportVersion !== 2 || !report.vulnerabilities) {
    throw new Error('npm audit did not return an auditReportVersion 2 vulnerability report');
  }
  const findings = [];
  for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!BLOCKING_SEVERITIES.has(severity(vulnerability?.severity))) continue;
    findings.push(...npmLeaves(report.vulnerabilities, packageName));
  }
  return deduplicate(findings);
}

function identifiersFromRubyAdvisory(advisory) {
  const identifiers = [advisory?.id];
  if (advisory?.cve) identifiers.push(`CVE-${advisory.cve}`);
  if (advisory?.ghsa) identifiers.push(`GHSA-${advisory.ghsa}`);
  if (advisory?.osvdb) identifiers.push(`OSVDB-${advisory.osvdb}`);
  return [...new Set(identifiers.filter(Boolean).map((id) => String(id).toUpperCase()))];
}

export function rubyAuditFindings(report) {
  if (!Array.isArray(report?.results)) {
    throw new Error('bundler-audit did not return a results list');
  }
  const findings = [];
  for (const result of report.results) {
    if (result?.type === 'insecure_source') {
      findings.push({
        ecosystem: 'rubygems',
        package: result.source || 'Gemfile.lock source',
        severity: 'critical',
        identifiers: [],
        id: 'INSECURE-SOURCE',
        title: 'Bundler found an insecure gem source',
        waivable: false,
      });
      continue;
    }
    if (result?.type !== 'unpatched_gem') continue;
    const advisorySeverity = severity(result.advisory?.criticality);
    if (['none', 'low', 'medium'].includes(advisorySeverity)) continue;
    const identifiers = identifiersFromRubyAdvisory(result.advisory);
    findings.push({
      ecosystem: 'rubygems',
      package: result.gem?.name || 'unknown gem',
      severity: advisorySeverity,
      identifiers,
      id: identifiers[0] || 'UNIDENTIFIED',
      title: result.advisory?.title || 'Ruby dependency advisory',
      waivable: advisorySeverity === 'high' && identifiers.length > 0,
    });
  }
  return deduplicate(findings);
}

function exceptionMatches(exception, finding) {
  return (
    finding.waivable &&
    exception.ecosystem === finding.ecosystem &&
    exception.package.toLowerCase() === finding.package.toLowerCase() &&
    exception.severity === finding.severity &&
    exception.priority === 'P2' &&
    finding.identifiers.includes(exception.id.toUpperCase())
  );
}

export function evaluateAuditReports({ npmReport, rubyReport, exceptions }) {
  const findings = [...npmAuditFindings(npmReport), ...rubyAuditFindings(rubyReport)];
  const used = new Set();
  const approved = [];
  const unapproved = [];

  for (const finding of findings) {
    const index = exceptions.findIndex((exception) => exceptionMatches(exception, finding));
    if (index >= 0) {
      used.add(index);
      approved.push({ finding, exception: exceptions[index] });
    } else {
      unapproved.push(finding);
    }
  }

  return {
    findings,
    approved,
    unapproved,
    unused: exceptions.filter((_, index) => !used.has(index)),
  };
}

function runJson(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${label} could not start: ${result.error.message}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    const detail = (result.stderr || result.stdout || 'no output').trim().slice(0, 500);
    throw new Error(`${label} did not return valid JSON (exit ${result.status ?? 'unknown'}): ${detail}`);
  }
}

function describe(finding) {
  return `${finding.ecosystem}:${finding.package} ${finding.id} (${finding.severity})`;
}

function main() {
  const document = yaml.load(fs.readFileSync(path.join(ROOT, 'quality', 'security-exceptions.yml'), 'utf8'));
  const registerFindings = exceptionFindings(document);
  if (registerFindings.length > 0) {
    for (const finding of registerFindings) console.error(`FAIL  ${finding}`);
    return 1;
  }

  let npmReport;
  let rubyReport;
  try {
    npmReport = runJson('npm', ['audit', '--audit-level=high', '--json'], 'npm audit');
    rubyReport = runJson(
      'bundle',
      ['exec', 'bundler-audit', 'check', '--update', '--quiet', '--format', 'json'],
      'bundler-audit'
    );
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    return 1;
  }

  let evaluation;
  try {
    evaluation = evaluateAuditReports({
      npmReport,
      rubyReport,
      exceptions: document.exceptions,
    });
  } catch (error) {
    console.error(`FAIL  ${error.message}`);
    return 1;
  }

  for (const { finding, exception } of evaluation.approved) {
    console.warn(`WAIVED  ${describe(finding)} through ${exception.expires}; owner ${exception.owner}`);
  }
  for (const finding of evaluation.unapproved) {
    console.error(`FAIL  Unapproved dependency finding: ${describe(finding)} — ${finding.title}`);
  }
  for (const exception of evaluation.unused) {
    console.error(
      `FAIL  Stale exception does not match a current finding: ${exception.ecosystem}:${exception.package} ${exception.id}`
    );
  }
  if (evaluation.unapproved.length > 0 || evaluation.unused.length > 0) return 1;

  console.log(
    `Dependency security audits passed (${evaluation.findings.length} blocking, ${evaluation.approved.length} time-bounded P2 exception${evaluation.approved.length === 1 ? '' : 's'}).`
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
