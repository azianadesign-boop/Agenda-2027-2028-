// Recherche de produits cosmétiques : base ouverte Open Beauty Facts (licence ODbL).
// GET /api/beauty?q=<texte>   → jusqu’à 12 produits (nom, marque, ingrédients)
// GET /api/beauty?code=<EAN>  → un produit par code-barres
// Les réponses sont simplifiées puis mises en cache côté Cloudflare.
const BASE = 'https://world.openbeautyfacts.org';
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,ingredients_text,ingredients_text_fr,ingredients_text_en,image_front_small_url,quantity';
const UA = 'Agenda2027-2028/1.0 (https://agenda-2027-2028.pages.dev)';
const J = (o, st = 200, age = 300) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${age}`, 'Access-Control-Allow-Origin': '*' } });
const str = v => (v == null ? '' : String(v)).trim();
function norm(p) {
  if (!p) return null;
  const n = str(p.product_name_fr || p.product_name || p.generic_name_fr);
  const i = str(p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en);
  if (!n && !i) return null;
  return { c: str(p.code), n, b: str(p.brands).split(',')[0].trim(), i: i.slice(0, 4000), img: str(p.image_front_small_url), q: str(p.quantity) };
}
async function get(url, age, waitUntil) {
  const cache = caches.default; const ck = new Request('https://beauty-cache.local/' + encodeURIComponent(url));
  const hit = await cache.match(ck); if (hit) return hit.json();
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, cf: { cacheTtl: age, cacheEverything: true } });
  if (!r.ok) throw new Error('source ' + r.status);
  const data = await r.json();
  waitUntil(cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${age}` } })));
  return data;
}
export async function onRequestGet({ request, waitUntil }) {
  const u = new URL(request.url); const q = str(u.searchParams.get('q')).slice(0, 60); const code = str(u.searchParams.get('code')).replace(/\D/g, '').slice(0, 14);
  try {
    if (code) {
      if (code.length < 8) return J({ error: 'code invalide' }, 400, 60);
      const d = await get(`${BASE}/api/v2/product/${code}.json?fields=${FIELDS}`, 86400 * 3, waitUntil);
      const p = d && d.status === 1 ? norm(d.product) : null;
      return J({ p, src: 'Open Beauty Facts' }, 200, 3600);
    }
    if (q.length < 2) return J({ error: 'recherche trop courte' }, 400, 60);
    const d = await get(`${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&fields=${FIELDS}`, 86400, waitUntil);
    const seen = new Set(); const ps = [];
    (d.products || []).forEach(x => { const p = norm(x); if (!p) return; const k = (p.n + '|' + p.b).toLowerCase(); if (seen.has(k)) return; seen.add(k); ps.push(p); });
    ps.sort((a, b) => (b.i ? 1 : 0) - (a.i ? 1 : 0));
    return J({ ps: ps.slice(0, 12), src: 'Open Beauty Facts' }, 200, 3600);
  } catch (e) {
    return J({ error: 'source indisponible' }, 502, 30);
  }
}
