#!/usr/bin/env node
/** Generate a deterministic CycloneDX inventory from the committed lockfiles. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function npmName(location, metadata) {
  if (metadata.name) return metadata.name;
  const marker = 'node_modules/';
  const at = location.lastIndexOf(marker);
  return at === -1 ? location : location.slice(at + marker.length);
}

function npmPurl(name, version) {
  if (name.startsWith('@') && name.includes('/')) {
    const [scope, packageName] = name.split('/');
    return `pkg:npm/${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${version}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${version}`;
}

export function npmComponents(lock) {
  const packages = new Map();
  for (const [location, metadata] of Object.entries(lock?.packages ?? {})) {
    if (!location || !metadata.version) continue;
    const name = npmName(location, metadata);
    const purl = npmPurl(name, metadata.version);
    const entry = packages.get(purl) ?? {
      component: {
        type: 'library',
        name,
        version: metadata.version,
        'bom-ref': purl,
        purl,
      },
      licenses: new Set(),
      locations: new Set(),
    };
    if (metadata.license) entry.licenses.add(metadata.license);
    entry.locations.add(location);
    packages.set(purl, entry);
  }

  return [...packages.values()].map(({ component, licenses, locations }) => ({
    ...component,
    licenses: licenses.size > 0 ? [...licenses].sort().map((expression) => ({ expression })) : undefined,
    properties: [...locations].sort().map((location) => ({ name: 'phct:lockfile-path', value: location })),
  }));
}

export function gemComponents(lockText) {
  const components = [];
  let inSpecs = false;
  for (const line of String(lockText).split('\n')) {
    if (line === '  specs:') {
      inSpecs = true;
      continue;
    }
    if (inSpecs && /^\S/.test(line)) break;
    const match = inSpecs ? line.match(/^ {4}([\w.-]+) \(([^)]+)\)$/) : null;
    if (!match) continue;
    const [, name, versionWithPlatform] = match;
    const separator = versionWithPlatform.indexOf('-');
    const version = separator === -1 ? versionWithPlatform : versionWithPlatform.slice(0, separator);
    const platform = separator === -1 ? null : versionWithPlatform.slice(separator + 1);
    const purl = `pkg:gem/${encodeURIComponent(name)}@${version}${
      platform ? `?platform=${encodeURIComponent(platform)}` : ''
    }`;
    components.push({
      type: 'library',
      name,
      version,
      'bom-ref': purl,
      purl,
      properties: platform ? [{ name: 'phct:gem-platform', value: platform }] : undefined,
    });
  }
  return components;
}

export function buildSbom(packageJson, packageLock, gemLock) {
  const rootRef = `pkg:npm/${encodeURIComponent(packageJson.name)}@${packageJson.version}`;
  const components = [...npmComponents(packageLock), ...gemComponents(gemLock)].sort((a, b) =>
    a['bom-ref'].localeCompare(b['bom-ref'])
  );
  const references = [rootRef, ...components.map((component) => component['bom-ref'])];
  if (new Set(references).size !== references.length) {
    throw new Error('CycloneDX bom-ref values must be unique');
  }
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: packageJson.name,
        version: packageJson.version,
        'bom-ref': rootRef,
      },
    },
    components,
    dependencies: [{ ref: rootRef, dependsOn: components.map((component) => component['bom-ref']) }],
  };
}

function main(argv) {
  const outputArg = argv[argv.indexOf('--output') + 1] || 'sbom.cdx.json';
  const document = buildSbom(
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')),
    fs.readFileSync(path.join(ROOT, 'Gemfile.lock'), 'utf8')
  );
  const output = path.resolve(ROOT, outputArg);
  fs.writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${document.components.length} components to ${outputArg}.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
