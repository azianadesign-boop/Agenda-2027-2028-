// Calendrier sportif : récupère les matchs d’une compétition pour un mois, les simplifie et les met en cache.
// GET /api/sport?l=<clé>&m=AAAAMM
// Source : flux public ESPN (non officiel). Réponses mises en cache côté Cloudflare pour limiter les appels.
const LEAGUES = {
  'fra.1': 'soccer/fra.1', 'fra.2': 'soccer/fra.2', 'fra.coupe': 'soccer/fra.coupe_de_france',
  'ucl': 'soccer/uefa.champions', 'uel': 'soccer/uefa.europa', 'uecl': 'soccer/uefa.europa.conf',
  'eng.1': 'soccer/eng.1', 'esp.1': 'soccer/esp.1', 'ita.1': 'soccer/ita.1', 'ger.1': 'soccer/ger.1',
  'wc': 'soccer/fifa.world', 'euro': 'soccer/uefa.euro', 'nations': 'soccer/uefa.nations',
  'wcq': 'soccer/fifa.worldq.uefa', 'friendly': 'soccer/fifa.friendly', 'wwc': 'soccer/fifa.wwc',
  'can': 'soccer/caf.nations', 'uwcl': 'soccer/uefa.wchampions',
  'nba': 'basketball/nba', 'wnba': 'basketball/wnba',
  'f1': 'racing/f1', 'atp': 'tennis/atp', 'wta': 'tennis/wta',
  'nfl': 'football/nfl', 'nhl': 'hockey/nhl', 'mlb': 'baseball/mlb', 'pga': 'golf/pga', 'ufc': 'mma/ufc'
};
const J = (o, st = 200, age = 60) => new Response(JSON.stringify(o), { status: st, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${age}`, 'Access-Control-Allow-Origin': '*' } });
const str = v => (v == null ? '' : String(v));
function team(c) {
  if (!c) return null; const t = c.team || c.athlete || {};
  return { n: str(t.shortDisplayName || t.displayName || t.name || t.fullName), f: str(t.displayName || t.fullName || ''), a: str(t.abbreviation || ''), c: str(t.color || ''), s: c.score != null ? str(typeof c.score === 'object' ? c.score.displayValue || c.score.value : c.score) : '', w: !!c.winner };
}
function status(s) { const t = (s && s.type) || {}; return { st: str(t.state || 'pre'), sd: str(t.shortDetail || t.detail || t.description || '') }; }
function normEvent(ev, key) {
  const comps = ev.competitions || []; const c0 = comps[0] || {}; const venue = c0.venue || ev.venue || {};
  const o = { id: str(ev.id), k: key, d: str(ev.date || c0.date || ''), e: str(ev.endDate || ''), n: str(ev.name || ev.shortName || ''), v: str(venue.fullName || ''), city: str((venue.address && (venue.address.city || venue.address.country)) || ''), ...status(ev.status || c0.status) };
  if (key === 'f1') {
    o.ses = comps.map(c => ({ n: str((c.type && (c.type.abbreviation || c.type.text)) || ''), d: str(c.date || ''), st: status(c.status).st })).filter(x => x.d);
    if (ev.circuit) o.v = str(ev.circuit.fullName || o.v);
    return o;
  }
  const groups = ev.groupings || [];
  if (groups.length || key === 'atp' || key === 'wta' || key === 'pga' || key === 'ufc') {
    const m = [];
    groups.forEach(g => (g.competitions || []).forEach(c => { const cs = c.competitors || []; m.push({ d: str(c.date || c.startDate || ''), g: str((g.grouping && (g.grouping.displayName || g.grouping.slug)) || ''), r: str((c.round && (c.round.displayName || c.round.description)) || ''), p: cs.slice(0, 2).map(team), ...status(c.status) }); }));
    if (!groups.length) comps.forEach(c => { const cs = c.competitors || []; if (cs.length === 2) m.push({ d: str(c.date || ''), g: '', r: str((c.type && c.type.abbreviation) || ''), p: cs.map(team), ...status(c.status) }); });
    o.m = m.filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 600);
    return o;
  }
  const cs = c0.competitors || [];
  const home = cs.find(x => x.homeAway === 'home') || cs[0], away = cs.find(x => x.homeAway === 'away') || cs[1];
  o.h = team(home); o.a = team(away);
  if (c0.series && c0.series.summary) o.sr = str(c0.series.summary);
  if (c0.notes && c0.notes[0] && c0.notes[0].headline) o.nt = str(c0.notes[0].headline);
  return o;
}
export async function onRequestGet({ request, waitUntil }) {
  const u = new URL(request.url); const key = u.searchParams.get('l') || ''; const m = u.searchParams.get('m') || '';
  if (!LEAGUES[key] || !/^20\d{2}(0[1-9]|1[0-2])$/.test(m)) return J({ error: 'paramètres invalides' }, 400, 300);
  const cache = caches.default; const ck = new Request(`https://sport-cache.local/${key}/${m}/v1`);
  const hit = await cache.match(ck); if (hit) return hit;
  const now = new Date(); const cur = now.getUTCFullYear() * 100 + now.getUTCMonth() + 1; const mm = +m;
  const age = mm < cur ? 86400 * 3 : mm === cur ? 900 : 3600 * 3; // passé : 3 j ; mois en cours : 15 min ; futur : 3 h
  let data;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[key]}/scoreboard?dates=${m}&limit=1000`, { cf: { cacheTtl: age, cacheEverything: true } });
    if (!r.ok) return J({ error: 'source indisponible', code: r.status }, 502, 60);
    data = await r.json();
  } catch (e) { return J({ error: 'source indisponible' }, 502, 60); }
  const evs = (data.events || []).map(ev => { try { return normEvent(ev, key); } catch (_) { return null; } }).filter(Boolean);
  const res = J({ k: key, m, at: Date.now(), ev: evs }, 200, Math.min(age, 900));
  const store = new Response(res.clone().body, res); store.headers.set('Cache-Control', `public, max-age=${age}`);
  waitUntil(cache.put(ck, store));
  return res;
}
