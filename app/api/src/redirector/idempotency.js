'use strict';
// ============================================================================
// Idempotency for the automation API — software/redirector.md §14.2.
//
// "Every POST accepts an Idempotency-Key header. Replaying a key returns the
//  original result rather than creating a duplicate. This is mandatory. Pipeline
//  retries must never produce a second token for the same asset."
//
// Middleware `idempotent(endpoint)`:
//   - No Idempotency-Key  -> passes through (the endpoints are still safe, just
//     not deduplicated; the pipeline is expected to always send one).
//   - Key seen before with the SAME request body -> replays stored status+body.
//   - Key seen before with a DIFFERENT body       -> 409 (key reuse mismatch).
//   - New key -> captures the JSON response and persists it on the way out.
//
// Scoped by consumer (from req.rdrAuth) so keys from different callers never
// collide. Records are ignored/pruned after ~24h (matches identity's cache).
// The DB row is written on a successful 2xx response only; a failed request does
// not burn the key, so a retry can still succeed.
// ============================================================================
import crypto from 'node:crypto';
import { query } from '../db.js';
import { HttpError } from '../middleware/rbac.js';

const RETENTION_MS = 24 * 60 * 60 * 1000;

function requestHash(req) {
  return crypto.createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
}

export function idempotent(endpoint) {
  return async (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    const consumer = req.rdrAuth?.actor || 'anonymous';
    const rhash = requestHash(req);

    try {
      const existing = await query(
        `SELECT request_hash, status_code, response_body, created_at
           FROM redirector.idempotency WHERE consumer = $1 AND idempotency_key = $2`,
        [consumer, key],
      );
      const row = existing.rows[0];
      if (row && Date.now() - new Date(row.created_at).getTime() < RETENTION_MS) {
        if (row.request_hash !== rhash) {
          return next(new HttpError(409, 'Idempotency-Key reused with a different request body'));
        }
        res.set('Idempotency-Replayed', 'true');
        return res.status(row.status_code).json(row.response_body);
      }
    } catch (err) {
      // If the cache lookup fails, do not block the operation — just proceed
      // without dedup rather than 500 the pipeline.
      return next();
    }

    // Capture the JSON response so we can persist + replay it.
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        query(
          `INSERT INTO redirector.idempotency (consumer, idempotency_key, endpoint, request_hash, status_code, response_body)
             VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (consumer, idempotency_key) DO NOTHING`,
          [consumer, key, endpoint, rhash, res.statusCode, body],
        ).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}
