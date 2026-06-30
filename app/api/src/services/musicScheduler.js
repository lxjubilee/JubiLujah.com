// ============================================================================
// Manage Music — scheduled synchronization (BRD: Automatic Synchronization).
//
// A tiny in-process ticker: every minute it reads production.music_sync_config
// and, when the configured cadence is due, fires a background CDN sync. Kept
// deliberately simple (no external job runner) and overlap-safe via a guard.
// For a multi-instance deployment, run this on ONE instance (env-gated below).
// ============================================================================
import { logger } from '../logger.js';
import { query } from '../db.js';
import { runSync, nextRunAt } from './musicSync.js';

let running = false;
let timer = null;

async function tick() {
  if (running) return;
  let cfg;
  try {
    const r = await query(
      `SELECT schedule, enabled, last_run_at, next_run_at FROM production.music_sync_config WHERE id = 1`);
    cfg = r.rows[0];
  } catch (err) {
    logger.warn({ err }, 'music scheduler: config read failed');
    return;
  }
  if (!cfg || !cfg.enabled || cfg.schedule === 'off') return;

  const now = new Date();
  const due = !cfg.next_run_at || new Date(cfg.next_run_at) <= now;
  if (!due) return;

  running = true;
  try {
    logger.info({ schedule: cfg.schedule }, 'music scheduler: starting scheduled sync');
    await runSync({ trigger: 'scheduled', probe: 'missing' });
    const next = nextRunAt(cfg.schedule, new Date());
    await query(`UPDATE production.music_sync_config SET next_run_at = $1 WHERE id = 1`, [next]);
  } catch (err) {
    logger.error({ err }, 'music scheduler: scheduled sync failed');
    // Back off one cadence so a persistent failure doesn't hot-loop.
    const next = nextRunAt(cfg.schedule, new Date());
    await query(`UPDATE production.music_sync_config SET next_run_at = $1 WHERE id = 1`, [next]).catch(() => {});
  } finally {
    running = false;
  }
}

export function startMusicScheduler() {
  // Disabled by default; opt in per-instance to avoid duplicate runs in a cluster.
  if (String(process.env.MUSIC_SYNC_SCHEDULER || '').toLowerCase() !== 'on') return;
  if (timer) return;
  timer = setInterval(() => { tick().catch(() => {}); }, 60 * 1000);
  if (timer.unref) timer.unref();
  logger.info('music scheduler: enabled (tick every 60s)');
}
