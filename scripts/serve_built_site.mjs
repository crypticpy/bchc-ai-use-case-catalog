#!/usr/bin/env node
/** Serve a built site with the text compression used by production CDNs. */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.otf', 'font/otf'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.ttf', 'font/ttf'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg\+xml)/;

export function resolveRequest(directory, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }

  const root = path.resolve(directory);
  let file = path.resolve(root, pathname.replace(/^\/+/, ''));
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;

  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    return fs.statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

export function shouldGzip({ acceptEncoding = '', contentType = '', byteLength = 0 }) {
  return (
    byteLength >= 1024 && /(?:^|,|\s)gzip(?:\s|,|;|$)/i.test(acceptEncoding) && COMPRESSIBLE.test(contentType)
  );
}

/** Strip a Pages-style base URL before resolving a built artifact. */
export function mountedRequestUrl(requestUrl, baseurl = '') {
  let parsed;
  try {
    parsed = new URL(requestUrl, 'http://localhost');
  } catch {
    return null;
  }
  const mount = `/${String(baseurl).replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  if (mount && parsed.pathname !== mount && !parsed.pathname.startsWith(`${mount}/`)) return null;
  parsed.pathname = parsed.pathname.slice(mount.length) || '/';
  return `${parsed.pathname}${parsed.search}`;
}

export function createBuiltSiteServer(directory, { baseurl = '' } = {}) {
  const root = path.resolve(directory);
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': '0' });
      response.end();
      return;
    }

    const mounted = mountedRequestUrl(request.url ?? '/', baseurl);
    const requested = mounted === null ? null : resolveRequest(root, mounted);
    const notFound = resolveRequest(root, '/404.html');
    const file = requested ?? notFound;
    if (!file) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Not found\n');
      return;
    }

    try {
      const source = fs.readFileSync(file);
      const contentType = TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream';
      const gzip = shouldGzip({
        acceptEncoding: request.headers['accept-encoding'],
        contentType,
        byteLength: source.byteLength,
      });
      const body = gzip ? zlib.gzipSync(source, { level: 6 }) : source;
      const headers = {
        'Cache-Control': 'public, max-age=0, must-revalidate',
        'Content-Length': String(body.byteLength),
        'Content-Type': contentType,
        Vary: 'Accept-Encoding',
      };
      if (gzip) headers['Content-Encoding'] = 'gzip';
      response.writeHead(requested ? 200 : 404, headers);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      console.error(error);
      response.writeHead(500, { 'Content-Length': '0' });
      response.end();
    }
  });
}

function option(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

function main(argv) {
  const directory = path.resolve(ROOT, option(argv, '--directory', '_site'));
  const host = option(argv, '--host', '127.0.0.1');
  const port = Number.parseInt(option(argv, '--port', '4173'), 10);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    console.error(`Built-site directory does not exist: ${directory}`);
    return 2;
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${port}`);
    return 2;
  }

  const server = createBuiltSiteServer(directory);
  server.listen(port, host, () => {
    console.log(`Serving ${directory} at http://${host}:${port} with gzip text compression.`);
  });
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
