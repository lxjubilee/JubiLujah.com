import { Router, raw } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { isUuid } from '../ids.js';
import { config } from '../config.js';
import { HttpError, requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { purgeUserAccount } from '../auth/session.js';
import { getSongById, getAlbumByCode } from '../manifest.js';
import { geoLookup } from '../util/geo.js';
import { r2Put, r2Configured } from '../util/r2.js';
import { rewriteCoverVersions } from '../util/coverVersions.js';

// The four admin-grantable roles. Every account also carries the baseline
// `viewer` (view + play), which is implicit and never removable.
const GRANTABLE_ROLES = ['reviewer', 'content_editor', 'executive', 'admin'];

// §14 admin surface. Every route here is admin-only (also enforced at the
// router mount in index.js).
const router = Router();
router.use(requireRole('admin'));

router.get('/users', ah(async (req, res) => {
  const r = await query(
    `SELECT u.id, u.email, u.display_name, u.first_name, u.last_name,
            u.is_active, u.last_login_at, u.created_at,
            COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM identity.users u
       LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at`
  );
  res.json(r.rows);
}));

// Update a user's first/last name. display_name is kept as the derived
// "First Last" used everywhere else (tokens, UI); empty parts are dropped so a
// name with only a first or only a last still produces a sane display_name.
const nameSchema = z.object({
  first_name: z.string().trim().max(120).optional().default(''),
  last_name: z.string().trim().max(120).optional().default(''),
});
router.patch('/users/:id', validate(nameSchema), ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid user id');
  const first = req.body.first_name || null;
  const last = req.body.last_name || null;
  const display = [first, last].filter(Boolean).join(' ').trim();
  if (!display) throw new HttpError(400, 'a first or last name is required');

  const r = await query(
    `UPDATE identity.users
        SET first_name = $2, last_name = $3, display_name = $4, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, display_name, first_name, last_name`,
    [id, first, last, display]
  );
  if (r.rowCount === 0) throw new HttpError(404, 'user not found');
  await query(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, 'user.rename', 'user', $2, $3)`,
    [req.auth.user.id, id, JSON.stringify({ first_name: first, last_name: last })]
  );
  res.json(r.rows[0]);
}));

// Remove an account from the system (hard delete). Admins cannot delete their
// own account here (avoids locking yourself out / removing the last admin by
// accident) — use the self-service flow for that.
router.delete('/users/:id', ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid user id');
  if (id === req.auth.user.id) throw new HttpError(400, 'you cannot delete your own account from here');

  const found = await query('SELECT id, email FROM identity.users WHERE id = $1', [id]);
  if (found.rowCount === 0) throw new HttpError(404, 'user not found');
  const { email } = found.rows[0];

  await withTransaction(async (client) => {
    await purgeUserAccount(client, id, email);
    await client.query(
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, 'user.delete', 'user', $2, $3)`,
      [req.auth.user.id, id, JSON.stringify({ email })]
    );
  });
  res.json({ ok: true, deleted: id });
}));

