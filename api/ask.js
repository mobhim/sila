/* Vercel function: POST /api/ask  { task, lang, input }  ->  { output }.  The work is in lib/sila-ai.js. */
import { handleAsk, corsHeaders } from '../lib/sila-ai.js';

export default async function handler(req, res) {
  const cors = corsHeaders(req.headers.origin);
  Object.keys(cors).forEach(k => res.setHeader(k, cors[k]));
  res.setHeader('cache-control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
  const out = await handleAsk({ method: req.method, body, ip, check: /[?&]check=1\b/.test(req.url || '') });
  res.status(out.status).json(out.body);
}
