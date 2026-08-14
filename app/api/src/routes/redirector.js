'use strict';
// ============================================================================
// Redirector API — software/redirector.md §9, §10, §14, §15.
//
// Mounted at /api/redirector. Three surfaces share the mount:
//   - Public       : GET /qr/:file (QR images), and (via the web /r/ route)
//                    GET /resolve/:input guarded by the internal shared key.
//   - Automation   : the §14 endpoints below — assets, tokens (single/bulk/
//                    campaign-set), taxonomy, rules, aliases (request/approve),
//                    lookup, retire, health. Authenticated by X-Redirector-Key
//                    OR an SSO role (requireRedirectorAuth), idempotent on POST
//                    (§14.2), and audited on every mutation (§18.4).
//
// Tokens point at a canonical asset id, never a storage path (§4). content_kind
// is immutable across a token's life (§5.3), enforced here on supersede.
// ============================================================================
import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { logger } from '../logger.js';
import { requireRedirectorAuth } from '../middleware/redirectorAuth.js';
import { idempotent } from '../redirector/idempotency.js';
import { writeAudit } from '../redirector/audit.js';
import { resolveToken, logScan, logProbe } from '../redirector/resolver.js';
import { mintEphemeral, resolveEphemeral } from '../redirector/ephemeral.js';
import {
  generateUniqueToken,
  isValidTokenShape,
  isValidAliasShape,
  isBlocked,
  normalize,
  normalizeToken,
} from '../redirector/tokens.js';
import { getImage, renderOnCreate } from '../redirector/qr/index.js';
import { loadTaxonomyProfile } from '../redirector/profiles.js';
import { loadProfile as loadQrProfile } from '../redirector/qr/style.js';
import { validateRuleParams, evaluateRule, zonedParts } from '../redirector/rules/engine.js';
import * as reports from '../redirector/reports.js';

const router = Router();

// ============================================================================
// Public: QR image serving (§10)
// ============================================================================
// A QR image encodes only the public /r/ URL, never a destination, so nothing
// is secret. Images are immutable artifacts of the token string (§10.1) → a
// one-year immutable cache. Shape-validated with no DB hit (works in failover).
const QR_FILE_RE = /^([A-Za-z0-9]{12})\.(svg|png)$/;
router.get(
  '/qr/:file',
  ah(async (req, res) => {
    const mt = QR_FILE_RE.exec(req.params.file || '');
    if (!mt) return res.status(404).end();
    const token = mt[1]; // case-sensitive (Base58)
    const format = mt[2].toLowerCase();
    if (!isValidTokenShape(token)) return res.status(404).end();
    const variant = typeof req.query.variant === 'string' ? req.query.variant : 'standard';
    const size = req.query.size ? parseInt(String(req.query.size), 10) : 1024;
    const prefix = req.query.rp ? 'RP' : 'R'; // §6.7 ephemeral persona-token QR encodes /rp/
    // Display-only tighter quiet zone for admin thumbnails (SVG only); clamped in getImage.
    const qz = req.query.qz != null ? parseInt(String(req.query.qz), 10) : undefined;
    const img = await getImage(token, { variant, format, size, prefix, qz });
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Robots-Tag', 'noindex');
    if (img.variant === 'print') res.set('X-QR-Min-Print', '2cm'); // §10.3 min physical size
    res.type(img.contentType).send(img.body);
  }),
);

// ============================================================================
// Internal: resolve (called by the web /r/ route)
// ============================================================================
function requireInternal(req, res, next) {
  const key = req.get('x-redirector-internal') || '';
  if (!config.redirector.internalKey || key !== config.redirector.internalKey) {
    return res.status(404).end(); // do not advertise the endpoint
  }
  next();
}

router.get(
  '/resolve/:input',
  requireInternal,
  ah(async (req, res) => {
    // §6.6 resume context: rpos = the scanner's anonymous cookie position (set by
    // the web layer), radv = advance/consume (from the tracked /go action), and
    // action=start_over resets progress.
    const rpos = parseInt(String(req.query.rpos), 10);
    const result = await resolveToken(req.params.input, {
      userAgent: req.get('user-agent') || '',
      country: req.get('cf-ipcountry') || null, // §7 geo_route / time_of_day context
      resume: {
        cookiePos: Number.isFinite(rpos) ? rpos : null,
        accountId: null, // public route: no server-visible SSO session (see notes)
        advance: req.query.radv === '1',
        reset: req.query.action === 'start_over',
      },
    });
    if (result.token) {
      logScan(result, {
        ip: req.get('x-forwarded-for') || req.ip,
        userAgent: req.get('user-agent') || '',
        referrer: req.get('referer') || null,
        country: req.get('cf-ipcountry') || null,
        landingAction: typeof req.query.action === 'string' ? req.query.action : null, // §11.2
      });
    } else if (result.outcome === 'notfound') {
      logger.warn({ input: String(req.params.input).slice(0, 24) }, 'redirector: unknown token probe');
      logProbe(req.params.input, { ip: req.get('x-forwarded-for') || req.ip, userAgent: req.get('user-agent') || '' });
    }
    res.json(result);
  }),
);

// §6.7 — internal resolve for ephemeral persona tokens (served at /rp/).
router.get(
  '/resolve/rp/:token',
  requireInternal,
  ah(async (req, res) => {
    const result = await resolveEphemeral(req.params.token, { userAgent: req.get('user-agent') || '' });
    if (result.token) {
      logScan(result, {
        ip: req.get('x-forwarded-for') || req.ip,
        userAgent: req.get('user-agent') || '',
        referrer: req.get('referer') || null,
        country: req.get('cf-ipcountry') || null,
        landingAction: typeof req.query.action === 'string' ? req.query.action : null,
      });
    }
    res.json(result);
  }),
);

