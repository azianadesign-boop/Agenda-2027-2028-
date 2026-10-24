// Classements et meilleurs buteurs (football), mis en cache 1 h.
// GET /api/foot?t=std&l=<clé>  → classement
// GET /api/foot?t=top&l=<clé>  → meilleurs buteurs d’un championnat
// GET /api/foot?t=top&l=eu     → meilleurs buteurs européens (7 championnats, barème du Soulier d’or)
// Source : flux publics ESPN (non officiels).
const L = {
  'fra.1': 'Ligue 1', 'fra.2': 'Ligue 2', 'eng.1': 'Premier League', 'esp.1': 'LaLiga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga',
  'por.1': 'Liga Portugal', 'ned.1': 'Eredivisie', 'ucl': 'Ligue des champions', 'uel': 'Ligue Europa', 'uecl': 'Ligue Conférence'
};
const PATH = { ucl: 'uefa.champions', uel: 'uefa.europa', uecl: 'uefa.europa.conf' };
const EU = { 'eng.1': 2, 'esp.1': 2, 'ita.1': 2, 'ger.1': 2, 'fra.1': 2, 'por.1': 1.5, 'ned.1': 1.5 };
const J = (o, st = 200, age = 3600) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${age}`, 'Access-Control-Allow-Origin': '*' } });
const str = v => (v == null ? '' : String(v));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
async function get(url) {
  const r = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true }, headers: { 'User-Agent': 'Mozilla/5.0 (agenda)' } });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
function stat(e, ...names) { for (const n of names) { const s = (e.stats || []).find(x => x.name === n || x.type === n || x.abbreviation === n); if (s) return s.value != null ? num(s.value) : num(s.displayValue); } return 0; }
async function standings(key) {
  const j = await get(`https://site.api.espn.com/apis/v2/sports/soccer/${PATH[key] || key}/standings`);
  const kids = j.children && j.children.length ? j.children : [j];
  const groups = kids.map(c => {
    const en = (c.standings && c.standings.entries) || [];
    const rows = en.map(e => {
      const t = e.team || {}; const note = e.note || {};
      return { r: stat(e, 'rank'), n: str(t.shortDisplayName || t.displayName || t.name), f: str(t.displayName || ''), a: str(t.abbreviation || ''), c: str(t.color || ''),
        j: stat(e, 'gamesPlayed', 'GP'), w: stat(e, 'wins', 'W'), d: stat(e, 'ties', 'D'), l: stat(e, 'losses', 'L'), gd: stat(e, 'pointDifferential', 'GD'), p: stat(e, 'points', 'P'),
        nc: str(note.color || ''), nd: str(note.description || '') };
    }).filter(x => x.n);
    rows.forEach((x, i) => { if (!x.r) x.r = i + 1; });
    rows.sort((a, b) => a.r - b.r);
    return { n: str(c.name || c.abbreviation || ''), rows };
  }).filter(g => g.rows.length);
  return { k: key, n: L[key], season: str((j.season && (j.season.displayName || j.season.year)) || (kids[0].standings && kids[0].standings.seasonDisplayName) || ''), g: groups };
}
// cherche récursivement une liste « leaders » liée aux buts
function findGoalLeaders(o, depth = 0) {
  if (!o || typeof o !== 'object' || depth > 8) return null;
  if (Array.isArray(o)) { for (const x of o) { const r = findGoalLeaders(x, depth + 1); if (r) return r; } return null; }
  const nm = str(o.name) + ' ' + str(o.displayName) + ' ' + str(o.abbreviation);
  if (Array.isArray(o.leaders) && o.leaders.length && /goal|scor|buteur/i.test(nm) && !/assist|against|conced/i.test(nm)) return o.leaders;
  for (const k of Object.keys(o)) { const r = findGoalLeaders(o[k], depth + 1); if (r) return r; }
  return null;
}
async function scorers(key) {
  const j = await get(`https://site.api.espn.com/apis/site/v2/sports/soccer/${PATH[key] || key}/statistics`);
  const ld = findGoalLeaders(j) || [];
  return ld.map(x => {
    const a = x.athlete || {}; const t = x.team || a.team || {};
    const dv = str(x.displayValue);
    const g = x.value != null ? num(x.value) : num((dv.match(/(?:Goals|Buts)\s*:\s*(\d+)/i) || [])[1] || dv);
    const mp = num((dv.match(/(?:Matches|Matchs|GP|Apps?)\s*:\s*(\d+)/i) || [])[1]);
    return { n: str(a.displayName || a.fullName || a.shortName), tm: str(t.shortDisplayName || t.displayName || t.name || ''), c: str(t.color || ''), g, mp };
  }).filter(x => x.n && x.g > 0).sort((a, b) => b.g - a.g).slice(0, 25);
}
export async function onRequestGet({ request, waitUntil }) {
  const u = new URL(request.url); const t = u.searchParams.get('t') || 'std'; const key = u.searchParams.get('l') || '';
  if (!['std', 'top'].includes(t) || !(L[key] || (key === 'eu' && t === 'top'))) return J({ error: 'paramètres invalides' }, 400, 300);
  const cache = caches.default; const ck = new Request(`https://foot-cache.local/${t}/${key}/v1`);
  const hit = await cache.match(ck); if (hit) return hit;
  let out;
  try {
    if (t === 'std') out = await standings(key);
    else if (key !== 'eu') out = { k: key, n: L[key], p: await scorers(key) };
    else {
      const ks = Object.keys(EU);
      const all = await Promise.all(ks.map(k => scorers(k).then(r => r.map(x => ({ ...x, lg: L[k], co: EU[k], pts: x.g * EU[k] }))).catch(() => [])));
      const p = all.flat().sort((a, b) => b.pts - a.pts || b.g - a.g).slice(0, 30);
      if (!p.length) throw new Error('vide');
      out = { k: 'eu', n: 'Europe', p, ok: all.filter(x => x.length).length, of: ks.length };
    }
  } catch (e) { return J({ error: 'source indisponible' }, 502, 60); }
  out.at = Date.now();
  const res = J(out, 200, 3600);
  waitUntil(cache.put(ck, res.clone()));
  return res;
}
