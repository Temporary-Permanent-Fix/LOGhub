// GET  /api/data            -> { data: [...] }
// POST /api/data { op, … }  -> { data: [...] }  (applies one change to the shared list)
//
// Storage: Upstash Redis over its REST API (Vercel → Storage → Upstash for Redis).
// No auth on purpose: anyone with the URL can edit links and categories.
import { randomUUID } from 'node:crypto';
import { SEED } from './_seed.js';

const KEY = 'alzaHub:data:v2';
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Write only if the stored value is still the one we read (no lost updates
// when two people save at the same moment).
const CAS = "local c = redis.call('GET', KEYS[1]) or '' " +
  "if c == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end return 0";

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'Redis HTTP ' + r.status);
  return j.result;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanHref(v) {
  let h = str(v, 2000);
  if (!h || h === '#') return '#';
  if (/^(https?:\/\/|mailto:)/i.test(h)) return h;
  if (/^[a-z][a-z0-9+.-]*:/i.test(h)) return null;      // javascript:, data:, file: …
  return 'https://' + h.replace(/^\/+/, '');
}

class Bad extends Error {}

function apply(data, b) {
  switch (b.op) {
    case 'addCat': {
      const sk = str(b.sk, 80), en = str(b.en, 80);
      if (!sk && !en) throw new Bad('Chýba názov kategórie');
      if (data.length >= 200) throw new Bad('Priveľa kategórií');
      return data.concat([{ id: 'z' + randomUUID(), name: { sk: sk || en, en: en || sk }, links: [] }]);
    }
    case 'removeCat':
      return data.filter(z => z.id !== b.catId);
    case 'addLink': {
      const title = str(b.title, 120), sub = str(b.sub, 200), href = cleanHref(b.href);
      if (!title) throw new Bad('Chýba názov odkazu');
      if (href === null) throw new Bad('Nepovolená URL adresa');
      if (!data.some(z => z.id === b.catId)) throw new Bad('Kategória už neexistuje');
      const link = { id: 'l' + randomUUID(), title, sub: { sk: sub, en: sub }, href };
      return data.map(z => {
        if (z.id !== b.catId) return z;
        if (z.links.length >= 500) throw new Bad('Priveľa odkazov v kategórii');
        return { ...z, links: z.links.concat([link]) };
      });
    }
    case 'removeLink':
      return data.map(z => z.id !== b.catId ? z : { ...z, links: z.links.filter(l => l.id !== b.linkId) });
    default:
      throw new Bad('Neznáma operácia');
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) {
    return res.status(503).json({ error: 'storage_not_configured' });
  }
  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', KEY]);
      return res.status(200).json({ data: raw ? JSON.parse(raw) : SEED });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      for (let i = 0; i < 6; i++) {
        const raw = (await redis(['GET', KEY])) || '';
        const next = apply(raw ? JSON.parse(raw) : SEED, body);
        const out = JSON.stringify(next);
        if (await redis(['EVAL', CAS, '1', KEY, raw, out])) return res.status(200).json({ data: next });
      }
      return res.status(409).json({ error: 'Skús to znova' });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    if (e instanceof Bad || e instanceof SyntaxError) return res.status(400).json({ error: e.message });
    console.error(e);
    return res.status(500).json({ error: 'Chyba úložiska' });
  }
}
