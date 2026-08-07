'use strict';
// ============================================================================
// Scan-event failover buffer — software/redirector.md §9.6.
//
// "Scan events buffer to a local append-only file and replay when the database
//  returns." When the live scan_events INSERT fails (DB unreachable / degraded),
// the event is appended here as one NDJSON line. On recovery the scheduler (or
// startup) calls replayScanBuffer(), which re-inserts every buffered event and
// then clears the file. Best-effort throughout — a buffering failure must never
// affect the redirect that produced the scan.
// ============================================================================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const BUFFER = config.redirector.scanBufferPath;

// Append one event (the same positional params the live INSERT uses). Sync
// append keeps ordering and avoids interleaving; the payload is tiny.
export function appendScanEvent(params) {
  try {
    fs.mkdirSync(path.dirname(BUFFER), { recursive: true });
    fs.appendFileSync(BUFFER, JSON.stringify(params) + '\n', 'utf8');
  } catch (err) {
    logger.warn({ err }, 'redirector: scan buffer append failed');
  }
}

// Parse the buffer file into an array of param arrays (pure; used by tests too).
export function parseBuffer(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

// Replay every buffered event into the DB, then remove the file. If any insert
// fails, the file is left intact so it can be retried on the next recovery tick.
export async function replayScanBuffer() {
  let text;
  try {
    text = await fsp.readFile(BUFFER, 'utf8');
  } catch {
    return { replayed: 0 }; // no buffer file — nothing to do
  }
  const events = parseBuffer(text);
  if (!events.length) {
    await fsp.rm(BUFFER, { force: true });
    return { replayed: 0 };
  }
  let replayed = 0;
  for (const params of events) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `INSERT INTO redirector.scan_events
           (token, via_alias, resolved_asset_id, campaign, placement, ip_hash, user_agent, device_class, referrer, country_code, is_bot, landing_shown, landing_action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        params,
      );
      replayed++;
    } catch (err) {
      // DB still not healthy — stop and keep the file for the next attempt.
      logger.warn({ err, replayed }, 'redirector: scan buffer replay interrupted');
      return { replayed, remaining: events.length - replayed };
    }
  }
  await fsp.rm(BUFFER, { force: true });
  logger.info({ replayed }, 'redirector: scan buffer replayed and cleared');
  return { replayed };
}