// ============================================================================
// Shared helpers for the automation API
// ============================================================================
const KINDS = ['album', 'track', 'book', 'chapter', 'article', 'app', 'devotional', 'image', 'video', 'pdf', 'external'];
const STRATEGIES = ['calendar_map', 'sequence_daily', 'sequence_weekly', 'date_range', 'random_pool', 'latest_in_collection', 'geo_route', 'time_of_day'];

function tokenUrls(token) {
  const base = config.redirector.baseUrl;
  return {
    token,
    url: `${base}/r/${token}`,
    qr_svg_url: `${base}/qr/${token}.svg`,
    qr_png_url: `${base}/qr/${token}.png`,
  };
}

// created_via reflects the caller: SSO console vs a scoped automation consumer.
function createdVia(rdrAuth) {
  if (rdrAuth?.via === 'sso') return 'admin_ui';
  if (rdrAuth?.consumer === 'pipeline') return 'ipx_pipeline';
  if (rdrAuth?.consumer === 'persona') return 'persona';
  return 'api';
}

// Namespace-uniqueness across tokens AND aliases (§3.5), plus in-batch dedup.
function existsWith(q, seen) {
  return async (candidate) => {
    if (seen && seen.has(candidate)) return true;
    const r = await q(
      `SELECT 1 FROM redirector.tokens WHERE token = $1
       UNION ALL SELECT 1 FROM redirector.aliases WHERE alias = $1 LIMIT 1`,
      [candidate],
    );
    return r.rowCount > 0;
  };
}

