'use strict';
// ============================================================================
// Asset health watcher — software/redirector.md §16.
//
// A background service, independent of the request path, that walks rdr_assets
// on a rolling schedule (every active asset at least every 24h), issues a HEAD
// against each storage_url (following redirects, 10s timeout), periodically
// verifies recorded checksums (weekly, skipping files > 100MB), and writes
// health_status / health_checked_at. It raises an alert on any transition into
// `unreachable` or `checksum_mismatch`, and NEVER modifies an asset or token —
// it only observes and reports. Throttled to <=10 req/s per storage host (§16.3)
// so it never resembles an attack on our own CDN.
//
// The check functions take an injected `fetchImpl` and `now`, so the whole
// detection path is testable against a local server with no database (acceptance
// §20.11). runHealthCycle() is the DB-driven walk used by the scheduler + CLI.
// ============================================================================
import crypto from 'node:crypto';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const H = config.redirector.health;
const CHECKSUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly (§16.1)

// ---- per-host throttle (§16.3) --------------------------------------------
// Minimum spacing between requests to the same host = 1000/rps ms.
export class HostThrottle {
  constructor(rps = H.perHostRps) {
    this.minGap = Math.max(1, Math.floor(1000 / Math.max(1, rps)));
    this.nextAt = new Map(); // host -> earliest next timestamp
  }
  async wait(host) {
    const now = Date.now();
    const earliest = this.nextAt.get(host) || 0;
    const at = Math.max(now, earliest);
    this.nextAt.set(host, at + this.minGap);
    const delay = at - now;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return 'invalid'; }
}

// ---- reachability (HEAD) ---------------------------------------------------
export async function checkUrl(url, { timeoutMs = H.timeoutMs, fetchImpl = fetch } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
    // <400 is healthy; 405 = server up but HEAD not allowed (still reachable).
    const reachable = res.status < 400 || res.status === 405;
    return { status: reachable ? 'ok' : 'unreachable', httpStatus: res.status };
  } catch (err) {
    return { status: 'unreachable', httpStatus: null, error: err.name || 'error' };
  } finally {
    clearTimeout(timer);
  }
}

// ---- checksum (GET + sha256) ----------------------------------------------
export async function verifyChecksum(url, expectedSha, { timeoutMs = H.timeoutMs, maxBytes = H.checksumMaxBytes, fetchImpl = fetch } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: ac.signal });
    if (res.status >= 400) return { status: 'unreachable', httpStatus: res.status };
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) return { status: 'skipped', reason: 'too_large' }; // §16.1 skip >100MB
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) return { status: 'skipped', reason: 'too_large' };
    const actual = crypto.createHash('sha256').update(buf).digest('hex');
    return { status: actual === String(expectedSha).toLowerCase() ? 'ok' : 'checksum_mismatch', actual };
  } catch (err) {
    return { status: 'unreachable', error: err.name || 'error' };
  } finally {
    clearTimeout(timer);
  }
}

// ---- decide one asset's new health status (pure-ish; no DB) -----------------
// Returns { next, alert, checksumChecked }. `alert` is true on a transition INTO
// a bad state (§16.1). Reachability first; checksum only when the URL is up, a
// checksum is recorded, and it is due (weekly).
export async function checkAsset(asset, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const prev = asset.health_status || 'unchecked';
  const head = await checkUrl(asset.storage_url, opts);
  if (head.status !== 'ok') {
    return { next: 'unreachable', alert: prev !== 'unreachable', checksumChecked: false, httpStatus: head.httpStatus };
  }

  let next = 'ok';
  let checksumChecked = false;
  const dueForChecksum =
    asset.checksum_sha256 &&
    (!asset.checksum_checked_at || now.getTime() - new Date(asset.checksum_checked_at).getTime() >= CHECKSUM_INTERVAL_MS);
  if (dueForChecksum) {
    const c = await verifyChecksum(asset.storage_url, asset.checksum_sha256, opts);
    checksumChecked = c.status === 'ok' || c.status === 'checksum_mismatch';
    if (c.status === 'checksum_mismatch') next = 'checksum_mismatch';
    else if (c.status === 'unreachable') next = 'unreachable';
  }
  const bad = next === 'unreachable' || next === 'checksum_mismatch';
  return { next, alert: bad && prev !== next, checksumChecked };
}

// ---- concurrency helper ----------------------------------------------------
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---- DB-driven cycle -------------------------------------------------------
// Walks assets due for a check (never checked, or older than 24h), checks each
// (throttled per host, bounded concurrency), writes results, and alerts on bad
// transitions. Returns a summary. Injected fetchImpl/now make it testable.
export async function runHealthCycle(opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const fetchImpl = opts.fetchImpl || fetch;
  const throttle = opts.throttle || new HostThrottle();
  const batch = opts.batchSize || H.batchSize;

  const due = await query(
    `SELECT asset_id, storage_url, health_status, checksum_sha256, checksum_checked_at
       FROM redirector.assets
      WHERE is_active AND storage_url IS NOT NULL
        AND (health_checked_at IS NULL OR health_checked_at < $1)
      ORDER BY health_checked_at NULLS FIRST
      LIMIT $2`,
    [new Date(now.getTime() - 24 * 60 * 60 * 1000), batch],
  );

  const summary = { checked: 0, ok: 0, unreachable: 0, checksum_mismatch: 0, alerts: 0 };
  await mapLimit(due.rows, H.concurrency, async (asset) => {
    await throttle.wait(hostOf(asset.storage_url));
    const result = await checkAsset(asset, { fetchImpl, now });
    summary.checked++;
    summary[result.next] = (summary[result.next] || 0) + 1;
    if (result.alert) {
      summary.alerts++;
      // §16.1 — raise an alert on a transition into a bad state.
      logger.error(
        { marker: 'redirector.health.alert', asset_id: asset.asset_id, from: asset.health_status, to: result.next },
        'redirector health: asset transitioned into a bad state',
      );
    }
    // Observe-only: write health columns, never touch the asset's content/token.
    await query(
      `UPDATE redirector.assets
         SET health_status = $2, health_checked_at = $3
             ${result.checksumChecked ? ', checksum_checked_at = $3' : ''}
       WHERE asset_id = $1`,
      [asset.asset_id, result.next, now],
    );
  });
  logger.info({ summary }, 'redirector health: cycle complete');
  return summary;
}
