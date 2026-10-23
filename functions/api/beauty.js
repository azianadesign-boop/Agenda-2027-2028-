// Recherche de produits cosmétiques.
// GET /api/beauty?q=<texte>   → jusqu’à 12 produits (nom, marque, ingrédients), base Open Beauty Facts
// GET /api/beauty?code=<EAN>  → un produit par code-barres. Plusieurs sources, dans l’ordre :
//   1. Open Beauty Facts (cosmétiques, licence ODbL)
//   2. les autres bases Open*Facts (Open Products Facts, Open Food Facts…) via product_type=all
//   3. UPCitemdb (version gratuite : nom, marque et photo seulement)
//   4. si on n’a que le nom : recherche de ce nom dans Open Beauty Facts pour retrouver les ingrédients
// Les réponses sont simplifiées puis mises en cache côté Cloudflare.
const OBF = 'https://world.openbeautyfacts.org';
const OFF = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,ingredients_text,ingredients_text_fr,ingredients_text_en,image_front_small_url,image_front_url,quantity,product_type';
const UA = 'Agenda2027-2028/1.0 (https://agenda-2027-2028.pages.dev)';
const J = (o, st = 200, age = 300) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${age}`, 'Access-Control-Allow-Origin': '*' } });
const str = v => (v == null ? '' : String(v)).trim();
function norm(p, src) {
  if (!p) return null;
  const n = str(p.product_name_fr || p.product_name || p.generic_name_fr);
  const i = str(p.ingredients_text_fr || p.ingredients_text || p.ingredients_text_en);
  if (!n && !i) return null;
  return { c: str(p.code), n, b: str(p.brands).split(',')[0].trim(), i: i.slice(0, 4000), img: str(p.image_front_small_url || p.image_front_url), q: str(p.quantity), src };
}
async function get(url, age, waitUntil, opt = {}) {
  const cache = caches.default; const ck = new Request('https://beauty-cache.local/' + encodeURIComponent(url));
  const hit = await cache.match(ck); if (hit) return hit.json();
  const r = await fetch(url, { headers: Object.assign({ 'User-Agent': UA, 'Accept': 'application/json' }, opt.headers || {}), redirect: 'follow', cf: { cacheTtl: age, cacheEverything: true } });
  if (r.status === 404) { const data = { _404: 1 }; waitUntil(cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${Math.min(age, 86400)}` } }))); return data; }
  if (!r.ok) throw new Error('source ' + r.status);
  const data = await r.json();
  waitUntil(cache.put(ck, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${age}` } })));
  return data;
}
const safe = async f => { try { return await f(); } catch (_) { return null; } };
async function search(q, waitUntil) {
  const d = await get(`${OBF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&fields=${FIELDS}`, 86400, waitUntil);
  const seen = new Set(); const ps = [];
  (d.products || []).forEach(x => { const p = norm(x, 'Open Beauty Facts'); if (!p) return; const k = (p.n + '|' + p.b).toLowerCase(); if (seen.has(k)) return; seen.add(k); ps.push(p); });
  ps.sort((a, b) => (b.i ? 1 : 0) - (a.i ? 1 : 0));
  return ps;
}
async function byCode(code, waitUntil) {
  // 1. Open Beauty Facts
  let d = await safe(() => get(`${OBF}/api/v2/product/${code}.json?fields=${FIELDS}`, 86400 * 3, waitUntil));
  let p = d && d.status === 1 ? norm(d.product, 'Open Beauty Facts') : null;
  if (p) return p;
  // 2. toutes les bases Open*Facts (redirige vers la bonne base)
  d = await safe(() => get(`${OFF}/api/v3/product/${code}?product_type=all&fields=${FIELDS}`, 86400 * 3, waitUntil));
  p = d && d.product ? norm(d.product, 'Open Products Facts') : null;
  if (p && p.i) return p;
  // 3. UPCitemdb (gratuit, sans clé, nombre de recherches limité par jour)
  const u = await safe(() => get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, 86400 * 7, waitUntil, { headers: { 'Content-Type': 'application/json' } }));
  const it = u && Array.isArray(u.items) && u.items[0];
  if (!p && it && it.title) p = { c: code, n: str(it.title).slice(0, 80), b: str(it.brand), i: '', img: str((it.images || [])[0]), q: '', src: 'UPCitemdb' };
  // 4. on connaît le nom mais pas les ingrédients : on cherche le même produit par son nom
  if (p && !p.i) {
    const q = [p.b, p.n.replace(new RegExp('^' + (p.b || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '')].filter(Boolean).join(' ').replace(/\b\d+([.,]\d+)?\s?(ml|g|oz|fl)\b/gi, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
    const ps = q.length > 3 ? await safe(() => search(q, waitUntil)) : null;
    const m = ps && ps.find(x => x.i);
    if (m) return Object.assign({}, p, { i: m.i, img: p.img || m.img, near: m.n, src: p.src + ' + Open Beauty Facts' });
  }
  return p;
}
export async function onRequestGet({ request, waitUntil }) {
  const u = new URL(request.url); const q = str(u.searchParams.get('q')).slice(0, 60); const code = str(u.searchParams.get('code')).replace(/\D/g, '').slice(0, 14);
  try {
    if (code) {
      if (code.length < 8) return J({ error: 'code invalide' }, 400, 60);
      const p = await byCode(code, waitUntil);
      return J({ p, src: p ? p.src : '' }, 200, p ? 3600 : 600);
    }
    if (q.length < 2) return J({ error: 'recherche trop courte' }, 400, 60);
    const ps = await search(q, waitUntil);
    return J({ ps: ps.slice(0, 12), src: 'Open Beauty Facts' }, 200, 3600);
  } catch (e) {
    return J({ error: 'source indisponible' }, 502, 30);
  }
}
