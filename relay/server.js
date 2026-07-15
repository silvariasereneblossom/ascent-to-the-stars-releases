#!/usr/bin/env node
// ============================================================================
// ATTS SNAPSHOT RELAY — standalone Node server (DigitalOcean droplet flavor).
// Same contract as relay/worker.js (the Cloudflare variant): the game POSTs a
// Cultivator Snapshot (ATTS1.) or Logging-Mode fight logs (ATTSLOG1.) as text/plain,
// and this commits them into the PUBLIC mirror repo under snapshots/ or logs/.
//
// Requirements: Node >= 18 (global fetch). Zero npm dependencies.
// Env:  GITHUB_TOKEN  (required) fine-grained PAT: ascent-to-the-stars-releases, Contents RW only
//       PORT          (default 8787)
//       APP_KEY       (optional) shared spam-deterrence key; game sends it as x-atts-key
//
// Deploy: see relay/README.md ("DigitalOcean droplet" section). MUST sit behind HTTPS
// (nginx/certbot or Caddy) — the game's webviews block plain-http fetches as mixed content.
// ============================================================================
const http = require('http');

const REPO = 'silvariasereneblossom/ascent-to-the-stars-releases';
const MAX_BYTES = 1_000_000;
const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.GITHUB_TOKEN;
const APP_KEY = process.env.APP_KEY || '';
if (!TOKEN) { console.error('[atts-relay] GITHUB_TOKEN env var is required'); process.exit(1); }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-atts-key',
};
const respond = (res, status, obj) => {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json' }, CORS));
  res.end(JSON.stringify(obj));
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST') return respond(res, 405, { ok: false, error: 'POST only' });
  if (APP_KEY && req.headers['x-atts-key'] !== APP_KEY) return respond(res, 403, { ok: false, error: 'bad key' });

  let size = 0; const chunks = [];
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BYTES) { respond(res, 413, { ok: false, error: 'too large' }); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', async () => {
    if (res.writableEnded) return;
    const body = Buffer.concat(chunks).toString('utf8').trim();
    const isLog = body.startsWith('ATTSLOG1.');
    if (!body.startsWith('ATTS1.') && !isLog) return respond(res, 400, { ok: false, error: 'not a snapshot' });

    let meta;
    try {
      const payload = JSON.parse(Buffer.from(body.slice(isLog ? 9 : 6), 'base64').toString('utf8'));
      if (isLog) {
        if (payload.fmt !== 'ATTS-LOG-1' || !Array.isArray(payload.fights)) throw new Error('bad');
        meta = { name: String((payload.player && payload.player.name) || 'cultivator'), version: String(payload.version || 'v0') };
      } else {
        if (payload.fmt !== 'ATTS-SNAPSHOT-1' || !payload.save || !payload.save.confirmed) throw new Error('bad');
        meta = { name: String(payload.save.name || 'cultivator'), version: String(payload.version || 'v0') };
      }
      meta.name = meta.name.replace(/[^\w-]/g, '_').slice(0, 24);
      meta.version = meta.version.replace(/[^\w.-]/g, '').slice(0, 16);
    } catch (e) {
      return respond(res, 400, { ok: false, error: 'invalid snapshot' });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const path = `${isLog ? 'logs' : 'snapshots'}/${meta.name}-${meta.version}-${ts}.txt`;
    try {
      const gh = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'atts-snapshot-relay',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `${isLog ? 'fight logs' : 'snapshot'}: ${meta.name} (${meta.version})`,
          content: Buffer.from(body, 'utf8').toString('base64'),
        }),
      });
      if (!gh.ok) {
        const detail = (await gh.text().catch(() => '')).slice(0, 200);
        return respond(res, 502, { ok: false, error: `github ${gh.status}`, detail });
      }
      console.log(`[atts-relay] filed ${path} (${(size / 1024).toFixed(0)} KB)`);
      respond(res, 200, { ok: true, path });
    } catch (e) {
      respond(res, 502, { ok: false, error: 'github unreachable' });
    }
  });
}).listen(PORT, () => console.log(`[atts-relay] listening on :${PORT} -> ${REPO}`));