// Grant/revoke roles. The request carries the desired grantable-role set; the
// baseline `viewer` (view + play) is always forced on and can never be removed.
const rolesSchema = z.object({ roles: z.array(z.enum(GRANTABLE_ROLES)).max(GRANTABLE_ROLES.length) });
router.patch('/users/:id/roles', validate(rolesSchema), ah(async (req, res) => {
  const { id } = req.params;
  if (!isUuid(id)) throw new HttpError(400, 'invalid user id');
  const want = new Set(['viewer', ...req.body.roles]);

  await withTransaction(async (client) => {
    const existing = await client.query('SELECT role FROM identity.user_roles WHERE user_id = $1', [id]);
    const have = new Set(existing.rows.map((r) => r.role));
    for (const role of want) {
      if (!have.has(role)) {
        await client.query(
          `INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`, [id, role, req.auth.user.id]);
      }
    }
    for (const role of have) {
      if (!want.has(role)) {
        await client.query('DELETE FROM identity.user_roles WHERE user_id = $1 AND role = $2', [id, role]);
      }
    }
    await client.query(
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, 'role.set', 'user', $2, $3)`,
      [req.auth.user.id, id, JSON.stringify({ roles: [...want] })]
    );
  });
  res.json({ user_id: id, roles: [...want] });
}));

// Paying subscribers + monthly recurring total. Lists every live paid
// subscription (active / past_due) with the user, plan, and the per-month amount
// (annual plans normalized to a monthly figure). The monthly total is the sum of
// those per-month amounts — i.e., current monthly recurring revenue.
router.get('/subscribers', ah(async (req, res) => {
  const r = await query(
    `SELECT s.id, s.user_id, u.display_name, u.email,
            p.code AS plan_code, p.name AS plan_name, p.currency,
            p.billing_interval, p.price_cents,
            CASE WHEN p.billing_interval = 'year'
                 THEN ROUND(p.price_cents / 12.0)::int
                 ELSE p.price_cents END AS monthly_cents,
            s.status, s.current_period_end, s.cancel_at_period_end, s.started_at
       FROM production.subscriptions s
       JOIN production.subscription_plans p ON p.id = s.plan_id
       JOIN identity.users u ON u.id = s.user_id
      WHERE p.is_paid = TRUE
        AND s.status IN ('active', 'past_due')
      ORDER BY (s.status = 'active') DESC, monthly_cents DESC, u.display_name`
  );
  const subscribers = r.rows;
  const monthly_total_cents = subscribers.reduce((sum, x) => sum + (x.monthly_cents || 0), 0);
  // Per-plan rollup (count + subtotal) for the summary line.
  const byPlan = {};
  for (const x of subscribers) {
    const k = x.plan_name || x.plan_code;
    if (!byPlan[k]) byPlan[k] = { plan: k, count: 0, monthly_cents_each: x.monthly_cents, subtotal_cents: 0 };
    byPlan[k].count += 1;
    byPlan[k].subtotal_cents += x.monthly_cents || 0;
  }
  res.json({
    currency: subscribers[0]?.currency || 'usd',
    count: subscribers.length,
    monthly_total_cents,
    by_plan: Object.values(byPlan),
    subscribers,
  });
}));

// Real-time Active Listeners — who is listening right now and to what. Reads the
// ephemeral now_playing presence rows (live = updated within ~45s), resolves the
// song/album/track from the manifest and a best-effort location from the IP.
router.get('/active-listeners', ah(async (req, res) => {
  const r = await query(
    `SELECT np.session_id, np.song_id, np.ip_address, np.started_at, np.updated_at,
            u.display_name, u.first_name, u.last_name
       FROM production.now_playing np
       JOIN identity.users u ON u.id = np.user_id
      WHERE np.updated_at > NOW() - INTERVAL '45 seconds'
      ORDER BY np.updated_at DESC`
  );
  const listeners = await Promise.all(r.rows.map(async (x) => {
    const song = getSongById(x.song_id);
    const name = [x.first_name, x.last_name].filter(Boolean).join(' ').trim() || x.display_name;
    return {
      session_id: x.session_id,
      name,
      location: await geoLookup(x.ip_address),
      album: song?.album || '—',
      track: song?.n ?? null,
      song: song?.title || '—',
      code: song?.code || null,
      cover: song?.code ? `/cover/${song.code}.png` : null,
      since: x.started_at,
    };
  }));
  res.json({ count: listeners.length, listeners });
}));

// ---- Album cover replacement (admin) --------------------------------------
// Upload a new cover image (raw image body) → write to R2 at the album's
// artwork key → bump the cache-bust version → flag for J: drive sync. The
// image bytes come in as the raw request body (express.raw); express.json is
// skipped because the content-type is image/*.
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
router.post('/covers/:code', raw({ type: COVER_TYPES, limit: '10mb' }), ah(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase().replace(/\.PNG$/i, '');
  if (!/^[A-Z0-9]+$/.test(code)) throw new HttpError(400, 'invalid album code');
  const album = getAlbumByCode(code);
  if (!album || !album.path) throw new HttpError(404, 'unknown album');
  if (!r2Configured()) throw new HttpError(503, 'Cover upload is not activated yet — R2 credentials are not set on the server.');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length === 0) throw new HttpError(400, 'no image data (send the file as the raw body with an image content-type)');
  const ct = (req.get('content-type') || 'image/png').split(';')[0].trim();
  if (!COVER_TYPES.includes(ct)) throw new HttpError(415, 'unsupported image type');

  // Canonical cover key (always .png path, mirrors J:). R2 ignores the source
  // type for the key; we store the bytes as-is with the right content-type.
  const key = `music/${album.path}/artwork/${code}.png`;
  await r2Put(key, buf, ct);

  const r = await query(
    `INSERT INTO production.cover_updates (album_code, version, content_type, bytes, updated_by, synced_to_j, updated_at, synced_at)
       VALUES ($1, 1, $2, $3, $4, FALSE, NOW(), NULL)
     ON CONFLICT (album_code) DO UPDATE
       SET version = cover_updates.version + 1, content_type = $2, bytes = $3,
           updated_by = $4, synced_to_j = FALSE, updated_at = NOW(), synced_at = NULL
     RETURNING version`,
    [code, ct, buf.length, req.auth.user.id]
  );
  const version = r.rows[0].version;
  await rewriteCoverVersions();   // refresh the ?v= map for web + API

  // Re-render the catalog pages so they emit the new ?v cover URL right away
  // (otherwise the statically-cached pages keep the old cover until ISR cycles).
  if (config.revalidate.secret) {
    try {
      await fetch(`${config.revalidate.webUrl}/revalidate?secret=${encodeURIComponent(config.revalidate.secret)}`,
        { method: 'POST', signal: AbortSignal.timeout(5000) });
    } catch { /* best-effort */ }
  }

  await query(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, 'cover.update', 'album', $2, $3)`,
    [req.auth.user.id, code, JSON.stringify({ version, bytes: buf.length })]
  ).catch(() => {});

  res.json({ ok: true, code, version, url: `${config.cdnBase}/${key}?v=${version}` });
}));

// Covers still pending a copy back to the J: drive (consumed by the studio-side
// sync script). mark-synced clears the flag once a cover has been copied.
router.get('/covers/pending-sync', ah(async (req, res) => {
  const r = await query(
    `SELECT album_code, version, content_type, bytes, updated_at
       FROM production.cover_updates WHERE synced_to_j = FALSE ORDER BY updated_at`
  );
  res.json({
    pending: r.rows.map((x) => {
      const a = getAlbumByCode(x.album_code);
      return { ...x, path: a?.path || null, key: a?.path ? `music/${a.path}/artwork/${x.album_code}.png` : null };
    }),
  });
}));
router.post('/covers/:code/mark-synced', ah(async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  await query('UPDATE production.cover_updates SET synced_to_j = TRUE, synced_at = NOW() WHERE album_code = $1', [code]);
  res.json({ ok: true, code });
}));

