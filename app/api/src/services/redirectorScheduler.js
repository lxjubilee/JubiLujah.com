'use strict';
// ============================================================================
// Redirector background scheduler — software/redirector.md §9.6 + §16.
//
// Two in-process jobs, deliberately simple (no external runner), overlap-safe,
// and opt-in per instance (REDIRECTOR_SCHEDULER=on) so a cluster runs them on
// ONE node:
//   1. Nightly flat-file failover snapshot at ~02:00 local (§9.6). Also written
//      once on startup if none exists, so failover works immediately.
//   2. Rolling asset health watcher (§16): a batch every few minutes so every
//      active asset is covered within 24h. Each tick also replays any buffered
//      scan events, flushing them once the DB is healthy again (§9.6).
// ============================================================================
import { logger } from '../logger.js';
import { config } from '../config.js';
import { writeSnapshot, snapshotExists } from '../redirector/failover/snapshot.js';
import { replayScanBuffer } from '../redirector/failover/scanBuffer.js';
import { runHealthCycle } from '../redirector/health/watcher.js';

let snapshotTimer = null;
let healthTimer = null;
let lastSnapshotDay = null;
let snapBusy = false;
let healthBusy = false;

async function snapshotTick() {
  if (snapBusy) return;
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  // Fire once per day, at or after 02:00 local, and not yet run today.
  if (now.getHours() < 2 || lastSnapshotDay === day) return;
  snapBusy = true;
  try {
    await writeSnapshot();
    lastSnapshotDay = day;
  } catch (err) {
    logger.warn({ err }, 'redirector scheduler: snapshot failed');
  } finally {
    snapBusy = false;
  }
}

async function healthTick() {
  if (healthBusy) return;
  healthBusy = true;
  try {
    await replayScanBuffer(); // flush any failover-buffered scans first
    await runHealthCycle();
  } catch (err) {
    logger.warn({ err }, 'redirector scheduler: health cycle failed');
  } finally {
    healthBusy = false;
  }
}

export function startRedirectorScheduler() {
  if (!config.redirector.scheduler) return; // opt-in per instance
  if (snapshotTimer || healthTimer) return;

  // Ensure a snapshot exists immediately so failover is usable from boot.
  (async () => {
    try {
      await replayScanBuffer();
      if (!snapshotExists()) await writeSnapshot();
    } catch (err) {
      logger.warn({ err }, 'redirector scheduler: startup snapshot/replay failed');
    }
  })();

  snapshotTimer = setInterval(() => { snapshotTick().catch(() => {}); }, 60 * 1000);        // check every minute
  healthTimer = setInterval(() => { healthTick().catch(() => {}); }, 5 * 60 * 1000);        // rolling every 5 min
  if (snapshotTimer.unref) snapshotTimer.unref();
  if (healthTimer.unref) healthTimer.unref();
  logger.info('redirector scheduler: enabled (nightly snapshot + rolling health watcher)');
}
