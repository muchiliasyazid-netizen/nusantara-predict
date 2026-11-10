'use strict';
// Proxy Gemini untuk Sari AI (Vercel serverless). Kunci Gemini HANYA ada di env var GEMINI_API_KEY.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const hits = new Map();
function limited(req, max) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'x').split(',')[0].trim();
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > max;
}
const err = (res, code, message) => res.status(code).json({ error: { message } });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return err(res, 405, 'POST only');
  const key = process.env.GEMINI_API_KEY;
  if (!key) return err(res, 503, 'GEMINI_API_KEY belum diisi di server');
  if (limited(req, 20)) return err(res, 429, 'too many requests');

  let b = req.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } } b = b || {};
  const system = String(b.system || '').slice(0, 4000);
  const contents = Array.isArray(b.contents) ? b.contents.slice(-13) : [];
  const okRole = r => r === 'user' || r === 'model';
  const clean = contents
    .filter(c => c && okRole(c.role) && Array.isArray(c.parts) && c.parts[0] && typeof c.parts[0].text === 'string')
    .map(c => ({ role: c.role, parts: [{ text: c.parts[0].text.slice(0, 2000) }] }));
  if (!clean.length || clean[clean.length - 1].role !== 'user') return err(res, 400, 'bad request');

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: clean })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return err(res, r.status === 429 ? 429 : 502, (d.error && d.error.message) || 'Gemini error ' + r.status);
    const text = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text;
    if (!text) return err(res, 502, 'empty reply');
    return res.json({ text });
  } catch (e) {
    console.error('chat api', e);
    return err(res, 502, 'upstream error');
  }
};
