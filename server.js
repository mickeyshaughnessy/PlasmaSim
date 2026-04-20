// Optional Node.js server for DO Spaces state sync + static file serving
// Run: node server.js
// Env vars (optional, falls back to local JSON files):
//   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET, DO_SPACES_ENDPOINT
"use strict";

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ── DO Spaces / local storage adapter ────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let S3 = null;
if (process.env.DO_SPACES_KEY) {
  const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  S3 = new S3Client({
    endpoint: process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com',
    region: 'us-east-1',
    credentials: { accessKeyId: process.env.DO_SPACES_KEY, secretAccessKey: process.env.DO_SPACES_SECRET }
  });
}

const BUCKET = process.env.DO_SPACES_BUCKET || 'starbound-tactics';

async function loadState(key) {
  if (S3) {
    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const { Body } = await S3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${key}.json` }));
      const chunks = [];
      for await (const chunk of Body) chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {}
  }
  const localPath = path.join(DATA_DIR, `${key}.json`);
  if (fs.existsSync(localPath)) return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  return null;
}

async function saveState(key, data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(path.join(DATA_DIR, `${key}.json`), json);
  if (S3) {
    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await S3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `${key}.json`, Body: json, ContentType: 'application/json' }));
    } catch (e) { console.warn('DO Spaces write failed:', e.message); }
  }
}

// ── API routes ────────────────────────────────────────────────────────────
app.get('/api/state/:key', async (req, res) => {
  try {
    const data = await loadState(req.params.key);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/state/:key', async (req, res) => {
  try {
    const { playerId, data } = req.body;
    if (!playerId || !data) return res.status(400).json({ error: 'Missing playerId or data' });

    let existing = await loadState(req.params.key) || {};
    // Only merge the player's own subtree to avoid clobbering other players
    if (data.players && data.players[playerId]) {
      if (!existing.players) existing.players = {};
      existing.players[playerId] = data.players[playerId];
    }
    // Allow overwrite of other safe fields
    for (const field of ['version','lastModified']) {
      if (data[field] !== undefined) existing[field] = data[field];
    }
    await saveState(req.params.key, existing);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/players', async (req, res) => {
  try {
    const galaxy = await loadState('galaxy');
    const players = Object.entries(galaxy?.players || {}).map(([id, p]) => ({
      id, system: p.currentSystem, mode: p.mode, name: p.name, lastSeen: p.lastSeen
    }));
    res.json({ players });
  } catch { res.json({ players: [] }); }
});

app.post('/api/players/:id/heartbeat', async (req, res) => {
  try {
    const { system, mode, x, y, color } = req.body;
    const galaxy = await loadState('galaxy') || { players: {} };
    if (!galaxy.players) galaxy.players = {};
    galaxy.players[req.params.id] = {
      currentSystem: system, mode, lastSeen: new Date().toISOString(),
      pos: { x, y }, color: color || '#44ccff'
    };
    await saveState('galaxy', galaxy);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Starbound Tactics server running at http://localhost:${PORT}`);
  console.log(S3 ? `✓ DO Spaces connected (${BUCKET})` : '⚠ DO Spaces not configured — using local JSON files');
});
