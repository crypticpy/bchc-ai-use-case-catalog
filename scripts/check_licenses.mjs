#!/usr/bin/env node
/** Fail closed when npm or bundled Ruby dependencies introduce a new license. */

import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// These paths are the fail-closed boundary for copied binary/minified assets
// and the generated include that embeds the reviewed Heroicons source.
// Project-authored JavaScript remains outside it; vendored JavaScript must keep
// the `.min.js` convention so a newly copied file cannot bypass the manifest.
export const VENDORED_LOCATIONS = Object.freeze([
  Object.freeze({ root: 'assets/fonts', suffixes: Object.freeze(['.woff2']) }),
  Object.freeze({ root: 'assets/js', suffixes: Object.freeze(['.min.js']) }),
  Object.freeze({ root: '_includes', names: Object.freeze(['icon.html']) }),
]);

export function npmLicenseFindings(lock, allowed) {
  const findings = [];
  for (const [location, metadata] of Object.entries(lock?.packages ?? {})) {
    if (!location) continue;
    if (!metadata.license) findings.push(`${location}: missing license metadata`);
    else if (!allowed.has(metadata.license))
      findings.push(`${location}: unreviewed license ${metadata.license}`);
  }
  return findings;
}

function isSafeRepositoryPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('\\') &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    value !== '.' &&
    !value.split('/').includes('..')
  );
}

function noticeSection(notice, heading) {
  const normalized = notice.replaceAll('\r\n', '\n');
  const marker = `${heading}\n`;
  const start = normalized.startsWith(marker)
    ? 0
    : normalized.indexOf(`\n${marker}`) >= 0
      ? normalized.indexOf(`\n${marker}`) + 1
      : -1;
  if (start < 0) return '';
  const next = normalized.indexOf('\n## ', start + marker.length);
  return normalized.slice(start, next < 0 ? undefined : next);
}

/**
 * Validate the checked-in inventory and its matching notice without touching disk.
 * `digests` maps repository-relative paths to the SHA-256 read from the current tree.
 * `discoveredPaths` is the complete file set found in VENDORED_LOCATIONS.
 */
export function vendoredAssetFindings(
  manifest,
  notice,
  digests,
  allowed,
  discoveredPaths = new Set(digests.keys())
) {
  const findings = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['quality/vendored-assets.json: expected an object'];
  }
  if (manifest.schema_version !== 1) findings.push('quality/vendored-assets.json: schema_version must be 1');
  if (!isSafeRepositoryPath(manifest.notice_file))
    findings.push('quality/vendored-assets.json: notice_file must be a safe repository-relative path');
  if (typeof notice !== 'string') findings.push('vendored notice: expected text');

  const requiredMarkers = manifest.required_notice_markers;
  if (!Array.isArray(requiredMarkers) || requiredMarkers.length === 0) {
    findings.push('quality/vendored-assets.json: required_notice_markers must be a non-empty array');
  } else if (typeof notice === 'string') {
    for (const marker of requiredMarkers) {
      if (typeof marker !== 'string' || marker.length === 0)
        findings.push('quality/vendored-assets.json: every required notice marker must be non-empty text');
      else if (!notice.includes(marker))
        findings.push(`vendored notice: missing required marker ${JSON.stringify(marker)}`);
    }
  }

  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    findings.push('quality/vendored-assets.json: assets must be a non-empty array');
    return findings;
  }

  const names = new Set();
  const headings = new Set();
  const files = new Set();
  for (const [assetIndex, asset] of manifest.assets.entries()) {
    const prefix = `vendored asset ${assetIndex + 1}`;
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
      findings.push(`${prefix}: expected an object`);
      continue;
    }
    for (const key of ['name', 'version', 'license', 'notice_heading']) {
      if (typeof asset[key] !== 'string' || asset[key].length === 0)
        findings.push(`${prefix}: ${key} must be non-empty text`);
    }
    if (typeof asset.name === 'string') {
      if (names.has(asset.name)) findings.push(`${prefix}: duplicate name ${asset.name}`);
      names.add(asset.name);
    }
    if (typeof asset.license === 'string' && !allowed.has(asset.license))
      findings.push(`${prefix}: unreviewed license ${asset.license}`);
    if (typeof asset.notice_heading === 'string') {
      if (!asset.notice_heading.startsWith('## '))
        findings.push(`${prefix}: notice_heading must be a level-two Markdown heading`);
      if (headings.has(asset.notice_heading))
        findings.push(`${prefix}: duplicate notice heading ${asset.notice_heading}`);
      headings.add(asset.notice_heading);
    }

    const section =
      typeof notice === 'string' && typeof asset.notice_heading === 'string'
        ? noticeSection(notice, asset.notice_heading)
        : '';
    if (!section) findings.push(`${prefix}: notice heading not found: ${asset.notice_heading ?? ''}`);
    if (!Array.isArray(asset.notice_markers) || asset.notice_markers.length === 0) {
      findings.push(`${prefix}: notice_markers must be a non-empty array`);
    } else if (section) {
      for (const marker of asset.notice_markers) {
        if (typeof marker !== 'string' || marker.length === 0)
          findings.push(`${prefix}: every notice marker must be non-empty text`);
        else if (!section.includes(marker))
          findings.push(`${prefix}: notice section is missing ${JSON.stringify(marker)}`);
      }
    }

    if (!Array.isArray(asset.files) || asset.files.length === 0) {
      findings.push(`${prefix}: files must be a non-empty array`);
      continue;
    }
    for (const [fileIndex, file] of asset.files.entries()) {
      const filePrefix = `${prefix} file ${fileIndex + 1}`;
      if (!file || typeof file !== 'object' || Array.isArray(file)) {
        findings.push(`${filePrefix}: expected an object`);
        continue;
      }
      if (!isSafeRepositoryPath(file.path)) {
        findings.push(`${filePrefix}: path must be a safe repository-relative path`);
        continue;
      }
      if (files.has(file.path)) findings.push(`${filePrefix}: duplicate path ${file.path}`);
      files.add(file.path);
      if (typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) {
        findings.push(`${filePrefix}: sha256 must be 64 lowercase hexadecimal characters`);
        continue;
      }
      const actual = digests.get(file.path);
      if (!actual) findings.push(`${filePrefix}: file is missing or unreadable: ${file.path}`);
      else if (actual !== file.sha256)
        findings.push(
          `${filePrefix}: SHA-256 mismatch for ${file.path}; expected ${file.sha256}, got ${actual}`
        );
    }
  }

  if (!(discoveredPaths instanceof Set)) {
    findings.push('vendored inventory: discovered paths must be a set');
  } else {
    for (const discovered of [...discoveredPaths].sort()) {
      if (!files.has(discovered)) {
        findings.push(`vendored inventory: unmanifested file ${discovered}`);
      }
    }
  }
  return findings;
}

