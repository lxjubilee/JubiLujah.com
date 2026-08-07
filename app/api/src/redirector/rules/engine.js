'use strict';
// ============================================================================
// DQR rule evaluation engine — software/redirector.md §7.
//
// Evaluates a dynamic-QR rule at request time to a single asset id. Pure and
// side-effect free (§7.2): given the same rule + context it always returns the
// same answer, which is what makes the admin preview (§7.3) and the acceptance
// test (§20.4 — different content across dates and countries) exact. Any failure
// returns null so the caller can serve the rule's mandatory fallback — a DQR
// must never dead-end (§7.2).
//
// Time is resolved in the rule's own IANA timezone (default America/Los_Angeles),
// never a raw offset. latest_in_collection needs a DB lookup, so it is injected
// via deps.latestInCollection(nodeId) to keep this module pure/testable.
//
// parameters_json shapes per strategy (all optional keys documented here):
//   calendar_map        { map: { "YYYY-MM-DD": assetId, ... } }
//   sequence_daily      pool_json: [assetId, ...]
//   sequence_weekly     pool_json: [assetId, ...]
//   date_range          { ranges: [{ from:"YYYY-MM-DD", to:"YYYY-MM-DD", asset_id }] }
//   random_pool         pool_json: [assetId, ...]   (no-repeat over a full cycle)
//   latest_in_collection{ collection_node_id }
//   geo_route           { regions: { "RO": assetId, "US": assetId, ... } } + default_region
//   time_of_day         { periods: [{ from_hour:0-23, to_hour:0-24, asset_id }] }
// ============================================================================
import crypto from 'node:crypto';

const DEFAULT_TZ = 'America/Los_Angeles';

// Calendar parts for `date` in `tz`. epochDay is a stable integer day index in
// that zone (days since 1970-01-01), so sequence math is timezone-correct.
export function zonedParts(date, tz = DEFAULT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const year = +parts.year, month = +parts.month, day = +parts.day;
  let hour = +parts.hour; if (hour === 24) hour = 0; // some ICU builds emit '24' at midnight
  const epochDay = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday] ?? 0;
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  return { year, month, day, hour, weekday, epochDay, isoDate };
}

// Deterministic [0,1) from a seed string (sha256-derived).
function seededUnit(seed) {
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000;
}
// Deterministic seeded permutation of indices [0..n) (Fisher–Yates by seed).
function seededPermutation(n, seed) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(seededUnit(`${seed}:${i}`) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function asPool(rule) {
  return Array.isArray(rule.pool_json) ? rule.pool_json.filter(Boolean) : [];
}

// Structural validation — throws on params that could never resolve (used to
// reject a bad rule at save time, §7.3). Fallback still covers runtime gaps.
export function validateRuleParams(rule) {
  const p = rule.parameters_json || {};
  switch (rule.strategy) {
    case 'calendar_map':
      if (!p.map || typeof p.map !== 'object' || !Object.keys(p.map).length) throw new Error('calendar_map requires a non-empty parameters_json.map');
      break;
    case 'sequence_daily':
    case 'sequence_weekly':
    case 'random_pool':
      if (asPool(rule).length === 0) throw new Error(`${rule.strategy} requires a non-empty pool_json`);
      break;
    case 'date_range':
      if (!Array.isArray(p.ranges) || !p.ranges.length) throw new Error('date_range requires parameters_json.ranges');
      break;
    case 'latest_in_collection':
      if (!p.collection_node_id) throw new Error('latest_in_collection requires parameters_json.collection_node_id');
      break;
    case 'geo_route':
      if (!p.regions || typeof p.regions !== 'object') throw new Error('geo_route requires parameters_json.regions');
      if (!rule.default_region) throw new Error('geo_route requires default_region');
      break;
    case 'time_of_day':
      if (!Array.isArray(p.periods) || !p.periods.length) throw new Error('time_of_day requires parameters_json.periods');
      break;
    default:
      throw new Error(`unknown strategy '${rule.strategy}'`);
  }
  return true;
}

/**
 * Evaluate a rule to an asset id (or null -> caller serves fallback).
 * @param {object} rule  { strategy, parameters_json, pool_json, timezone, default_region }
 * @param {object} ctx   { now: Date, country?: string }
 * @param {object} deps  { latestInCollection?: (nodeId) => Promise<string|null> }
 */
export async function evaluateRule(rule, ctx = {}, deps = {}) {
  const tz = rule.timezone || DEFAULT_TZ;
  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const t = zonedParts(now, tz);
  const p = rule.parameters_json || {};
  const pool = asPool(rule);

  switch (rule.strategy) {
    case 'calendar_map':
      return (p.map && p.map[t.isoDate]) || null;

    case 'sequence_daily':
      return pool.length ? pool[((t.epochDay % pool.length) + pool.length) % pool.length] : null;

    case 'sequence_weekly': {
      if (!pool.length) return null;
      const week = Math.floor(t.epochDay / 7);
      return pool[((week % pool.length) + pool.length) % pool.length];
    }

    case 'date_range': {
      const ranges = Array.isArray(p.ranges) ? p.ranges : [];
      const hit = ranges.find((r) => r.from <= t.isoDate && t.isoDate <= r.to); // first match wins
      return hit ? hit.asset_id : null;
    }

    case 'random_pool': {
      if (!pool.length) return null;
      // No-repeat over a full cycle: a fresh seeded permutation per pool-length
      // window, indexed by the day within that window (deterministic; anonymous-
      // scan-safe — no server-side per-scanner state, per §21 open decision 1).
      const cycle = Math.floor(t.epochDay / pool.length);
      const perm = seededPermutation(pool.length, `${rule.rule_id || 'r'}:${cycle}`);
      return pool[perm[((t.epochDay % pool.length) + pool.length) % pool.length]];
    }

    case 'latest_in_collection':
      return deps.latestInCollection ? deps.latestInCollection(p.collection_node_id) : null;

    case 'geo_route': {
      const regions = p.regions || {};
      const country = (ctx.country || '').toUpperCase();
      return regions[country] || regions[(rule.default_region || '').toUpperCase()] || null;
    }

    case 'time_of_day': {
      const periods = Array.isArray(p.periods) ? p.periods : [];
      const hit = periods.find((pr) => Number(pr.from_hour) <= t.hour && t.hour < Number(pr.to_hour));
      return hit ? hit.asset_id : null;
    }

    default:
      return null;
  }
}