// Insert one token row. `q` is a query fn (pool or transaction client). Resolves
// content_kind from the asset when in asset mode so §5 kind-immutability holds.
// Returns the generated token string.
async function insertToken(q, body, rdrAuth, seen) {
  let contentKind = body.content_kind || null;
  if (body.resolution_mode === 'asset') {
    const a = await q('SELECT content_kind FROM redirector.assets WHERE asset_id = $1', [body.asset_id]);
    if (!a.rows[0]) throw new HttpError(400, 'asset_id does not exist');
    contentKind = a.rows[0].content_kind;
  }
  const token = await generateUniqueToken(existsWith(q, seen));
  if (seen) seen.add(token);
  await q(
    `INSERT INTO redirector.tokens
       (token, token_type, resolution_mode, asset_id, rule_id, resume_node_id, content_kind,
        device_routes_json, landing_enabled, label, campaign, placement, created_by, created_via)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [token, body.token_type, body.resolution_mode, body.asset_id || null, body.rule_id || null,
     body.resume_node_id || null, contentKind, body.device_routes_json || null,
     body.landing_enabled ?? false, body.label || null, body.campaign || null, body.placement || null,
     rdrAuth.actor, createdVia(rdrAuth)],
  );
  return token;
}

// ============================================================================
// §14 POST /assets — register an asset
// ============================================================================
const assetSchema = z.object({
  content_kind: z.enum(KINDS),
  title: z.string().min(1).max(300),
  storage_url: z.string().url().max(1000).optional(),
  storage_provider: z.string().max(64).optional(),
  slug: z.string().max(200).optional(),
  mime_type: z.string().max(128).optional(),
  byte_size: z.number().int().nonnegative().optional(),
  checksum_sha256: z.string().length(64).optional(),
  keywords: z.string().max(1000).optional(),   // §15.1 — required for persona lookup
  summary: z.string().max(500).optional(),
  cover_image_url: z.string().url().max(1000).optional(),
  taxonomy_node_id: z.string().uuid().optional(),
  sort_order: z.number().int().optional(),
  published_at: z.string().datetime().optional(),
  ipx_number: z.string().max(32).optional(),
});

router.post(
  '/assets',
  requireRedirectorAuth('editor'),
  idempotent('assets.create'),
  validate(assetSchema),
  ah(async (req, res) => {
    const b = req.body;
    const r = await query(
      `INSERT INTO redirector.assets
         (content_kind, title, slug, storage_url, storage_provider, mime_type, byte_size, checksum_sha256,
          keywords, summary, cover_image_url, taxonomy_node_id, sort_order, published_at, ipx_number)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING asset_id`,
      [b.content_kind, b.title, b.slug || null, b.storage_url || null, b.storage_provider || null,
       b.mime_type || null, b.byte_size ?? null, b.checksum_sha256 || null, b.keywords || null,
       b.summary || null, b.cover_image_url || null, b.taxonomy_node_id || null, b.sort_order ?? null,
       b.published_at || null, b.ipx_number || null],
    );
    const assetId = r.rows[0].asset_id;
    writeAudit(req.rdrAuth, 'asset.create', 'asset', assetId, null, { content_kind: b.content_kind, title: b.title });
    res.status(201).json({ asset_id: assetId });
  }),
);

// ============================================================================
// §14 PATCH /assets/:id — update storage location, keywords, summary, etc.
// ============================================================================
// content_kind is deliberately absent: a token's kind is immutable (§5.3), so an
// asset's kind must not drift underneath it. Only mutable fields are accepted.
const assetPatchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  slug: z.string().max(200).optional(),
  storage_url: z.string().url().max(1000).optional(),
  storage_provider: z.string().max(64).optional(),
  mime_type: z.string().max(128).optional(),
  byte_size: z.number().int().nonnegative().optional(),
  checksum_sha256: z.string().length(64).optional(),
  keywords: z.string().max(1000).optional(),
  summary: z.string().max(500).optional(),
  cover_image_url: z.string().url().max(1000).optional(),
  taxonomy_node_id: z.string().uuid().optional(),
  sort_order: z.number().int().optional(),
  published_at: z.string().datetime().optional(),
  is_active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'no updatable fields provided' });

router.patch(
  '/assets/:id',
  requireRedirectorAuth('editor'),
  validate(assetPatchSchema),
  ah(async (req, res) => {
    const id = req.params.id;
    const before = await query('SELECT * FROM redirector.assets WHERE asset_id = $1', [id]);
    if (!before.rows[0]) throw new HttpError(404, 'asset not found');
    const fields = req.body;
    const cols = Object.keys(fields);
    const set = cols.map((c, i) => `${c} = $${i + 2}`).concat('updated_at = NOW()').join(', ');
    const params = [id, ...cols.map((c) => fields[c])];
    const r = await query(`UPDATE redirector.assets SET ${set} WHERE asset_id = $1 RETURNING *`, params);
    writeAudit(req.rdrAuth, 'asset.update', 'asset', id,
      pick(before.rows[0], cols), pick(r.rows[0], cols));
    res.json({ asset_id: id, updated: cols });
  }),
);
function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// ============================================================================
// §14 POST /tokens — issue a single token
// ============================================================================
const tokenSchema = z
  .object({
    token_type: z.enum(['QR', 'DQR']).default('QR'),
    resolution_mode: z.enum(['asset', 'rule', 'resume']).default('asset'),
    asset_id: z.string().uuid().optional(),
    rule_id: z.string().uuid().optional(),
    resume_node_id: z.string().uuid().optional(),
    content_kind: z.string().max(32).optional(),
    device_routes_json: z.record(z.string()).optional(),
    landing_enabled: z.boolean().optional(),
    label: z.string().max(200).optional(),
    campaign: z.string().max(100).optional(),
    placement: z.string().max(100).optional(),
  })
  .refine((v) => (v.resolution_mode === 'asset' ? !!v.asset_id : true), { message: 'asset_id required for asset mode' })
  .refine((v) => (v.resolution_mode === 'rule' ? !!v.rule_id : true), { message: 'rule_id required for rule mode' })
  .refine((v) => (v.resolution_mode === 'resume' ? !!v.resume_node_id : true), { message: 'resume_node_id required for resume mode' })
  // §6.4 — a route map must carry a mandatory `default`.
  .refine((v) => (!v.device_routes_json || 'default' in v.device_routes_json), { message: 'device_routes_json must include a "default" route' });

router.post(
  '/tokens',
  requireRedirectorAuth('editor'),
  idempotent('tokens.create'),
  validate(tokenSchema),
  ah(async (req, res) => {
    const token = await insertToken(query, req.body, req.rdrAuth);
    renderOnCreate(token); // §10.1 warm standard SVG + 1024 PNG (fire-and-forget)
    writeAudit(req.rdrAuth, 'token.create', 'token', token, null, { mode: req.body.resolution_mode, type: req.body.token_type });
    res.status(201).json(tokenUrls(token));
  }),
);

// ============================================================================
// §14 POST /tokens/bulk — issue tokens for an array of assets in one call
// ============================================================================
const bulkSchema = z.object({
  items: z.array(tokenSchema).min(1).max(500),
});

router.post(
  '/tokens/bulk',
  requireRedirectorAuth('editor'),
  idempotent('tokens.bulk'),
  validate(bulkSchema),
  ah(async (req, res) => {
    const seen = new Set();
    const created = await withTransaction(async (client) => {
      const q = (t, p) => client.query(t, p);
      const out = [];
      for (const item of req.body.items) {
        const token = await insertToken(q, item, req.rdrAuth, seen);
        out.push({ asset_id: item.asset_id || null, ...tokenUrls(token) });
      }
      return out;
    });
    for (const c of created) {
      renderOnCreate(c.token);
      writeAudit(req.rdrAuth, 'token.create', 'token', c.token, null, { via: 'bulk' });
    }
    res.status(201).json({ count: created.length, tokens: created });
  }),
);

// ============================================================================
// §14 POST /tokens/campaign-set — N placement tokens for ONE asset (§17.2)
// ============================================================================
// Each physical placement (book insert, album sleeve, banner, ...) gets its own
// token row with its own `placement`, all sharing one asset_id — so the scan log
// tells you which channel actually moved people, with nothing duplicated
// downstream (the indirection model still holds).
const campaignSetSchema = z.object({
  asset_id: z.string().uuid(),
  campaign: z.string().max(100).optional(),
  token_type: z.enum(['QR', 'DQR']).default('QR'),
  landing_enabled: z.boolean().optional(),
  device_routes_json: z.record(z.string()).optional(),
  placements: z.array(z.string().min(1).max(100)).min(1).max(100),
});

router.post(
  '/tokens/campaign-set',
  requireRedirectorAuth('editor'),
  idempotent('tokens.campaign_set'),
  validate(campaignSetSchema),
  ah(async (req, res) => {
    const b = req.body;
    const seen = new Set();
    const created = await withTransaction(async (client) => {
      const q = (t, p) => client.query(t, p);
      const out = [];
      for (const placement of b.placements) {
        const token = await insertToken(q, {
          token_type: b.token_type,
          resolution_mode: 'asset',
          asset_id: b.asset_id,
          device_routes_json: b.device_routes_json,
          landing_enabled: b.landing_enabled,
          campaign: b.campaign,
          placement,
        }, req.rdrAuth, seen);
        out.push({ placement, ...tokenUrls(token) });
      }
      return out;
    });
    for (const c of created) {
      renderOnCreate(c.token);
      writeAudit(req.rdrAuth, 'token.create', 'token', c.token, null, { campaign: b.campaign, placement: c.placement });
    }
    res.status(201).json({ asset_id: b.asset_id, campaign: b.campaign || null, count: created.length, tokens: created });
  }),
);

// ============================================================================
// §14 POST /taxonomy/nodes — create or update a hierarchy node
// ============================================================================
const nodeSchema = z.object({
  node_id: z.string().uuid().optional(),
  parent_node_id: z.string().uuid().nullable().optional(),
  level_key: z.string().min(1).max(64),
  title: z.string().min(1).max(300),
  slug: z.string().max(200).optional(),
  sort_order: z.number().int().optional(),
  cover_image_url: z.string().url().max(1000).optional(),
  metadata_json: z.record(z.any()).optional(),
});

router.post(
  '/taxonomy/nodes',
  requireRedirectorAuth('manager'),
  idempotent('taxonomy.upsert'),
  validate(nodeSchema),
  ah(async (req, res) => {
    const b = req.body;
    if (b.node_id) {
      const r = await query(
        `UPDATE redirector.taxonomy_nodes
           SET parent_node_id = $2, level_key = $3, title = $4, slug = $5,
               sort_order = COALESCE($6, sort_order), cover_image_url = $7, metadata_json = $8
         WHERE node_id = $1 RETURNING node_id`,
        [b.node_id, b.parent_node_id ?? null, b.level_key, b.title, b.slug || null,
         b.sort_order ?? null, b.cover_image_url || null, b.metadata_json || null],
      );
      if (!r.rows[0]) throw new HttpError(404, 'node not found');
      writeAudit(req.rdrAuth, 'node.update', 'node', b.node_id, null, { level_key: b.level_key, title: b.title });
      return res.json({ node_id: b.node_id, updated: true });
    }
    const r = await query(
      `INSERT INTO redirector.taxonomy_nodes (parent_node_id, level_key, title, slug, sort_order, cover_image_url, metadata_json)
       VALUES ($1,$2,$3,$4,COALESCE($5,0),$6,$7) RETURNING node_id`,
      [b.parent_node_id ?? null, b.level_key, b.title, b.slug || null, b.sort_order ?? null,
       b.cover_image_url || null, b.metadata_json || null],
    );
    writeAudit(req.rdrAuth, 'node.create', 'node', r.rows[0].node_id, null, { level_key: b.level_key, title: b.title });
    res.status(201).json({ node_id: r.rows[0].node_id, updated: false });
  }),
);

// ============================================================================
// §14 POST /rules — create a DQR rule (§7). Evaluation engine is Phase 6; this
// creates and validates the rule row so tokens can reference it.
// ============================================================================
const ruleSchema = z
  .object({
    name: z.string().min(1).max(200),
    strategy: z.enum(STRATEGIES),
    parameters_json: z.record(z.any()).optional(),
    pool_json: z.any().optional(),
    timezone: z.string().max(64).default('America/Los_Angeles'), // IANA name (§7.2)
    default_region: z.string().length(2).optional(),
    fallback_asset_id: z.string().uuid(), // required, never null (§7.2)
  })
  // §7.2 — geo_route must declare a default region.
  .refine((v) => (v.strategy === 'geo_route' ? !!v.default_region : true), { message: 'geo_route requires default_region' });

router.post(
  '/rules',
  requireRedirectorAuth('manager'),
  idempotent('rules.create'),
  validate(ruleSchema),
  ah(async (req, res) => {
    const b = req.body;
    const fb = await query('SELECT 1 FROM redirector.assets WHERE asset_id = $1', [b.fallback_asset_id]);
    if (!fb.rows[0]) throw new HttpError(400, 'fallback_asset_id does not exist');
    // §7.3 — validate strategy params before the rule can be saved.
    try {
      validateRuleParams({ strategy: b.strategy, parameters_json: b.parameters_json, pool_json: b.pool_json, default_region: b.default_region });
    } catch (e) {
      throw new HttpError(400, e.message);
    }
    const r = await query(
      `INSERT INTO redirector.rules (name, strategy, parameters_json, pool_json, timezone, default_region, fallback_asset_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING rule_id`,
      [b.name, b.strategy, b.parameters_json || null, b.pool_json ?? null, b.timezone,
       b.default_region ? b.default_region.toUpperCase() : null, b.fallback_asset_id],
    );
    writeAudit(req.rdrAuth, 'rule.create', 'rule', r.rows[0].rule_id, null, { strategy: b.strategy, name: b.name });
    res.status(201).json({ rule_id: r.rows[0].rule_id });
  }),
);

// ============================================================================
// §7.3 rule preview — resolve a rule (saved OR unsaved) under a chosen date,
// country, and device class, so an operator sees exactly what a DQR would serve
// before saving it. Required before a rule can be saved.
// ============================================================================
const previewRuleSchema = z.object({
  strategy: z.enum(STRATEGIES),
  parameters_json: z.record(z.any()).optional(),
  pool_json: z.any().optional(),
  timezone: z.string().max(64).optional(),
  default_region: z.string().length(2).optional(),
  fallback_asset_id: z.string().uuid().optional(),
});
const previewSchema = z.object({
  rule: previewRuleSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hour: z.number().int().min(0).max(23).optional(),
  country: z.string().length(2).optional(),
  device_class: z.string().max(16).optional(),
});

// Find the UTC instant whose wall-clock in `tz` equals the given date/hour, by a
// single offset correction (exact except across the rare DST-transition hour).
function instantForZonedDate(dateStr, hour, tz) {
  let ms = Date.parse(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
  const p = zonedParts(new Date(ms), tz);
  const target = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10), hour);
  const got = Date.UTC(p.year, p.month - 1, p.day, p.hour);
  return new Date(ms + (target - got));
}

async function runPreview(rule, opts) {
  const tz = rule.timezone || 'America/Los_Angeles';
  const now = opts.date ? instantForZonedDate(opts.date, opts.hour ?? 12, tz) : new Date();
  const deps = {
    latestInCollection: async (nodeId) => {
      if (!nodeId) return null;
      const r = await query(
        `SELECT asset_id FROM redirector.assets WHERE taxonomy_node_id = $1 AND is_active
          ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1`, [nodeId]);
      return r.rows[0]?.asset_id || null;
    },
  };
  let evaluatedId = null;
  try { evaluatedId = await evaluateRule(rule, { now, country: opts.country || null }, deps); } catch { evaluatedId = null; }
  const usedFallback = !evaluatedId;
  const assetId = evaluatedId || rule.fallback_asset_id || null;
  let asset = null;
  if (assetId) {
    const a = await query('SELECT asset_id, title, content_kind, storage_url FROM redirector.assets WHERE asset_id = $1', [assetId]);
    asset = a.rows[0] || null;
  }
  const zp = zonedParts(now, tz);
  return {
    resolved: asset,
    used_fallback: usedFallback,
    context: { date: zp.isoDate, hour: zp.hour, country: opts.country || null, device_class: opts.device_class || null, timezone: tz },
  };
}

router.post(
  '/rules/preview',
  requireRedirectorAuth('manager'),
  validate(previewSchema),
  ah(async (req, res) => {
    if (!req.body.rule) throw new HttpError(400, 'rule is required for an unsaved preview');
    try { validateRuleParams(req.body.rule); } catch (e) { throw new HttpError(400, e.message); }
    res.json(await runPreview(req.body.rule, req.body));
  }),
);

router.post(
  '/rules/:id/preview',
  requireRedirectorAuth('manager'),
  validate(previewSchema),
  ah(async (req, res) => {
    const r = await query('SELECT * FROM redirector.rules WHERE rule_id = $1', [req.params.id]);
    if (!r.rows[0]) throw new HttpError(404, 'rule not found');
    res.json(await runPreview(r.rows[0], req.body));
  }),
);

router.get(
  '/rules/:id',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    const r = await query('SELECT * FROM redirector.rules WHERE rule_id = $1', [req.params.id]);
    if (!r.rows[0]) throw new HttpError(404, 'rule not found');
    res.json(r.rows[0]);
  }),
);

// ============================================================================
// §14 POST /aliases — request a vanity alias (§3.5). Returns pending; a manager
// approves before it resolves.
// ============================================================================
const aliasSchema = z.object({
  token: z.string().length(12),
  alias: z.string().min(4).max(20),
});

router.post(
  '/aliases',
  requireRedirectorAuth('editor'),
  idempotent('aliases.request'),
  validate(aliasSchema),
  ah(async (req, res) => {
    const token = normalizeToken(req.body.token);
    const alias = normalize(req.body.alias);
    if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
    if (!isValidAliasShape(alias)) throw new HttpError(400, 'invalid alias format');
    if (isBlocked(alias)) throw new HttpError(400, 'alias contains a reserved or blocked term');

    const t = await query('SELECT state FROM redirector.tokens WHERE token = $1', [token]);
    if (!t.rows[0]) throw new HttpError(404, 'token not found');

    // Namespace: an alias may never collide with an existing token or alias (§3.5).
    const clash = await query(
      `SELECT 1 FROM redirector.tokens WHERE token = $1
       UNION ALL SELECT 1 FROM redirector.aliases WHERE alias = $1 LIMIT 1`,
      [alias],
    );
    if (clash.rowCount > 0) throw new HttpError(409, 'alias already in use');

    const count = await query('SELECT COUNT(*)::int AS n FROM redirector.aliases WHERE token = $1', [token]);
    if (count.rows[0].n >= 5) throw new HttpError(409, 'maximum 5 aliases per token'); // §3.5

    await query(
      `INSERT INTO redirector.aliases (alias, token, approval_status, requested_by)
       VALUES ($1,$2,'pending',$3)`,
      [alias, token, req.rdrAuth.actor],
    );
    writeAudit(req.rdrAuth, 'alias.request', 'alias', alias, null, { token });
    res.status(201).json({ alias, token, status: 'pending' });
  }),
);

// §14 alias approval — manager only. Immutable once approved (§3.5).
router.post(
  '/aliases/:alias/approve',
  requireRedirectorAuth('manager'),
  ah(async (req, res) => {
    const alias = normalize(req.params.alias);
    const r = await query(
      `UPDATE redirector.aliases
         SET approval_status = 'approved', approved_by = $2, reject_reason = NULL
       WHERE alias = $1 AND approval_status = 'pending' RETURNING token`,
      [alias, req.rdrAuth.actor],
    );
    if (!r.rows[0]) throw new HttpError(404, 'no pending alias by that name');
    writeAudit(req.rdrAuth, 'alias.approve', 'alias', alias, { status: 'pending' }, { status: 'approved' });
    res.json({ alias, token: r.rows[0].token, status: 'approved' });
  }),
);

router.post(
  '/aliases/:alias/reject',
  requireRedirectorAuth('manager'),
  validate(z.object({ reason: z.string().max(300).optional() })),
  ah(async (req, res) => {
    const alias = normalize(req.params.alias);
    const r = await query(
      `UPDATE redirector.aliases
         SET approval_status = 'rejected', reject_reason = $2
       WHERE alias = $1 AND approval_status = 'pending' RETURNING token`,
      [alias, req.body.reason || null],
    );
    if (!r.rows[0]) throw new HttpError(404, 'no pending alias by that name');
    writeAudit(req.rdrAuth, 'alias.reject', 'alias', alias, { status: 'pending' }, { status: 'rejected', reason: req.body.reason || null });
    res.json({ alias, status: 'rejected' });
  }),
);

// ============================================================================
// §15.1 GET /lookup — persona/keyword search. Only assets that have an ACTIVE
// asset-mode token are returned (personas never guess a URL).
// ============================================================================
async function nodePath(nodeId) {
  if (!nodeId) return null;
  const r = await query(
    `WITH RECURSIVE up AS (
       SELECT node_id, parent_node_id, title, 0 AS depth
         FROM redirector.taxonomy_nodes WHERE node_id = $1
       UNION ALL
       SELECT n.node_id, n.parent_node_id, n.title, up.depth + 1
         FROM redirector.taxonomy_nodes n JOIN up ON n.node_id = up.parent_node_id
     )
     SELECT string_agg(title, ' > ' ORDER BY depth DESC) AS path FROM up`,
    [nodeId],
  );
  return r.rows[0]?.path || null;
}

const lookupSchema = z.object({
  kind: z.enum(KINDS).optional(),
  q: z.string().max(200).optional(),
  node: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(3),
});

router.get(
  '/lookup',
  requireRedirectorAuth('viewer'),
  validate(lookupSchema, 'query'),
  ah(async (req, res) => {
    const { kind, q, node, limit } = req.query;
    const r = await query(
      `SELECT a.asset_id, a.title, a.content_kind, a.summary, a.keywords, a.taxonomy_node_id, t.token
         FROM redirector.assets a
         JOIN redirector.tokens t
           ON t.asset_id = a.asset_id AND t.resolution_mode = 'asset' AND t.state = 'active'
        WHERE a.is_active
          AND ($1::text IS NULL OR a.content_kind = $1)
          AND ($2::uuid IS NULL OR a.taxonomy_node_id = $2)
          AND ($3::text IS NULL OR a.keywords ILIKE '%'||$3||'%' OR a.title ILIKE '%'||$3||'%' OR a.summary ILIKE '%'||$3||'%')
        ORDER BY a.published_at DESC NULLS LAST, a.created_at DESC
        LIMIT $4`,
      [kind || null, node || null, q || null, limit],
    );
    const base = config.redirector.baseUrl;
    const results = [];
    for (const row of r.rows) {
      results.push({
        token: row.token,
        title: row.title,
        kind: row.content_kind,
        summary: row.summary || null,
        keywords: row.keywords ? row.keywords.split(',').map((s) => s.trim()).filter(Boolean) : [],
        short_url: `${base}/r/${row.token}`,
        qr_svg_url: `${base}/qr/${row.token}.svg`,
        qr_png_url: `${base}/qr/${row.token}.png`,
        path: await nodePath(row.taxonomy_node_id),
      });
    }
    res.json({ results });
  }),
);

// ============================================================================
// §14 POST /tokens/{token}/retire — retire, optionally superseding
// ============================================================================
const retireSchema = z.object({
  supersede_with: z.string().length(12).optional(),
});

router.post(
  '/tokens/:token/retire',
  requireRedirectorAuth('manager'),
  idempotent('tokens.retire'),
  validate(retireSchema),
  ah(async (req, res) => {
    const token = normalizeToken(req.params.token);
    if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
    const cur = await query('SELECT token, state, content_kind FROM redirector.tokens WHERE token = $1', [token]);
    if (!cur.rows[0]) throw new HttpError(404, 'token not found');

    if (req.body.supersede_with) {
      const target = normalizeToken(req.body.supersede_with);
      const tgt = await query('SELECT content_kind, state FROM redirector.tokens WHERE token = $1', [target]);
      if (!tgt.rows[0]) throw new HttpError(400, 'supersede target not found');
      // §5.3 — kind may never change kind (a song token must not become a book token).
      if (cur.rows[0].content_kind && tgt.rows[0].content_kind && cur.rows[0].content_kind !== tgt.rows[0].content_kind) {
        throw new HttpError(409, 'supersede target has a different content_kind');
      }
      await query(
        `UPDATE redirector.tokens SET state = 'superseded', superseded_by_token = $2 WHERE token = $1`,
        [token, target],
      );
      writeAudit(req.rdrAuth, 'token.retire', 'token', token, { state: cur.rows[0].state }, { state: 'superseded', superseded_by_token: target });
      return res.json({ token, state: 'superseded', superseded_by_token: target });
    }

    await query(`UPDATE redirector.tokens SET state = 'retired' WHERE token = $1`, [token]);
    writeAudit(req.rdrAuth, 'token.retire', 'token', token, { state: cur.rows[0].state }, { state: 'retired' });
    res.json({ token, state: 'retired' });
  }),
);

// ============================================================================
// §14 GET /tokens/{token} — full record
// ============================================================================
router.get(
  '/tokens/:token',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    const token = normalizeToken(req.params.token);
    if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
    const r = await query('SELECT * FROM redirector.tokens WHERE token = $1', [token]);
    if (!r.rows[0]) throw new HttpError(404, 'token not found');
    res.json(r.rows[0]);
  }),
);

// ============================================================================
// §14 GET /health/assets — health watcher results (watcher itself is Phase 7).
// Returns flagged assets by default; ?all=1 returns every asset's health.
// ============================================================================
router.get(
  '/health/assets',
  requireRedirectorAuth('manager'),
  ah(async (req, res) => {
    const all = req.query.all === '1' || req.query.all === 'true';
    const r = await query(
      `SELECT asset_id, title, content_kind, storage_url, health_status, health_checked_at
         FROM redirector.assets
        ${all ? '' : "WHERE health_status <> 'ok'"}
        ORDER BY health_checked_at NULLS FIRST
        LIMIT 500`,
    );
    res.json({ count: r.rows.length, assets: r.rows });
  }),
);

// ============================================================================
// §15.2 POST /persona/token — mint an ephemeral persona recommendation token.
// The context payload is a persona name + one-line reason ONLY (§18.8).
// ============================================================================
const personaTokenSchema = z.object({
  asset_id: z.string().uuid(),
  persona_name: z.string().max(100).optional(),
  reason_text: z.string().max(300).optional(),
});
router.post(
  '/persona/token',
  requireRedirectorAuth('editor'),
  idempotent('persona.token'),
  validate(personaTokenSchema),
  ah(async (req, res) => {
    let minted;
    try { minted = await mintEphemeral(req.body); } catch (e) { throw new HttpError(400, e.message); }
    res.status(201).json(minted);
  }),
);

// ============================================================================
// Admin console reads (§12) — the three-pane console renders from these.
// ============================================================================

// §13 — the taxonomy + QR-style profiles the console renders itself from.
router.get(
  '/profile',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    res.json({
      taxonomy: loadTaxonomyProfile(),
      qr_styles: loadQrProfile().styles.map((s) => s.key),
    });
  }),
);

// §12.1 left pane — the full taxonomy tree (client assembles it via parent_node_id).
router.get(
  '/taxonomy/nodes',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    const r = await query(
      `SELECT node_id, parent_node_id, level_key, title, slug, sort_order, cover_image_url, is_active
         FROM redirector.taxonomy_nodes
        ORDER BY sort_order, title`,
    );
    res.json({ nodes: r.rows });
  }),
);

// §12.1 center pane — line items (assets + their primary token) under a node.
router.get(
  '/taxonomy/nodes/:id/items',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    const r = await query(
      `SELECT DISTINCT ON (a.asset_id)
              a.asset_id, a.title, a.content_kind, a.keywords, a.summary, a.health_status, a.sort_order,
              t.token, t.token_type, t.resolution_mode, t.landing_enabled, t.state,
              t.resolve_count, t.last_resolved_at,
              (SELECT alias FROM redirector.aliases al
                 WHERE al.token = t.token AND al.approval_status = 'approved' LIMIT 1) AS alias
         FROM redirector.assets a
         LEFT JOIN redirector.tokens t
           ON t.asset_id = a.asset_id AND t.resolution_mode = 'asset'
        WHERE a.taxonomy_node_id = $1 AND a.is_active
        ORDER BY a.asset_id, t.created_at NULLS LAST`,
      [req.params.id],
    );
    const base = config.redirector.baseUrl;
    const items = r.rows
      .map((row) => ({
        ...row,
        qr_svg_url: row.token ? `${base}/qr/${row.token}.svg` : null,
        short_url: row.token ? `${base}/r/${row.token}` : null,
      }))
      .sort((a, b) => (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || String(a.title).localeCompare(b.title));
    res.json({ items });
  }),
);

// §12.2 audit trail — every change to every token, who and when.
router.get(
  '/audit',
  requireRedirectorAuth('manager'),
  ah(async (req, res) => {
    const entityType = typeof req.query.entity_type === 'string' ? req.query.entity_type : null;
    const entityId = typeof req.query.entity_id === 'string' ? req.query.entity_id : null;
    const r = await query(
      `SELECT audit_id, actor, actor_type, action, entity_type, entity_id, occurred_at
         FROM redirector.audit_log
        WHERE ($1::text IS NULL OR entity_type = $1)
          AND ($2::text IS NULL OR entity_id = $2)
        ORDER BY occurred_at DESC
        LIMIT 200`,
      [entityType, entityId],
    );
    res.json({ events: r.rows });
  }),
);

// §12.2 scan log viewer — a 90-day daily series for one token.
router.get(
  '/tokens/:token/scans',
  requireRedirectorAuth('viewer'),
  ah(async (req, res) => {
    const token = normalizeToken(req.params.token);
    if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
    const r = await query(
      `SELECT date_trunc('day', occurred_at)::date AS day,
              COUNT(*)::int AS scans,
              COUNT(*) FILTER (WHERE is_bot)::int AS bots,
              COUNT(*) FILTER (WHERE landing_shown)::int AS landings
         FROM redirector.scan_events
        WHERE token = $1 AND occurred_at >= NOW() - INTERVAL '90 days'
        GROUP BY day ORDER BY day`,
      [token],
    );
    res.json({ token, series: r.rows });
  }),
);

// ============================================================================
// §17 Analytics + campaign reporting — read-only aggregates for the console.
// ============================================================================
router.get('/reports/overview', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  res.json(await reports.overview(query, { from: req.query.from, to: req.query.to, kind: req.query.kind }));
}));

router.get('/reports/top-tokens', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  res.json({ tokens: await reports.topTokens(query, { from: req.query.from, to: req.query.to, kind: req.query.kind, limit: req.query.limit }) });
}));

router.get('/reports/breakdown', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  const dimension = typeof req.query.dimension === 'string' ? req.query.dimension : 'device';
  res.json({ dimension, rows: await reports.breakdown(query, { dimension, from: req.query.from, to: req.query.to }) });
}));

router.get('/reports/token/:token', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  const token = normalizeToken(req.params.token);
  if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
  res.json(await reports.tokenReport(query, token, { from: req.query.from, to: req.query.to }));
}));

router.get('/reports/campaign/:asset_id', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  res.json({ asset_id: req.params.asset_id, placements: await reports.campaignReport(query, req.params.asset_id) });
}));

router.get('/reports/resume/:token', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  const token = normalizeToken(req.params.token);
  if (!isValidTokenShape(token)) throw new HttpError(400, 'malformed token');
  res.json({ token, progression: await reports.resumeReport(query, token) });
}));

// Enumeration signal — manager-gated (§9.5 / §17.1).
router.get('/reports/probes', requireRedirectorAuth('manager'), ah(async (req, res) => {
  res.json(await reports.probeReport(query, { from: req.query.from, to: req.query.to }));
}));

// Asset→token map for the admin catalog: every active asset-mode token with its
// asset slug + kind, so the catalog can show each album/song's real minted QR by
// slug (e.g. the album code) instead of a placeholder. Optional ?kind=album.
router.get('/asset-tokens', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  const kind = req.query.kind ? String(req.query.kind) : null;
  const r = await query(
    `SELECT a.slug, a.content_kind, t.token
       FROM redirector.tokens t
       JOIN redirector.assets a ON a.asset_id = t.asset_id
      WHERE t.resolution_mode = 'asset' AND t.state = 'active' AND a.slug IS NOT NULL
        AND ($1::text IS NULL OR a.content_kind = $1)`,
    [kind],
  );
  res.json({ tokens: r.rows });
}));

// Dashboard stats (viewer) — token counts by kind, alias count, 90-day scan
// rollups, and the top codes. One call powers the admin dashboard header cards.
router.get('/stats', requireRedirectorAuth('viewer'), ah(async (req, res) => {
  const [byKind, aliasCount, scans, top] = await Promise.all([
    query(`SELECT content_kind, COUNT(*)::int c FROM redirector.tokens WHERE state = 'active' GROUP BY content_kind`),
    query(`SELECT COUNT(*)::int c FROM redirector.aliases WHERE approval_status = 'approved'`),
    query(`SELECT
        COUNT(*)::int total,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '24 hours')::int last24h,
        COUNT(*) FILTER (WHERE occurred_at >= NOW() - INTERVAL '7 days')::int last7d,
        COUNT(*) FILTER (WHERE occurred_at::date = CURRENT_DATE)::int today,
        COUNT(*) FILTER (WHERE landing_shown)::int landings,
        COUNT(*) FILTER (WHERE is_bot)::int bots
      FROM redirector.scan_events WHERE occurred_at >= NOW() - INTERVAL '90 days'`),
    query(`SELECT token, content_kind AS kind, resolve_count::int
             FROM redirector.tokens WHERE state = 'active'
            ORDER BY resolve_count DESC NULLS LAST, created_at DESC LIMIT 6`),
  ]);
  const kinds = {}; let total = 0;
  for (const r of byKind.rows) { kinds[r.content_kind] = r.c; total += r.c; }
  const s = scans.rows[0] || {};
  res.set('Cache-Control', 'no-store');
  res.json({
    tokens: { total, album: kinds.album || 0, track: kinds.track || 0, article: kinds.article || 0, book: kinds.book || 0, alias: aliasCount.rows[0].c },
    scans: { total: s.total || 0, last24h: s.last24h || 0, last7d: s.last7d || 0, today: s.today || 0, landings: s.landings || 0, bots: s.bots || 0 },
    topCodes: top.rows,
  });
}));

// PUBLIC — the album/song token map for one album code, so the public album page
// can show its scannable QR (and per-song QRs) with no auth. QR codes are public
// by nature. Album slug = the album code; song slug = `<code>#<n>`.
router.get('/codes/:code', ah(async (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(code)) throw new HttpError(400, 'bad code');
  const [alb, songs] = await Promise.all([
    query(
      `SELECT t.token FROM redirector.assets a JOIN redirector.tokens t ON t.asset_id = a.asset_id
        WHERE a.content_kind = 'album' AND upper(a.slug) = $1 AND t.resolution_mode = 'asset' AND t.state = 'active'
        LIMIT 1`, [code]),
    query(
      `SELECT a.slug, t.token FROM redirector.assets a JOIN redirector.tokens t ON t.asset_id = a.asset_id
        WHERE a.content_kind = 'track' AND upper(a.slug) LIKE $1 AND t.resolution_mode = 'asset' AND t.state = 'active'`,
      [`${code}#%`]),
  ]);
  const songList = songs.rows
    .map((r) => ({ n: parseInt(String(r.slug).split('#')[1], 10), token: r.token }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n);
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ code, album: alb.rows[0] ? { token: alb.rows[0].token } : null, songs: songList });
}));

export default router;
