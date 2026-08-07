'use strict';
// ============================================================================
// Redirector resolver — software/redirector.md §9.
//
// Resolves a normalized token (or alias) to a destination. Phase 1 implements
// `asset` mode fully, with graceful non-dead-ending fallbacks for `rule` and
// `resume` modes (their full evaluation is Phases 6 and 8). State branching,
// device routing (§6.4) and the 60s in-memory cache for active asset-mode
// tokens (§9.1 step 5) are all here. The log write is fire-and-forget (§9.1
// step 10) and lives in logScan() so it can never block the redirect.
// ============================================================================
import crypto from 'node:crypto';
import { query } from '../db.js';
import { config } from '../config.js';
import { normalize, normalizeToken, isValidTokenShape, isValidAliasShape } from './tokens.js';
import { buildLandingPayload } from './landing.js';
import { resolveResumeDb, advanceResumeDb } from './resume.js';
import { deviceClass, applyDeviceRoutes } from './deviceRoutes.js';
import { resolveFromSnapshot } from './failover/snapshot.js';
import { appendScanEvent } from './failover/scanBuffer.js';
import { evaluateRuleForToken } from './rules/cache.js';

export { deviceClass };

// ---- in-memory cache (§9.1 step 5) ----------------------------------------
// 60s TTL, active asset-mode tokens only. Never caches rule/resume resolutions.
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // token -> { exp, row }
function cacheGet(token) {
  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return hit.row;
  if (hit) cache.delete(token);
  return null;
}
function cachePut(token, row) {
  cache.set(token, { exp: Date.now() + CACHE_TTL_MS, row });
}

// A resolved asset -> destination url. (Signed-URL generation is §9.3, a later
// phase; for now the current storage_url is the destination.)
function assetDestination(asset, dc, userAgent, deviceRoutes) {
  const routed = applyDeviceRoutes(deviceRoutes, dc, userAgent);
  if (routed) return routed; // may be an asset-id or an absolute url; treated as url here
  return asset?.storage_url || null;
}

async function loadAsset(assetId) {
  if (!assetId) return null;
  const r = await query('SELECT * FROM redirector.assets WHERE asset_id = $1', [assetId]);
  return r.rows[0] || null;
}

/**
 * Resolve raw path input to an outcome.
 * @returns {Promise<{outcome:'redirect'|'landing'|'retired'|'suspended'|'notfound',
 *   status:number, destination?:string, token?:string, viaAlias?:string,
 *   assetId?:string, contentKind?:string, landingEnabled?:boolean, isBot?:boolean,
 *   deviceClass?:string}>}
 */
export async function resolveToken(rawInput, ctx = {}) {
  const userAgent = ctx.userAgent || '';
  const dc = deviceClass(userAgent);
  // Tokens are case-sensitive (Base58); preserve case. Alias matching uppercases
  // at the query (aliases are stored uppercase, §3.5).
  const input = normalizeToken(rawInput);

  // §9.1 step 3 — validate shape, fail fast with NO db call on malformed input.
  if (!isValidTokenShape(input) && !isValidAliasShape(input)) {
    return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot' };
  }

  try {
    return await resolveFromDb(input, dc, userAgent, ctx.country || null, ctx.resume || {});
  } catch (err) {
    // §9.6 — database unreachable: keep serving redirects read-only from the
    // nightly flat-file snapshot. asset tokens resolve normally; rule tokens ->
    // declared fallback; resume -> first child; landing degrades to a redirect.
    try {
      const snap = await resolveFromSnapshot(input, { deviceClass: dc, userAgent });
      if (snap) return snap;
    } catch { /* snapshot missing/unreadable — fall through to notfound */ }
    return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot', degraded: true };
  }
}

