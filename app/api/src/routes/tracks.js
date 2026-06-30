import { Router, raw } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ah } from '../util/async.js';
import { config } from '../config.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { getAlbumByCode } from '../manifest.js';

// ============================================================================
// Track Manager (admin) — list / delete / upload an album's .mp3 files ON THE
// J: STUDIO DRIVE. Like Publish to Production, this only works where J: is
// mounted (the studio machine's local API); on prod it reports available:false.
// Uploaded tracks land on J: and are later pushed live via /admin/publish.
// ============================================================================
const router = Router();
router.use(requireRole('admin'));

const J_ROOT = process.env.ARTWORK_BASE || 'J:/music';
const jAvailable = () => { try { return fs.existsSync(`${J_ROOT}/albums`); } catch { return false; } };
// Allow normal track filenames; block path traversal / separators.
const safeName = (n) => typeof n === 'string' && /\.mp3$/i.test(n) && !/[/\\]/.test(n) && !n.includes('..') && n.length <= 200;

function tracksDir(code) {
  const a = getAlbumByCode(String(code).toUpperCase());
  return a && a.path ? `${J_ROOT}/${a.path}/tracks` : null;
}

// List the album's .mp3 files on J:.
router.get('/:code', ah(async (req, res) => {
  if (!jAvailable()) return res.json({ available: false, tracks: [] });
  const dir = tracksDir(req.params.code);
  if (!dir) throw new HttpError(404, 'unknown album');
  let tracks = [];
  try {
    tracks = fs.readdirSync(dir).filter((f) => /\.mp3$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => {
        const st = fs.statSync(path.join(dir, f));
        const mm = f.match(/^(\d+)[ _-]+(.*)\.mp3$/i);
        return { file: f, n: mm ? parseInt(mm[1], 10) : null, title: mm ? mm[2] : f.replace(/\.mp3$/i, ''), sizeKB: Math.round(st.size / 1024) };
      });
  } catch { /* no tracks dir yet */ }
  res.json({ available: true, code: String(req.params.code).toUpperCase(), count: tracks.length, tracks });
}));

// Delete one .mp3 from J: (the UI confirms first).
router.delete('/:code', ah(async (req, res) => {
  if (!jAvailable()) throw new HttpError(400, 'J: is not reachable here — use the studio machine.');
  const dir = tracksDir(req.params.code);
  if (!dir) throw new HttpError(404, 'unknown album');
  const file = String(req.query.file || req.body?.file || '');
  if (!safeName(file)) throw new HttpError(400, 'bad filename');
  const fp = path.join(dir, file);
  if (!fs.existsSync(fp)) throw new HttpError(404, 'file not found');
  fs.unlinkSync(fp);
  res.json({ ok: true, deleted: file });
}));

// Upload one .mp3 to J: (raw audio body; filename via ?name=). The UI sends each
// selected/dropped file with its own name.
router.post('/:code', raw({ type: () => true, limit: '80mb' }), ah(async (req, res) => {
  if (!jAvailable()) throw new HttpError(400, 'J: is not reachable here — use the studio machine.');
  const dir = tracksDir(req.params.code);
  if (!dir) throw new HttpError(404, 'unknown album');
  const name = decodeURIComponent(String(req.query.name || ''));
  if (!safeName(name)) throw new HttpError(400, 'filename must be a .mp3 with no path separators');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'no audio data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), buf);
  res.json({ ok: true, file: name, bytes: buf.length });
}));

export default router;
