import { Router } from 'express';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { config } from '../config.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { logger } from '../logger.js';

// ============================================================================
// Publish to Production (admin). The CREATIVE BRIDGE: the page is on the public
// site, but J: lives on the local network — so these endpoints only do real work
// when the API is running on the studio machine (J: mounted). There they scan J:
// for albums whose audio isn't fully live, and on publish they spawn the local
// orchestrator (rclone upload to R2 → manifest → deploy). On the prod server
// (no J:) /candidates reports available:false so the page guides the admin.
// ============================================================================
const router = Router();
router.use(requireRole('admin'));

const J_ROOT = process.env.ARTWORK_BASE || 'J:/music';
const ORCHESTRATOR = process.env.PUBLISH_SCRIPT || 'C:/jubilujah-local/publish-to-production.js';
const jAvailable = () => { try { return fs.existsSync(`${J_ROOT}/albums`); } catch { return false; } };

const isDup = (f) => / \(\d+\)\.mp3$/i.test(f);
// Unique track count on J: (dedup the Windows "(1)" copies, like the orchestrator).
function jTrackCount(rel) {
  try {
    const files = fs.readdirSync(`${J_ROOT}/${rel}/tracks`).filter((f) => /\.mp3$/i.test(f));
    const nums = new Set();
    for (const f of files) { const m = f.match(/^(\d+)/); nums.add(m ? m[1] : f); }
    // (a (1) dup shares a number, so the Set already dedups by track number)
    return nums.size;
  } catch { return 0; }
}

// Albums with audio on J: that isn't fully live on the CDN/site yet.
router.get('/candidates', ah(async (_req, res) => {
  if (!jAvailable()) return res.json({ available: false, candidates: [] });
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(config.manifestPath, 'utf8')); }
  catch { throw new HttpError(500, 'manifest unreadable'); }

  const candidates = [];
  for (const c of manifest.categories || []) for (const a of c.artists || []) for (const al of a.albums || []) {
    if (!al.path) continue;
    const j = jTrackCount(al.path);
    const live = al.playable || 0;
    if (j > live) candidates.push({ code: al.code, title: al.title, artist: a.name, jTracks: j, live, path: al.path });
  }
  candidates.sort((x, y) => x.artist.localeCompare(y.artist) || x.code.localeCompare(y.code));
  res.json({ available: true, count: candidates.length, candidates });
}));

// Publish the given album codes: spawn the studio-side orchestrator and return
// its NDJSON progress once it finishes (upload → manifest → deploy).
router.post('/', ah(async (req, res) => {
  if (!jAvailable()) throw new HttpError(400, 'The J: drive is not reachable here — open Publish to Production from the studio machine (localhost).');
  const codes = (Array.isArray(req.body?.codes) ? req.body.codes : [])
    .map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z0-9]+$/.test(c));
  if (!codes.length) throw new HttpError(400, 'no album codes given');
  if (codes.length > 400) throw new HttpError(400, 'too many at once');

  await query(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, 'publish.run', 'album', $2, $3)`,
    [req.auth.user.id, codes[0], JSON.stringify({ codes })]
  ).catch(() => {});

  const steps = [];
  await new Promise((resolve) => {
    const child = spawn('node', [ORCHESTRATOR, ...codes], { windowsHide: true });
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) { try { steps.push(JSON.parse(line)); } catch { steps.push({ raw: line }); } }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => logger.warn({ pub: d.toString().slice(0, 200) }, 'publish stderr'));
    child.on('error', (e) => { steps.push({ done: true, ok: false, error: 'spawn failed: ' + e.message }); resolve(); });
    child.on('close', () => { if (buf.trim()) { try { steps.push(JSON.parse(buf.trim())); } catch {} } resolve(); });
  });

  const final = steps[steps.length - 1] || {};
  res.json({ ok: final.ok !== false, steps, codes });
}));

export default router;