async function resolveFromDb(input, dc, userAgent, country = null, resumeCtx = {}) {
  // §9.1 step 5 — cache for active asset-mode tokens.
  const cached = isValidTokenShape(input) ? cacheGet(input) : null;
  let tokenRow = cached;
  let viaAlias = null;

  if (!tokenRow) {
    // §9.1 step 4 — token lookup first, then alias (tokens always win, §3.5).
    if (isValidTokenShape(input)) {
      const r = await query('SELECT * FROM redirector.tokens WHERE token = $1', [input]);
      tokenRow = r.rows[0] || null;
    }
    if (!tokenRow) {
      // Only approved aliases resolve (§3.5 approval workflow, migration 0030).
      // Aliases are stored uppercase and matched case-insensitively (§3.5).
      const aliasKey = normalize(input);
      const a = await query(
        `SELECT t.* FROM redirector.aliases al JOIN redirector.tokens t ON t.token = al.token
          WHERE al.alias = $1 AND al.approval_status = 'approved'`,
        [aliasKey],
      );
      if (a.rows[0]) {
        tokenRow = a.rows[0];
        viaAlias = aliasKey;
      }
    }
    if (!tokenRow) {
      // logged as a probe attempt by the caller (§9.4)
      return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot' };
    }
  }

  const token = tokenRow.token;

  // §5.2 — state branching.
  if (tokenRow.state === 'retired') {
    return { outcome: 'retired', status: 200, token, viaAlias, contentKind: tokenRow.content_kind, deviceClass: dc, isBot: dc === 'bot' };
  }
  if (tokenRow.state === 'suspended') {
    return { outcome: 'suspended', status: 200, token, viaAlias, contentKind: tokenRow.content_kind, deviceClass: dc, isBot: dc === 'bot' };
  }
  // superseded -> resolve the replacement token, once.
  if (tokenRow.state === 'superseded' && tokenRow.superseded_by_token) {
    const r = await query('SELECT * FROM redirector.tokens WHERE token = $1', [tokenRow.superseded_by_token]);
    if (r.rows[0] && r.rows[0].state === 'active') tokenRow = r.rows[0];
  }

  const deviceRoutes = tokenRow.device_routes_json || null;
  let asset = null;
  let resumeResult = null;

  // §6 — resolve by mode.
  if (tokenRow.resolution_mode === 'asset') {
    asset = await loadAsset(tokenRow.asset_id);
    // cache the (active, asset-mode) row for the hot path
    if (tokenRow.state === 'active') cachePut(token, tokenRow);
  } else if (tokenRow.resolution_mode === 'rule') {
    // §7 — evaluate the DQR rule at request time (device routing is applied after,
    // §7.2). Any gap falls back to the rule's mandatory fallback so it never
    // dead-ends. Rule/pool are cached 5 min; this stays well under 50ms.
    const { evaluatedId, fallbackId } = await evaluateRuleForToken(tokenRow.rule_id, { now: new Date(), country });
    asset = (await loadAsset(evaluatedId)) || (await loadAsset(fallbackId));
  } else if (tokenRow.resolution_mode === 'resume') {
    // §6.6 — resolve to the next unconsumed child for this scanner (further of
    // cookie/account position). Bots carry no resume state -> first child.
    resumeResult = await resolveResumeDb(token, tokenRow.resume_node_id, dc === 'bot' ? { reset: true } : resumeCtx);
    asset = resumeResult ? await loadAsset(resumeResult.child.asset_id) : null;
  }

  if (!asset) {
    // §9.4 — asset row missing: caller raises an alert; no storage path leaks.
    return { outcome: 'notfound', status: 404, token, viaAlias, deviceClass: dc, isBot: dc === 'bot' };
  }

  const destination = assetDestination(asset, dc, userAgent, deviceRoutes);
  if (!destination) {
    return { outcome: 'notfound', status: 404, token, viaAlias, deviceClass: dc, isBot: dc === 'bot' };
  }

  const common = {
    destination,
    token,
    viaAlias,
    assetId: asset.asset_id,
    contentKind: asset.content_kind,
    landingEnabled: !!tokenRow.landing_enabled,
    deviceClass: dc,
    isBot: dc === 'bot',
  };

  // §6.6 — consuming a resume item (the tracked /go action) advances the pointer.
  // The returned position is written back to the anonymous cookie by the web layer.
  if (resumeResult && resumeCtx.advance) {
    common.resumeNewPos = await advanceResumeDb(token, resumeCtx, resumeResult.child);
  }

  // §11 — when landing is enabled (always for resume, §6.6), return an arrival-page
  // payload instead of a bare redirect. `destination` is kept for the web server
  // (to power the tracked primary action) but is never printed into the page HTML
  // (§9.4). Bots skip the page and get the redirect so previews resolve (§9.5).
  const wantLanding = (tokenRow.landing_enabled || tokenRow.resolution_mode === 'resume') && dc !== 'bot';
  if (wantLanding) {
    const landing = await buildLandingPayload(asset, tokenRow, config.redirector.baseUrl, {
      resume: resumeResult ? { position: resumeResult.index + 1, label: asset.title, count: resumeResult.count } : null,
    });
    return { outcome: 'landing', status: 200, landing, ...common };
  }

  return { outcome: 'redirect', status: 302, ...common };
}

