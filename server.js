/* صلة — local server: the page plus /api/ask, with the key read from .env.   npm start  ->  http://localhost:3000 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(); } catch (e) {}          // .env is optional; without a key the page runs on its written rules
const { handleAsk, corsHeaders, aiReady } = await import('./lib/sila-ai.js');

const ROOT = path.dirname(fileURLToPath(import.meta.url)), PORT = Number(process.env.PORT) || 3000;
const PUBLIC = /^\/(index\.html|admin\.html|landmarks\.html|app(\.min)?\.js|experience\.(js|css)|i18n\.en\.js|style\.css|manifest\.webmanifest|[\w-]+\.(webp|svg)|landmarks\/\d-\d\.(jpg|png|webp)|media\/[\w-]+\.(webp|jpg|png)|vendor\/gsap\/\w+\.min\.js|fonts\/[\w-]+\.woff2)$/;      // only the site's own files are served
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

const readBody = req => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > 8192) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch (e) { resolve(null); } });
  req.on('error', reject);
});

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/ask') {
      const cors = corsHeaders(req.headers.origin);
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      const body = req.method === 'POST' ? await readBody(req) : null;
      const out = await handleAsk({ method: req.method, body, ip: req.socket.remoteAddress });
      res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors });
      return res.end(JSON.stringify(out.body));
    }
    const file = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname === '/landmarks' ? '/landmarks.html' : url.pathname;
    if (req.method !== 'GET' || !PUBLIC.test(file)) { res.writeHead(404); return res.end('Not found'); }
    const data = await readFile(path.join(ROOT, file));
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' });
    res.end(data);
  } catch (e) {
    res.writeHead(e && e.code === 'ENOENT' ? 404 : 500); res.end();
  }
}).listen(PORT, () => {
  console.log('Sila: http://localhost:' + PORT + '  ·  AI: ' + (aiReady() ? 'on' : 'off (no ANTHROPIC_API_KEY in .env; the page uses its written rules)'));
});
