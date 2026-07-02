import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { validate } from '../middleware/validate.js';
import { query } from '../db.js';

// Public (no-auth) endpoint the mobile app calls after its splash screen to
// learn whether a newer build is available. Data lives in
// production.mobile_app_versions (one row per platform); an admin bumps
// `latest_version` (optional update) or sets `mandatory`/raises
// `min_supported_version` (force update). See migration 0020.
const router = Router();

// A dotted numeric version, e.g. "2.0.0" (also accepts "2.0" / "2").
const SEMVER = /^\d+(\.\d+){0,3}$/;

const checkSchema = z.object({
  platform: z.enum(['ios', 'android']),
  current_version: z.string().regex(SEMVER, 'must be a dotted version like 2.0.0'),
});

/** Compare dotted versions. Returns -1 if a<b, 0 if equal, 1 if a>b. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// GET /api/app-version/check?platform=ios|android&current_version=2.0.0
router.get('/check', validate(checkSchema, 'query'), ah(async (req, res) => {
  const { platform, current_version } = req.query;

  const r = await query(
    `SELECT latest_version, min_supported_version, store_url, title, message, mandatory
       FROM production.mobile_app_versions
      WHERE platform = $1`,
    [platform],
  );
  const row = r.rows[0];

  // No config for this platform → never prompt (fail open).
  if (!row) {
    res.json({ update_available: false, current_version });
    return;
  }

  const behindLatest = compareVersions(current_version, row.latest_version) < 0;
  const belowMinimum = compareVersions(current_version, row.min_supported_version) < 0;

  res.json({
    update_available: behindLatest,
    current_version,
    latest_version: row.latest_version,
    min_supported_version: row.min_supported_version,
    // Force the update when the build is unsupported, or the row is flagged.
    mandatory: behindLatest && (belowMinimum || row.mandatory === true),
    store_url: row.store_url,
    title: row.title ?? null,
    message: row.message ?? null,
  });
}));

export default router;
