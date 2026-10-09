// Local preview only (Vercel ignores this file): `npm run dev` → http://localhost:3000
// Without KV_REST_API_URL / KV_REST_API_TOKEN it fakes Redis in memory.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
  process.env.KV_REST_API_URL = 'http://memory.local'; process.env.KV_REST_API_TOKEN = 'x';
  const mem = new Map(), real = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    if (String(url) !== 'http://memory.local') return real(url, opt);
    const c = JSON.parse(opt.body); let result = null;
    if (c[0] === 'GET') result = mem.get(c[1]) ?? null;
    else if (c[0] === 'EVAL') { if ((mem.get(c[3]) ?? '') === c[4]) { mem.set(c[3], c[5]); result = 1; } else result = 0; }
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
}
const { default: handler } = await import('./api/data.js');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/data') {
    let raw = ''; for await (const ch of req) raw += ch;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    res.status = c => { res.statusCode = c; return res; };
    res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return handler(req, res);
  }
  const file = path.join(root, path.normalize(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try { const b = await readFile(file); res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('Not found'); }
}).listen(process.env.PORT || 3000, () => console.log('http://localhost:' + (process.env.PORT || 3000)));
