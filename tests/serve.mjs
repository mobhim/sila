/* صلة — test server. Serves the repository as static files under /sila/, the way GitHub Pages serves a project site.
   No API: anything the pages need must work without a server.   node tests/serve.mjs [port] */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 4173, BASE = '/sila/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const HIDDEN = /^(node_modules|tests|lib|api|\.|server\.js|package)/;      // what a static host would publish is the site, nothing else

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/sila') { res.writeHead(301, { location: BASE }); return res.end(); }
  if (req.method !== 'GET' || !url.pathname.startsWith(BASE)) { res.writeHead(404); return res.end('Not found'); }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || HIDDEN.test(rel) || !TYPES[path.extname(file)]) { res.writeHead(404); return res.end('Not found'); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, '127.0.0.1', () => console.log('Sila test server: http://127.0.0.1:' + PORT + BASE));
