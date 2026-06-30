import { Router } from 'express';
import { ah } from '../util/async.js';
import {
  listCategories, listArtists, getArtist, getAlbumByCode, statusCounts, getManifest,
} from '../manifest.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/rbac.js';
import { isAlbumHidden, hiddenSets } from '../services/musicVisibility.js';

// Catalog reads come from the authoritative manifest (public, no auth required
// for browse). Editorial overlays (ratings/comments) live in their own routes.
// Albums an admin has HIDDEN in the Manage Music module are suppressed here so
// they disappear from the public site (BRD: "Hidden albums must not appear
// anywhere on Jubilujah.com"). Admins/reviewers still see everything via the
// admin module. Nothing is hidden until an admin explicitly hides it.
const router = Router();

// A request can opt out of public hiding when it carries elevated roles, so the
// admin/reviewer browse experience is unaffected.
function canSeeHidden(req) {
  const roles = req.auth?.roles || [];
  return roles.includes('admin') || roles.includes('reviewer');
}

router.get('/categories', (req, res) => {
  res.json(listCategories());
});

router.get('/artists', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json(listArtists(category));
});

router.get('/artists/:slug', ah(async (req, res) => {
  const artist = getArtist(req.params.slug);
  if (!artist) throw new HttpError(404, 'Artist not found');
  if (!canSeeHidden(req)) {
    const { albumCodes } = await hiddenSets();
    artist.albums = (artist.albums || []).filter((a) => !albumCodes.has(String(a.code).toUpperCase()));
  }
  res.json(artist);
}));

router.get('/albums/:code', ah(async (req, res) => {
  const album = getAlbumByCode(req.params.code);
  if (!album) throw new HttpError(404, 'Album not found');
  if (!canSeeHidden(req) && await isAlbumHidden(album.code)) throw new HttpError(404, 'Album not found');
  res.json(album);
}));

// Legacy-compatible alias: /api/album?code=XXX or ?path=cat/artist/folder
router.get('/album', ah(async (req, res) => {
  const { code, path: relPath } = req.query;
  if (code) {
    const album = getAlbumByCode(code);
    if (!album) throw new HttpError(404, 'Album not found');
    if (!canSeeHidden(req) && await isAlbumHidden(album.code)) throw new HttpError(404, 'Album not found');
    return res.json(album);
  }
  if (relPath) {
    // Resolve by matching the manifest album path tail.
    const m = getManifest();
    for (const album of m.byAlbumCode.values()) {
      if (album.path && relPath.endsWith(album.folder)) {
        if (!canSeeHidden(req) && await isAlbumHidden(album.code)) throw new HttpError(404, 'Album not found');
        return res.json(getAlbumByCode(album.code));
      }
    }
    throw new HttpError(404, 'Album not found for path');
  }
  throw new HttpError(400, 'code or path query param required');
}));

router.get('/status-counts', (req, res) => {
  const scope = typeof req.query.scope === 'string' ? req.query.scope : 'all';
  res.json(statusCounts(scope));
});

// HEAD-check a single CDN audio URL (ported from legacy /api/cdn-probe).
router.get('/cdn-probe', ah(async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url.startsWith(config.cdnBase)) throw new HttpError(400, 'url must be a CDN URL');
  try {
    const head = await fetch(url, { method: 'HEAD' });
    res.json({ url, ok: head.ok, status: head.status, contentType: head.headers.get('content-type') });
  } catch (err) {
    res.json({ url, ok: false, status: 0, error: err.message });
  }
}));

export default router;
