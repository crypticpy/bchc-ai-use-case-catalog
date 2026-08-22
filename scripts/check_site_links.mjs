#!/usr/bin/env node
/** Check built internal links, assets, anchors, canonical paths, sitemap, and JSON feeds. */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function filesUnder(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, item.name);
    if (item.isDirectory()) files.push(...filesUnder(target));
    else if (item.isFile()) files.push(target);
  }
  return files;
}

function targetFile(siteRoot, pathname, baseurl) {
  let relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  const prefix = String(baseurl || '').replace(/^\/+|\/+$/g, '');
  if (prefix && (relative === prefix || relative.startsWith(`${prefix}/`))) {
    relative = relative.slice(prefix.length).replace(/^\/+/, '');
  }
  const direct = path.join(siteRoot, relative);
  const candidates = [
    direct,
    path.join(direct, 'index.html'),
    path.extname(direct) ? '' : `${direct}.html`,
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

export function checkSite(siteRoot, { baseurl = '' } = {}) {
  const findings = [];
  let entriesDocument = null;
  const htmlFiles = filesUnder(siteRoot).filter((file) => file.endsWith('.html'));
  const ids = new Map();
  const domFor = (file) => new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
  const anchorsFor = (file) => {
    if (!ids.has(file)) {
      const document = domFor(file);
      ids.set(
        file,
        new Set(
          [...document.querySelectorAll('[id], a[name]')]
            .flatMap((node) => [node.id, node.getAttribute('name')])
            .filter(Boolean)
        )
      );
    }
    return ids.get(file);
  };

  for (const file of htmlFiles) {
    const relative = path.relative(siteRoot, file).split(path.sep).join('/');
    const pageUrl = new URL(
      relative.endsWith('index.html') ? relative.slice(0, -10) : relative,
      'https://phct.invalid/'
    );
    const document = domFor(file);
    const references = [
      ...[...document.querySelectorAll('[href]')].map((node) => ({ node, value: node.getAttribute('href') })),
      ...[...document.querySelectorAll('[src]')].map((node) => ({ node, value: node.getAttribute('src') })),
      ...[...document.querySelectorAll('[srcset]')].flatMap((node) =>
        node
          .getAttribute('srcset')
          .split(',')
          .map((candidate) => ({ node, value: candidate.trim().split(/\s+/)[0] }))
      ),
    ];

    for (const { node, value } of references) {
      if (!value || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) continue;
      let target;
      try {
        target = new URL(value, pageUrl);
      } catch {
        findings.push(`${relative}: malformed ${node.tagName.toLowerCase()} URL ${JSON.stringify(value)}`);
        continue;
      }
      if (target.hostname !== 'phct.invalid') continue;
      const resolved = targetFile(siteRoot, target.pathname, baseurl);
      if (!resolved) {
        findings.push(`${relative}: missing internal target ${value}`);
        continue;
      }
      if (target.hash && resolved.endsWith('.html')) {
        const fragment = decodeURIComponent(target.hash.slice(1));
        if (fragment && !anchorsFor(resolved).has(fragment)) {
          findings.push(`${relative}: missing anchor ${target.pathname}${target.hash}`);
        }
      }
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    if (canonical) {
      try {
        const canonicalUrl = new URL(canonical, pageUrl);
        if (!targetFile(siteRoot, canonicalUrl.pathname, baseurl)) {
          findings.push(`${relative}: canonical URL does not map to built output: ${canonical}`);
        }
      } catch {
        findings.push(`${relative}: malformed canonical URL ${JSON.stringify(canonical)}`);
      }
    }
  }

  for (const json of ['search.json', 'entries.json']) {
    const file = path.join(siteRoot, json);
    if (!fs.existsSync(file)) findings.push(`missing required built data file /${json}`);
    else {
      try {
        const document = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (json === 'entries.json') entriesDocument = document;
      } catch (error) {
        findings.push(`/${json} is invalid JSON: ${error.message}`);
      }
    }
  }

  const sitemap = path.join(siteRoot, 'sitemap.xml');
  if (!fs.existsSync(sitemap)) findings.push('missing /sitemap.xml');
  else {
    for (const match of fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)) {
      try {
        const url = new URL(match[1]);
        if (!targetFile(siteRoot, url.pathname, baseurl))
          findings.push(`sitemap target is not built: ${match[1]}`);
      } catch {
        findings.push(`sitemap contains malformed URL: ${match[1]}`);
      }
    }
  }

  if (entriesDocument && !Array.isArray(entriesDocument.entries)) {
    findings.push('/entries.json has no `entries` array');
  } else if (entriesDocument?.entries.length > 0) {
    const entryPath = String(entriesDocument.entry?.path || 'catalog').replace(/^\/+|\/+$/g, '') || 'catalog';
    const feedPath = path.posix.join(entryPath, 'feed.xml');
    if (!fs.existsSync(path.join(siteRoot, ...feedPath.split('/')))) findings.push(`missing /${feedPath}`);
  }
  return findings.sort();
}

function main(argv) {
  const value = (name, fallback) => {
    const at = argv.indexOf(name);
    return at === -1 ? fallback : argv[at + 1];
  };
  const root = path.resolve(ROOT, value('--root', '_site'));
  const findings = checkSite(root, { baseurl: value('--baseurl', '') });
  if (findings.length > 0) {
    console.error(
      `\nBuilt-site link check found ${findings.length} problem${findings.length === 1 ? '' : 's'}:\n`
    );
    for (const finding of findings) console.error(`  • ${finding}`);
    console.error('');
    return 1;
  }
  console.log('Built-site links, assets, anchors, canonical paths, sitemap, feed, and JSON data are valid.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