export function discoverVendoredPaths(root = ROOT, locations = VENDORED_LOCATIONS) {
  const findings = [];
  const paths = new Set();
  const realRoot = fs.realpathSync(root);

  for (const location of locations) {
    const absoluteRoot = path.join(root, location.root);
    try {
      const stat = fs.lstatSync(absoluteRoot);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        findings.push(`${location.root}: vendored inventory root must be a regular directory`);
        continue;
      }
      const real = fs.realpathSync(absoluteRoot);
      if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
        findings.push(`${location.root}: vendored inventory root resolves outside the repository`);
        continue;
      }

      const pending = [real];
      while (pending.length > 0) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            pending.push(absolute);
            continue;
          }
          const matchesName = location.names?.includes(entry.name) ?? false;
          const matchesSuffix = location.suffixes?.some((suffix) => entry.name.endsWith(suffix)) ?? false;
          if (!matchesName && !matchesSuffix) continue;
          const relative = path.relative(realRoot, absolute).split(path.sep).join('/');
          paths.add(relative);
        }
      }
    } catch (error) {
      findings.push(`${location.root}: ${error.code === 'ENOENT' ? 'missing' : 'unreadable'}`);
    }
  }

  return { findings, paths };
}

function readVendoredEvidence(manifest) {
  const findings = [];
  let notice = '';
  if (isSafeRepositoryPath(manifest?.notice_file)) {
    try {
      notice = fs.readFileSync(path.join(ROOT, manifest.notice_file), 'utf8');
    } catch (error) {
      findings.push(`${manifest.notice_file}: ${error.code === 'ENOENT' ? 'missing' : 'unreadable'}`);
    }
  }

  const realRoot = fs.realpathSync(ROOT);
  const discovered = discoverVendoredPaths(ROOT);
  findings.push(...discovered.findings);

  const digests = new Map();
  const paths = new Set(
    (Array.isArray(manifest?.assets) ? manifest.assets : [])
      .flatMap((asset) => (Array.isArray(asset?.files) ? asset.files : []))
      .map((file) => file?.path)
      .filter(isSafeRepositoryPath)
  );
  for (const relative of paths) {
    const absolute = path.join(ROOT, relative);
    try {
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        findings.push(`${relative}: vendored path must be a regular file, not a link`);
        continue;
      }
      const real = fs.realpathSync(absolute);
      if (real !== realRoot && !real.startsWith(`${realRoot}${path.sep}`)) {
        findings.push(`${relative}: vendored path resolves outside the repository`);
        continue;
      }
      digests.set(relative, createHash('sha256').update(fs.readFileSync(real)).digest('hex'));
    } catch (error) {
      findings.push(`${relative}: ${error.code === 'ENOENT' ? 'missing' : 'unreadable'}`);
    }
  }
  return { digests, discoveredPaths: discovered.paths, findings, notice };
}

function main() {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'quality', 'allowed-licenses.json'), 'utf8'));
  const allowed = new Set(policy.allowed);
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const findings = npmLicenseFindings(lock, allowed);
  let vendored;
  try {
    vendored = JSON.parse(fs.readFileSync(path.join(ROOT, 'quality', 'vendored-assets.json'), 'utf8'));
  } catch (error) {
    findings.push(`quality/vendored-assets.json: ${error.code === 'ENOENT' ? 'missing' : 'invalid JSON'}`);
    vendored = {};
  }
  const evidence = readVendoredEvidence(vendored);
  findings.push(...evidence.findings);
  findings.push(
    ...vendoredAssetFindings(vendored, evidence.notice, evidence.digests, allowed, evidence.discoveredPaths)
  );

  const ruby = spawnSync('bundle', ['exec', 'ruby', 'scripts/check_gem_licenses.rb'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, PHCT_ALLOWED_LICENSES: [...allowed].join('\n') },
  });
  if (ruby.status !== 0)
    findings.push(ruby.stdout.trim() || ruby.stderr.trim() || 'Ruby license check failed');

  if (findings.length > 0) {
    console.error('\nDependency and vendored-asset license review failed:\n');
    for (const finding of findings) console.error(`  • ${finding}`);
    console.error(
      '\nReview the dependency and document the decision before extending quality/allowed-licenses.json.\n'
    );
    return 1;
  }
  console.log(
    `Dependency and vendored-asset licenses are reviewed: ${Object.keys(lock.packages).length - 1} npm packages, all bundled gems, and ${vendored.assets.length} vendored assets.`
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
