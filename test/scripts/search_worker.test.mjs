/**
 * assets/js/search-worker.js, run in a shimmed worker scope.
 *
 * The worker is plain worker-global code — self.onmessage, importScripts,
 * postMessage — so a vm context standing in for that scope runs the shipped
 * file byte for byte: importScripts loads the shipped lunr bundle into the
 * same context, fetch and indexedDB are the test's stubs, and postMessage
 * collects what the main thread would receive. The payload fixture is the
 * exact shape _plugins/search_index.rb emits.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKER = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'search-worker.js'), 'utf8');
const LUNR = fs.readFileSync(path.join(ROOT, 'assets', 'js', 'lunr.min.js'), 'utf8');
const INDEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'search-index.json'), 'utf8'));

/**
 * The worker file evaluated in a worker-shaped scope.
 * @param {{fetch?: Function, indexedDB?: object}} [options] stubs; fetch
 *   defaults to resolving the fixture payload, indexedDB defaults to absent
 *   (the cache guards must cope).
 * @returns {{scope: object, messages: object[], answer: Function}}
 */
function bootWorker(options = {}) {
  const messages = [];
  const scope = {
    console,
    JSON,
    TextDecoder,
    Uint8Array,
    postMessage: (msg) => messages.push(msg),
    fetch: options.fetch || (() => Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) })),
  };
  if (options.indexedDB) scope.indexedDB = options.indexedDB;
  scope.self = scope;
  const context = vm.createContext(scope);
  scope.importScripts = () => vm.runInContext(LUNR, context);
  vm.runInContext(WORKER, context);
  return {
    scope,
    messages,
    /**
     * Post a request and wait for the terminal ready/error message.
     * @param {{url?: string, version?: string}} [request]
     * @returns {Promise<object>} that terminal message.
     */
    async answer(request = {}) {
      scope.onmessage({ data: { url: '/search.json', version: INDEX.version, ...request } });
      for (let waited = 0; waited < 200; waited += 1) {
        const done = messages.find((m) => m.type === 'ready' || m.type === 'error');
        if (done) return done;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error('the worker never answered');
    },
  };
}

/**
 * An indexedDB stub over a plain row store: enough of the event-based API for
 * the worker's open/get/put paths, with success events on microtasks the way
 * the real thing fires them after handlers are attached.
 * @param {object} rows key => stored value.
 * @returns {object}
 */
function fakeIndexedDb(rows) {
  return {
    open() {
      const request = {
        result: {
          close() {},
          createObjectStore() {},
          transaction() {
            const tx = {
              objectStore: () => ({
                get(key) {
                  const get = { result: rows[key] };
                  queueMicrotask(() => get.onsuccess && get.onsuccess());
                  return get;
                },
                put(value, key) {
                  rows[key] = value;
                },
              }),
            };
            queueMicrotask(() => queueMicrotask(() => tx.oncomplete && tx.oncomplete()));
            return tx;
          },
        },
      };
      queueMicrotask(() => request.onsuccess && request.onsuccess());
      return request;
    },
  };
}

test('the worker builds an index the page revives to identical rankings', async () => {
  const worker = bootWorker();
  const done = await worker.answer();

  assert.equal(done.type, 'ready');
  assert.equal(done.cached, false);
  assert.deepEqual(done.payload, INDEX);

  // Revived-from-serialized and built-inline must rank identically — the
  // whole worker contract is that nobody can tell which path produced idx.
  const lunr = worker.scope.lunr;
  const revived = lunr.Index.load(done.serialized);
  const inline = lunr(function () {
    this.ref('i');
    this.field('title', { boost: 10 });
    this.field('summary', { boost: 4 });
    this.field('facets', { boost: 3 });
    this.field('body');
    INDEX.docs.forEach((d, i) =>
      this.add({
        i: String(i),
        title: d.title,
        summary: d.summary,
        facets: d.facets,
        body: (d.sections || [])
          .map((s) => s.t || '')
          .filter(Boolean)
          .join(' '),
      })
    );
  });
  for (const query of ['notice', 'permit', 'reviewer']) {
    assert.deepEqual(
      revived.search(query).map((hit) => ({ ref: hit.ref, score: hit.score })),
      inline.search(query).map((hit) => ({ ref: hit.ref, score: hit.score })),
      `revived and inline rankings agree for "${query}"`
    );
  }
});

