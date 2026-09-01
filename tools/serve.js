import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8'
};

// no-cache, never no-store: Chrome refuses to register a service worker whose
// script came back with no-store, and the failure message says nothing useful.
const CACHE_HEADER = 'no-cache';

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  let rel = normalize(decoded);
  while (rel.startsWith('/') || rel.startsWith('\\')) rel = rel.slice(1);
  const full = join(root, rel === '' ? 'index.html' : rel);
  return full.startsWith(root) ? full : null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('method not allowed');
    return;
  }
  const path = safePath(req.url);
  if (!path) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, 'index.html') : path;
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': CACHE_HEADER
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found: ' + req.url);
  }
});

server.listen(port, () => {
  console.log('Serving ' + root);
  console.log('  http://localhost:' + port + '/');
  console.log('Ctrl+C to stop.');
});
