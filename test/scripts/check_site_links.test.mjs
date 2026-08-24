import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkSite } from '../../scripts/check_site_links.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phct-links-'));
  fs.mkdirSync(path.join(root, 'catalog', 'one'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<link rel="canonical" href="https://example.org/"><a href="/catalog/one/#details">One</a>'
  );
  fs.writeFileSync(path.join(root, 'catalog', 'one', 'index.html'), '<h1 id="details">One</h1>');
  fs.writeFileSync(path.join(root, 'search.json'), '{}');
  fs.writeFileSync(
    path.join(root, 'entries.json'),
    JSON.stringify({ entry: { path: 'catalog' }, entries: [{ slug: 'one' }] })
  );
  fs.writeFileSync(
    path.join(root, 'sitemap.xml'),
    '<urlset><url><loc>https://example.org/</loc></url></urlset>'
  );
  fs.writeFileSync(path.join(root, 'catalog', 'feed.xml'), '<feed/>');
  return root;
}

test('a complete built-site fixture passes', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkSite(root), []);
});

test('missing files and fragments name the source page', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, 'index.html'),
    '<a href="/missing/">No</a><a href="/catalog/one/#nope">Bad anchor</a>'
  );
  assert.deepEqual(
    checkSite(root).filter((finding) => finding.startsWith('index.html:')),
    ['index.html: missing anchor /catalog/one/#nope', 'index.html: missing internal target /missing/']
  );
});

test('the required feed follows the configured entry path', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'catalog', 'feed.xml'));
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'feed.xml'), '<feed/>');
  fs.writeFileSync(
    path.join(root, 'entries.json'),
    JSON.stringify({ entry: { path: 'projects' }, entries: [{ slug: 'one' }] })
  );
  assert.deepEqual(checkSite(root), []);
});

test('an empty catalog does not require a feed', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'catalog', 'feed.xml'));
  fs.writeFileSync(
    path.join(root, 'entries.json'),
    JSON.stringify({ entry: { path: 'catalog' }, entries: [] })
  );
  assert.deepEqual(checkSite(root), []);
});

test('a populated catalog reports its configured missing feed', (t) => {
  const root = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.rmSync(path.join(root, 'catalog', 'feed.xml'));
  fs.writeFileSync(
    path.join(root, 'entries.json'),
    JSON.stringify({ entry: { path: '/projects/' }, entries: [{ slug: 'one' }] })
  );
  assert.ok(checkSite(root).includes('missing /projects/feed.xml'));
});
