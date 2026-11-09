'use strict';
// Backend Walrus Memory + Tatum untuk Nusantara Predict (Vercel serverless).
// Kunci delegasi Walrus HANYA ada di sini (env var), tidak pernah dikirim ke browser.

const USER_RE = /^[A-Za-z0-9_-]{2,24}$/;
const TSDB = 'https://www.thesportsdb.com/api/v1/json/3/';
const CATS = ['Football', 'Basketball'];
const PICKS = ['home', 'draw', 'away'];
const cfg = () => ({
  key: process.env.MEMWAL_KEY || process.env.MEMWAL_PRIVATE_KEY,
  accountId: process.env.MEMWAL_ACCOUNT_ID,
  serverUrl: process.env.MEMWAL_SERVER_URL || 'https://relayer.memory.walrus.xyz'
});

const tsOf = e => {
  let s = e.strTimestamp || (e.dateEvent ? e.dateEvent + 'T' + (e.strTime || '00:00:00') : '');
  if (!s) return 0;
  if (!/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) s += 'Z';
  const v = Date.parse(s); return isNaN(v) ? 0 : v;
};
function parseResult(e) {
  const s = String(e.strStatus || '').toLowerCase();
  if (/postponed|cancel|abandon/.test(s)) return { void: true };
  const hs = parseInt(e.intHomeScore, 10), as = parseInt(e.intAwayScore, 10);
  const finished = /\b(ft|aet|aot|pen)\b|finished|after/.test(s);
  if (!finished || isNaN(hs) || isNaN(as)) return null;
  return { outcome: hs > as ? 'home' : hs < as ? 'away' : 'draw', score: hs + '-' + as };
}
async function getEvent(id) {
  const r = await fetch(TSDB + 'lookupevent.php?id=' + encodeURIComponent(id));
  if (!r.ok) throw new Error('TheSportsDB HTTP ' + r.status);
  const d = await r.json();
  return d.events && d.events[0] ? d.events[0] : null;
}
// Bukti on-chain: checkpoint Sui Mainnet terbaru via gateway GraphQL Tatum
async function tatumCheckpoint() {
  const key = process.env.TATUM_API_KEY; if (!key) return null;
  try {
    const r = await fetch(process.env.TATUM_SUI_GRAPHQL || 'https://sui-mainnet.gateway.tatum.io/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({ query: '{ checkpoint { sequenceNumber digest } }' })
    });
    const d = await r.json(); const c = d.data && d.data.checkpoint;
    return c ? { seq: String(c.sequenceNumber), digest: c.digest || null } : null;
  } catch (e) { return null; }
}
async function writeMem(m, text) {
  const job = await m.remember(text);
  const id = job && (job.job_id || job.jobId) || null;
  let confirmed = false;
  if (id) {
    try {
      await Promise.race([m.waitForRememberJob(id), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
      confirmed = true;
    } catch (e) { /* job tetap berjalan di relayer */ }
  }
  return { job_id: id, confirmed };
}
function buildProfile(items) {
  const seen = new Set(), rows = {}, blobs = [];
  for (const it of items) {
    const text = String(it.text || it.content || it.memory || '');
    const i = text.indexOf('NUSA_OUTCOME '); if (i < 0) continue;
    let o; try { o = JSON.parse(text.slice(i + 13)); } catch (e) { continue; }
    if (!o || seen.has(o.matchId)) continue;
    seen.add(o.matchId);
    const k = o.cat + '|' + (o.league || '');
    const r = rows[k] || (rows[k] = { cat: o.cat, league: o.league || '', n: 0, wins: 0, cs: 0 });
    r.n++; r.wins += o.won ? 1 : 0; r.cs += Number(o.conf) || 0;
    const b = it.blob_id || it.blobId; if (b && blobs.length < 5) blobs.push(b);
  }
  return { rows: Object.values(rows).map(r => ({ cat: r.cat, league: r.league, n: r.n, wins: r.wins, avgConf: r.cs / r.n })), blobs, total: seen.size, source: 'walrus' };
}
function cleanEntry(en) {
  en = en || {};
  const conf = Math.round(Number(en.conf)), odds = Number(en.odds) || 0;
  if (!/^\d{1,12}$/.test(String(en.matchId))) return null;
  if (!PICKS.includes(en.pickKey) || !CATS.includes(en.cat)) return null;
  if (!(conf >= 10 && conf <= 100)) return null;
  return { matchId: String(en.matchId), pickKey: en.pickKey, cat: en.cat, conf, odds: odds >= 0 && odds <= 50 ? odds : 0 };
}
const bad = (res, code, msg) => res.status(code).json({ error: msg });

module.exports = async (req, res) => {
  if (req.method !== 'POST') return bad(res, 405, 'POST only');
  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  const c = cfg();
  if (b.action === 'health') return res.json({ walrus: !!(c.key && c.accountId), tatum: !!process.env.TATUM_API_KEY });
  const user = String(b.user || '');
  if (!USER_RE.test(user)) return bad(res, 400, 'bad user');
  if (!c.key || !c.accountId) return bad(res, 503, 'Walrus Memory belum dikonfigurasi');
  try {
    const { MemWal } = await import('@mysten-incubation/memwal');
    const m = MemWal.create({ key: c.key, accountId: c.accountId, serverUrl: c.serverUrl, namespace: 'nusa-' + user.toLowerCase() });

    if (b.action === 'profile') {
      const r = await m.recall({ query: 'NUSA_OUTCOME prediction result won lost', limit: 100 });
      const items = Array.isArray(r) ? r : (r && (r.results || r.memories || r.matches)) || [];
      return res.json(buildProfile(items));
    }

    const en = cleanEntry(b.entry);
    if (!en) return bad(res, 400, 'bad entry');
    const e = await getEvent(en.matchId);               // data pertandingan diverifikasi server, bukan dari klien
    if (!e) return bad(res, 400, 'match not found');
    const title = `${e.strHomeTeam} vs ${e.strAwayTeam}`, league = e.strLeague || '';

    if (b.action === 'lock') {
      const ts = tsOf(e);
      if (ts <= Date.now()) return bad(res, 409, 'match already started');
      const cp = await tatumCheckpoint();
      const rec = { u: user, matchId: en.matchId, title, cat: en.cat, league, pick: en.pickKey, conf: en.conf, odds: en.odds, kickoff: new Date(ts).toISOString(), cp: cp && cp.seq, at: new Date().toISOString() };
      const w = await writeMem(m, 'NUSA_PICK ' + JSON.stringify(rec));
      return res.json({ ok: true, ...w, checkpoint: cp });
    }

    if (b.action === 'settle') {
      const r = parseResult(e);
      if (!r) return bad(res, 409, 'match not finished');
      if (r.void) return res.json({ ok: true, void: true });
      const rec = { u: user, matchId: en.matchId, title, cat: en.cat, league, pick: en.pickKey, conf: en.conf, odds: en.odds, won: r.outcome === en.pickKey, score: r.score, at: new Date().toISOString() };
      const w = await writeMem(m, 'NUSA_OUTCOME ' + JSON.stringify(rec));
      return res.json({ ok: true, ...w, won: rec.won });
    }
    return bad(res, 400, 'unknown action');
  } catch (err) {
    console.error('memory api', err);
    return bad(res, 502, err.message || 'memory error');
  }
};
