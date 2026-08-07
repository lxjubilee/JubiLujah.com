'use strict';
// ============================================================================
// Ephemeral persona tokens — software/redirector.md §6.7 / §15.2.
//
// When a persona recommends an item in conversation it mints a short-lived token
// carrying only a persona name + a one-line reason (never a transcript or user
// id, §18.8). These live in a SEPARATE namespace served at /rp/, are NEVER
// printed or exported, and are the only tokens that expire (30 days). On expiry
// the link resolves to the asset's permanent token rather than erroring, so a
// saved link still works — it just loses the personal framing (§6.7).
// ============================================================================
import { query } from '../db.js';
import { config } from '../config.js';
import { generateUniqueToken } from './tokens.js';
import { deviceClass } from './deviceRoutes.js';
import { buildLandingPayload } from './landing.js';

export function isEphemeralExpired(expiresAt, now = new Date()) {
  return !!expiresAt && new Date(expiresAt).getTime() <= now.getTime();
}

async function ephExists(candidate) {
  const r = await query('SELECT 1 FROM redirector.ephemeral_tokens WHERE eph_token = $1', [candidate]);
  return r.rowCount > 0;
}
async function loadAsset(id) {
  const r = await query('SELECT * FROM redirector.assets WHERE asset_id = $1', [id]);
  return r.rows[0] || null;
}
async function permanentTokenFor(assetId) {
  const r = await query(
    `SELECT token FROM redirector.tokens
      WHERE asset_id = $1 AND resolution_mode = 'asset' AND state = 'active'
      ORDER BY created_at LIMIT 1`,
    [assetId],
  );
  return r.rows[0]?.token || null;
}

// §15.2 — mint a /rp/ token for an asset. Returns the link + QR urls (the QR
// encodes the /rp/ URL via ?rp=1) + the hard expiry.
export async function mintEphemeral({ asset_id, persona_name, reason_text }) {
  const a = await loadAsset(asset_id);
  if (!a) throw new Error('asset_id does not exist');
  const token = await generateUniqueToken(ephExists);
  const r = await query(
    `INSERT INTO redirector.ephemeral_tokens (eph_token, asset_id, persona_name, reason_text, expires_at)
     VALUES ($1,$2,$3,$4, NOW() + INTERVAL '30 days') RETURNING expires_at`,
    [token, asset_id, persona_name || null, reason_text || null],
  );
  const base = config.redirector.baseUrl;
  return {
    token,
    url: `${base}/rp/${token}`,
    qr_svg_url: `${base}/qr/${token}.svg?rp=1`,
    qr_png_url: `${base}/qr/${token}.png?rp=1`,
    expires_at: r.rows[0].expires_at,
  };
}

// Resolve a /rp/ token. Mirrors the resolver's outcome shape so the web /rp route
// can render a landing (with the persona note) or redirect exactly like /r.
export async function resolveEphemeral(rawToken, ctx = {}) {
  const token = String(rawToken || '').trim(); // case-sensitive (Base58)
  const dc = deviceClass(ctx.userAgent || '');
  const base = config.redirector.baseUrl;

  const e = await query('SELECT * FROM redirector.ephemeral_tokens WHERE eph_token = $1', [token]);
  const row = e.rows[0];
  if (!row) return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot' };

  const asset = await loadAsset(row.asset_id);
  if (!asset) return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot' };

  // §6.7 — expired: resolve to the asset's permanent token (drops the framing),
  // never error. We 302 to the permanent /r/ URL so the normal flow takes over.
  if (isEphemeralExpired(row.expires_at)) {
    const perm = await permanentTokenFor(row.asset_id);
    const destination = perm ? `${base}/r/${perm}` : (asset.storage_url || null);
    if (!destination) return { outcome: 'notfound', status: 404, deviceClass: dc, isBot: dc === 'bot' };
    return {
      outcome: 'redirect', status: 302, destination, token: perm || token,
      assetId: asset.asset_id, contentKind: asset.content_kind, expired: true, deviceClass: dc, isBot: dc === 'bot',
    };
  }

  const destination = asset.storage_url || null;
  const common = {
    destination, token, assetId: asset.asset_id, contentKind: asset.content_kind,
    ephemeral: true, deviceClass: dc, isBot: dc === 'bot',
  };
  // Bots skip the persona page and get the redirect so previews resolve (§9.5).
  if (dc === 'bot' || !destination) {
    return { outcome: destination ? 'redirect' : 'notfound', status: destination ? 302 : 404, ...common };
  }
  const landing = await buildLandingPayload(asset, {}, base, {
    persona: { name: row.persona_name || 'A friend', reason: row.reason_text || '' },
  });
  return { outcome: 'landing', status: 200, landing, ...common };
}