test('a streamed download narrates its progress before the build', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(INDEX));
  const half = Math.ceil(bytes.length / 2);
  const chunks = [bytes.slice(0, half), bytes.slice(half)];
  const worker = bootWorker({
    fetch: () =>
      Promise.resolve({
        ok: true,
        headers: { get: () => String(bytes.length) },
        body: {
          getReader: () => ({
            read: () =>
              Promise.resolve(chunks.length ? { done: false, value: chunks.shift() } : { done: true }),
          }),
        },
      }),
  });
  const done = await worker.answer();

  assert.equal(done.type, 'ready');
  const progress = worker.messages.filter((m) => m.type === 'progress');
  const downloads = progress.filter((m) => m.phase === 'download');
  assert.equal(downloads.length, 2);
  assert.ok(downloads[1].loaded > downloads[0].loaded, 'the byte count rises');
  assert.equal(downloads[1].loaded, bytes.length);
  assert.equal(downloads[1].total, bytes.length);
  assert.equal(progress[progress.length - 1].phase, 'build');
  assert.deepEqual(done.payload, INDEX);
});

test('a failed fetch becomes an error message, never an unanswered request', async () => {
  const refused = bootWorker({ fetch: () => Promise.reject(new Error('connection refused')) });
  assert.equal((await refused.answer()).type, 'error');

  const denied = bootWorker({ fetch: () => Promise.resolve({ ok: false, status: 500 }) });
  const done = await denied.answer();
  assert.equal(done.type, 'error');
  assert.match(done.error, /HTTP 500/);
});

test('an unchanged catalog is answered from the cache without fetching', async () => {
  const serialized = { marker: 'stored build' };
  const rows = { payload: { version: 'v1', payload: INDEX, serialized } };
  const worker = bootWorker({
    fetch: () => Promise.reject(new Error('the cache path must not fetch')),
    indexedDB: fakeIndexedDb(rows),
  });
  const done = await worker.answer({ version: 'v1' });

  assert.equal(done.type, 'ready');
  assert.equal(done.cached, true);
  assert.deepEqual(done.payload, INDEX);
  assert.deepEqual(done.serialized, serialized);
});

test('a changed catalog rebuilds and overwrites the stale cache row', async () => {
  const rows = { payload: { version: 'v0', payload: { docs: [] }, serialized: { stale: true } } };
  const worker = bootWorker({ indexedDB: fakeIndexedDb(rows) });
  const done = await worker.answer();

  assert.equal(done.type, 'ready');
  assert.equal(done.cached, false);
  assert.equal(rows.payload.version, INDEX.version, 'the fresh build replaced the stale row');
  assert.deepEqual(rows.payload.payload, INDEX);
});

test('a version-skewed download is served but never cached', async () => {
  // Fresh HTML, stale /search.json (a half-propagated deploy): the download
  // still answers this visit, but must not squat under the new version.
  const rows = {};
  const worker = bootWorker({ indexedDB: fakeIndexedDb(rows) });
  const done = await worker.answer({ version: 'newer-than-the-json' });

  assert.equal(done.type, 'ready');
  assert.equal(done.cached, false);
  assert.deepEqual(done.payload, INDEX);
  assert.equal(rows.payload, undefined, 'the skewed payload was not cached');
});

test('a cross-origin or protocol-relative url is refused, not fetched', async () => {
  for (const url of ['https://example.com/search.json', '//example.com/search.json']) {
    const worker = bootWorker({ fetch: () => Promise.reject(new Error('must not fetch')) });
    const done = await worker.answer({ url });
    assert.equal(done.type, 'error', `"${url}" is refused`);
    assert.match(done.error, /refused to fetch/);
  }
});

test('a blank version neither reads nor writes the cache', async () => {
  const rows = { payload: { version: '', payload: { docs: [] }, serialized: { stale: true } } };
  const worker = bootWorker({ indexedDB: fakeIndexedDb(rows) });
  const done = await worker.answer({ version: '' });

  assert.equal(done.type, 'ready');
  assert.equal(done.cached, false);
  assert.deepEqual(rows.payload.serialized, { stale: true }, 'the row was left alone');
});
