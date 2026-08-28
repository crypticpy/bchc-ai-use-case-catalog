// Builds the catalog's lunr index off the main thread, for assets/js/search.js.
//
// PROTOCOL (postMessage both ways):
//   in   {url, version}   /search.json to fetch, and the content version
//                         _plugins/search_index.rb stamped into the page
//   out  {type: 'progress', phase: 'download', loaded, total}
//        {type: 'progress', phase: 'build'}
//        {type: 'ready', payload, serialized, cached}
//        {type: 'error', error}
//
// `serialized` is `lunr.Index.prototype.toJSON()`: the caller revives it with
// `lunr.Index.load`, a fraction of the cost of building. A finished build is
// kept in IndexedDB keyed to the content version, so a return visit to an
// unchanged catalog skips the network and the build entirely. Every cache
// failure — no IndexedDB, a private window that lies about having it, a full
// disk — just falls through to the fetch-and-build path: the cache is only
// ever a head start, never a dependency.

importScripts('lunr.min.js');

// A hung connection (captive portal, a proxy that accepts and never answers)
// must fail loudly — mirrors FETCH_TIMEOUT in assets/js/search.js.
const FETCH_TIMEOUT = 8000;

const DB_NAME = 'phct-search';
const STORE = 'index';
const KEY = 'payload';

self.onmessage = (event) => {
  const msg = event.data || {};
  const url = String(msg.url || '/search.json');
  // Only the page that spawned this dedicated worker can message it (there is
  // no origin to check — dedicated-worker messages carry none), but the fetch
  // target is still pinned to a same-origin absolute path: a single leading
  // slash, so neither a cross-origin nor a protocol-relative URL gets through.
  if (!/^\/(?!\/)/.test(url)) {
    postMessage({ type: 'error', error: 'refused to fetch ' + url });
    return;
  }
  build(url, String(msg.version || ''));
};

/**
 * Answer from the cache or fetch-and-build, reporting progress along the way.
 * @param {string} url /search.json.
 * @param {string} version the payload's content version ('' disables caching).
 */
async function build(url, version) {
  try {
    const cached = await readCache(version);
    if (cached) {
      postMessage({ type: 'ready', payload: cached.payload, serialized: cached.serialized, cached: true });
      return;
    }
    const payload = await download(url);
    postMessage({ type: 'progress', phase: 'build' });
    const serialized = index(payload).toJSON();
    // A half-propagated deploy can pair fresh HTML with a stale /search.json
    // (or vice versa). The download still answers THIS visit — it is the best
    // copy available — but only a payload that is what the page said it would
    // be is cached, so a skewed response can never squat under the new
    // version and hide catalog updates from every later visit.
    if (payload && payload.version === version) {
      await writeCache(version, payload, serialized);
    }
    postMessage({ type: 'ready', payload: payload, serialized: serialized, cached: false });
  } catch (error) {
    postMessage({ type: 'error', error: String((error && error.message) || error) });
  }
}

/**
 * Fetch the payload, streaming download progress where the browser offers the
 * body as a stream. `total` is the Content-Length when the server sent one;
 * over a compressed response it counts compressed bytes while `loaded` counts
 * decompressed ones, which is why the caller trusts it only while it stays
 * ahead of `loaded`.
 * @param {string} url
 * @returns {Promise<object>} the parsed payload.
 */
async function download(url) {
  const init = {};
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    init.signal = AbortSignal.timeout(FETCH_TIMEOUT);
  }
  const response = await fetch(url, init);
  if (!response.ok) throw new Error('HTTP ' + response.status);
  if (!response.body || typeof response.body.getReader !== 'function') return response.json();
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    postMessage({ type: 'progress', phase: 'download', loaded: loaded, total: total });
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, at);
    at += chunk.length;
  });
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * The exact index assets/js/search.js builds inline: same ref, same fields,
 * same boosts, and the same body join as its prepare() — section texts joined
 * with single spaces, empties skipped — so a serialized index and an inline
 * one score identically.
 * @param {object} payload the /search.json payload.
 * @returns {object} a lunr index.
 */
function index(payload) {
  const docs = (payload && payload.docs) || [];
  return lunr(function () {
    this.ref('i');
    this.field('title', { boost: 10 });
    this.field('summary', { boost: 4 });
    this.field('facets', { boost: 3 });
    this.field('body');
    docs.forEach((doc, i) =>
      this.add({
        i: String(i),
        title: doc.title,
        summary: doc.summary,
        facets: doc.facets,
        body: (doc.sections || [])
          .map((section) => section.t || '')
          .filter(Boolean)
          .join(' '),
      })
    );
  });
}

/**
 * Open the cache database, resolving null on ANY failure: a worker that
 * cannot cache still builds — it just builds every visit.
 * @returns {Promise<IDBDatabase|null>}
 */
function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (e) {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/**
 * The cached build for this exact content version, or null.
 * @param {string} version
 * @returns {Promise<{payload: object, serialized: object}|null>}
 */
async function readCache(version) {
  if (!version) return null;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const row = request.result;
        db.close();
        resolve(row && row.version === version ? row : null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch (e) {
      db.close();
      resolve(null);
    }
  });
}

/**
 * Keep a finished build for the next visit. Failures are ignored — the reader
 * already has their index in hand.
 * @param {string} version
 * @param {object} payload
 * @param {object} serialized
 * @returns {Promise<void>}
 */
async function writeCache(version, payload, serialized) {
  if (!version) return;
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ version: version, payload: payload, serialized: serialized }, KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch (e) {
      db.close();
      resolve();
    }
  });
}
