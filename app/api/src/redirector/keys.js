'use strict';
// ============================================================================
// Redirector automation API keys — software/redirector.md §18.3.
//
// Keys authenticate the automation API (X-Redirector-Key) for the pipeline and
// personas. They are stored HASHED (sha256), are rotatable, and are scoped per
// consumer so one can be revoked without affecting the others. The raw key is
// shown exactly once, at mint time.
//
// Format: `rdk_<consumer-initial>_<32 hex>`  e.g. rdk_p_9f3a...  The prefix is
// stored in the clear (key_prefix) purely for human identification in the admin
// UI; it is not sufficient to authenticate.
// ============================================================================
import crypto from 'node:crypto';
import { query } from '../db.js';

const CONSUMERS = new Set(['pipeline', 'persona', 'admin_tooling']);

export function hashKey(rawKey) {
  return crypto.createHash('sha256').update(String(rawKey)).digest('hex');
}

// Generate a fresh raw key string. Not stored as-is anywhere.
export function generateRawKey(consumer) {
  const initial = (consumer || 'x')[0];
  return `rdk_${initial}_${crypto.randomBytes(24).toString('hex')}`;
}

// Verify an incoming key. On success returns { keyId, consumer, scopes } and
// bumps last_used_at (fire-and-forget); on failure returns null. Constant-time
// is unnecessary here because we look up by the hash, not by comparing secrets.
export async function verifyKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('rdk_')) return null;
  const hash = hashKey(rawKey);
  const r = await query(
    `SELECT key_id, consumer, scopes FROM redirector.api_keys
       WHERE key_hash = $1 AND is_active AND revoked_at IS NULL`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) return null;
  query('UPDATE redirector.api_keys SET last_used_at = NOW() WHERE key_id = $1', [row.key_id]).catch(() => {});
  return { keyId: row.key_id, consumer: row.consumer, scopes: row.scopes || [] };
}

// Mint and persist a new key. Returns the RAW key (show once) plus its metadata.
export async function mintKey({ consumer, label = null, scopes = [] }) {
  if (!CONSUMERS.has(consumer)) {
    throw new Error(`invalid consumer '${consumer}' (expected: ${[...CONSUMERS].join(', ')})`);
  }
  const raw = generateRawKey(consumer);
  const hash = hashKey(raw);
  const prefix = raw.slice(0, 12);
  const r = await query(
    `INSERT INTO redirector.api_keys (key_hash, key_prefix, consumer, label, scopes)
     VALUES ($1,$2,$3,$4,$5) RETURNING key_id, created_at`,
    [hash, prefix, consumer, label, scopes],
  );
  return { rawKey: raw, keyId: r.rows[0].key_id, consumer, label, scopes, keyPrefix: prefix };
}

// Revoke a key by id (rotation: mint a new one, then revoke the old).
export async function revokeKey(keyId) {
  await query(
    `UPDATE redirector.api_keys SET is_active = FALSE, revoked_at = NOW() WHERE key_id = $1`,
    [keyId],
  );
}