router.get('/audit', ah(async (req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : null;
  const params = [];
  let where = '';
  if (since) { params.push(since); where = 'WHERE created_at >= $1'; }
  const r = await query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.payload, a.created_at,
            u.display_name AS actor
       FROM identity.audit_log a
       LEFT JOIN identity.users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC LIMIT 500`,
    params
  );
  res.json(r.rows);
}));

// Publish a song/album: record a publication version + advance pipeline. The
// real CDN PUT is out of scope for the local foundation; this captures the
// authoritative DB side of §17 (publications + pipeline transition).
router.post('/publish/:type/:id', ah(async (req, res) => {
  const { type, id } = req.params;
  if (!['song', 'album', 'playlist', 'program'].includes(type)) throw new HttpError(400, 'invalid type');
  if (!isUuid(id)) throw new HttpError(400, 'invalid id');

  const result = await withTransaction(async (client) => {
    const verRes = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next
         FROM production.publications WHERE rateable_type = $1 AND rateable_id = $2`,
      [type, id]
    );
    const version = verRes.rows[0].next;
    const cdnPath = `catalog/${type}s/${id}.json`;
    const contentHash = crypto.createHash('sha256').update(`${type}:${id}:${version}`).digest('hex');
    await client.query(
      `INSERT INTO production.publications
         (rateable_type, rateable_id, version, cdn_path, content_hash, published_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, id, version, cdnPath, contentHash, req.auth.user.id]
    );
    if (type === 'song' || type === 'album') {
      const cur = await client.query(
        'SELECT current_stage FROM production.pipeline_state WHERE rateable_type = $1 AND rateable_id = $2',
        [type, id]
      );
      const from = cur.rowCount ? cur.rows[0].current_stage : null;
      if (cur.rowCount) {
        await client.query(
          `UPDATE production.pipeline_state SET current_stage = 'published', entered_stage_at = NOW()
            WHERE rateable_type = $1 AND rateable_id = $2`, [type, id]);
      } else {
        await client.query(
          `INSERT INTO production.pipeline_state (rateable_type, rateable_id, current_stage)
             VALUES ($1, $2, 'published')`, [type, id]);
      }
      await client.query(
        `INSERT INTO production.pipeline_history
           (rateable_type, rateable_id, from_stage, to_stage, actor_user_id, note)
           VALUES ($1, $2, $3, 'published', $4, 'admin publish')`,
        [type, id, from, req.auth.user.id]
      );
    }
    return { version, cdn_path: cdnPath, content_hash: contentHash };
  });

  res.json({ rateable_type: type, rateable_id: id, published: true, cdn_base: config.cdnBase, ...result });
}));

export default router;