// ---- scan logging (§9.1 step 10) ------------------------------------------
// Fire-and-forget. Any failure is swallowed — it must never affect the redirect.
let dailySalt = null;
let dailySaltDay = null;
function ipHash(ip) {
  if (!ip) return null;
  const day = new Date().toISOString().slice(0, 10);
  if (day !== dailySaltDay) {
    dailySalt = crypto.randomBytes(16).toString('hex');
    dailySaltDay = day;
  }
  return crypto.createHash('sha256').update(String(ip) + dailySalt).digest('hex');
}

// §9.5/§17.1 — record an unknown-token probe (enumeration signal). Fire-and-forget,
// hashed IP only. Called by the resolve route on a notfound outcome.
export function logProbe(input, ctx = {}) {
  query(
    `INSERT INTO redirector.probe_events (ip_hash, input, user_agent) VALUES ($1,$2,$3)`,
    [ipHash(ctx.ip), input ? String(input).slice(0, 24) : null, ctx.userAgent ? String(ctx.userAgent).slice(0, 500) : null],
  ).catch(() => {});
}

export function logScan(res, ctx = {}) {
  // Denormalize campaign/placement from the token row lazily; keep it cheap.
  const token = res.token;
  if (!token) return; // malformed/unknown probes: optionally logged elsewhere
  const params = [
    token,
    res.viaAlias || null,
    res.assetId || null,
    ctx.campaign || null,
    ctx.placement || null,
    ipHash(ctx.ip),
    ctx.userAgent ? String(ctx.userAgent).slice(0, 500) : null,
    res.deviceClass || 'unknown',
    ctx.referrer || null,
    ctx.country || null,
    !!res.isBot,
    res.outcome === 'landing' || !!ctx.landingAction,   // landing_shown
    ctx.landingAction ? String(ctx.landingAction).slice(0, 32) : null, // §11.2 landing_action
  ];
  // Fire-and-forget: also bump the denormalized counters on the token row.
  // §9.6 — if the DB write fails (e.g. degraded/failover mode), buffer the event
  // to a local append-only file so it can be replayed when the database returns.
  query(
    `INSERT INTO redirector.scan_events
       (token, via_alias, resolved_asset_id, campaign, placement, ip_hash, user_agent, device_class, referrer, country_code, is_bot, landing_shown, landing_action)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    params,
  ).catch(() => appendScanEvent(params));
  query(
    `UPDATE redirector.tokens SET resolve_count = resolve_count + 1, last_resolved_at = NOW() WHERE token = $1`,
    [token],
  ).catch(() => {});
  if (res.viaAlias) {
    query(`UPDATE redirector.aliases SET resolve_count = resolve_count + 1 WHERE alias = $1`, [res.viaAlias]).catch(() => {});
  }
}
