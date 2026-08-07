'use strict';
// ============================================================================
// Analytics + campaign reporting — software/redirector.md §17.
//
// Read-only aggregates over rdr_scan_events / rdr_probe_events / rdr_tokens.
// Bots are excluded from reporting totals (§9.5). All time-bounded by a [from,to]
// range (default: last 90 days, matching the raw-event retention window §17.3).
// Query functions take the `query` helper so routes stay thin; the pure helpers
// (parseRange, referrerBucket) are unit-tested offline.
// ============================================================================

// Resolve an optional from/to (ISO strings) to a concrete [start,end] range.
export function parseRange(from, to) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// Collapse a referrer to a reporting bucket: no referrer ~= a QR scan or direct
// open; otherwise the host (§17.1 "direct traffic and QR scan traffic separated").
export function referrerBucket(ref) {
  if (!ref) return 'direct / QR scan';
  const m = /^https?:\/\/([^/]+)/i.exec(ref);
  return m ? m[1] : String(ref).slice(0, 60);
}

const BREAKDOWN_COLUMN = { device: 'device_class', country: 'country_code' };

export async function overview(query, { from, to, kind } = {}) {
  const { start, end } = parseRange(from, to);
  const r = await query(
    `SELECT COUNT(*) FILTER (WHERE NOT se.is_bot)::int AS resolutions,
            COUNT(DISTINCT se.token)::int              AS tokens,
            COUNT(*) FILTER (WHERE se.is_bot)::int      AS bot_hits,
            COUNT(*) FILTER (WHERE se.landing_shown)::int AS landings_shown,
            COUNT(*) FILTER (WHERE se.landing_action IS NOT NULL)::int AS landing_actions
       FROM redirector.scan_events se
       LEFT JOIN redirector.tokens t ON t.token = se.token
      WHERE se.occurred_at BETWEEN $1 AND $2
        AND ($3::text IS NULL OR t.content_kind = $3)`,
    [start, end, kind || null],
  );
  return { range: { from: start, to: end }, ...r.rows[0] };
}

export async function topTokens(query, { from, to, kind, limit = 25 } = {}) {
  const { start, end } = parseRange(from, to);
  const r = await query(
    `SELECT se.token, t.content_kind AS kind, t.label, t.campaign, t.placement,
            COUNT(*)::int AS resolutions, MAX(se.occurred_at) AS last_resolved
       FROM redirector.scan_events se
       LEFT JOIN redirector.tokens t ON t.token = se.token
      WHERE se.occurred_at BETWEEN $1 AND $2 AND NOT se.is_bot
        AND ($3::text IS NULL OR t.content_kind = $3)
      GROUP BY se.token, t.content_kind, t.label, t.campaign, t.placement
      ORDER BY resolutions DESC
      LIMIT $4`,
    [start, end, kind || null, Math.min(Number(limit) || 25, 100)],
  );
  return r.rows;
}

// dimension: device | country | referrer
export async function breakdown(query, { dimension = 'device', from, to } = {}) {
  const { start, end } = parseRange(from, to);
  if (dimension === 'referrer') {
    const r = await query(
      `SELECT CASE WHEN referrer IS NULL OR referrer = '' THEN 'direct / QR scan'
                   ELSE regexp_replace(referrer, '^https?://([^/]+).*$', '\\1') END AS key,
              COUNT(*)::int AS n
         FROM redirector.scan_events
        WHERE occurred_at BETWEEN $1 AND $2 AND NOT is_bot
        GROUP BY key ORDER BY n DESC LIMIT 50`,
      [start, end],
    );
    return r.rows;
  }
  const col = BREAKDOWN_COLUMN[dimension] || 'device_class';
  const r = await query(
    `SELECT COALESCE(${col}, 'unknown') AS key, COUNT(*)::int AS n
       FROM redirector.scan_events
      WHERE occurred_at BETWEEN $1 AND $2 AND NOT is_bot
      GROUP BY key ORDER BY n DESC LIMIT 50`,
    [start, end],
  );
  return r.rows;
}

// Full per-token report: daily series, alias split, device/country breakdown,
// landing conversion, and (for DQR) which asset was served each day (§17.1).
export async function tokenReport(query, token, { from, to } = {}) {
  const { start, end } = parseRange(from, to);
  const p = [token, start, end];
  const [series, aliasSplit, devices, countries, conversion, dqrByDay] = await Promise.all([
    query(`SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*)::int AS scans,
                  COUNT(*) FILTER (WHERE is_bot)::int AS bots
             FROM redirector.scan_events WHERE token=$1 AND occurred_at BETWEEN $2 AND $3
             GROUP BY day ORDER BY day`, p),
    query(`SELECT COUNT(*) FILTER (WHERE via_alias IS NULL)::int AS canonical,
                  COUNT(*) FILTER (WHERE via_alias IS NOT NULL)::int AS via_alias
             FROM redirector.scan_events WHERE token=$1 AND occurred_at BETWEEN $2 AND $3 AND NOT is_bot`, p),
    query(`SELECT COALESCE(device_class,'unknown') AS key, COUNT(*)::int AS n
             FROM redirector.scan_events WHERE token=$1 AND occurred_at BETWEEN $2 AND $3 AND NOT is_bot
             GROUP BY key ORDER BY n DESC`, p),
    query(`SELECT COALESCE(country_code,'??') AS key, COUNT(*)::int AS n
             FROM redirector.scan_events WHERE token=$1 AND occurred_at BETWEEN $2 AND $3 AND NOT is_bot
             GROUP BY key ORDER BY n DESC`, p),
    query(`SELECT COUNT(*) FILTER (WHERE landing_shown)::int AS landings_shown,
                  COUNT(*) FILTER (WHERE landing_action IS NOT NULL)::int AS actions
             FROM redirector.scan_events WHERE token=$1 AND occurred_at BETWEEN $2 AND $3 AND NOT is_bot`, p),
    query(`SELECT date_trunc('day', se.occurred_at)::date AS day, a.title, COUNT(*)::int AS served
             FROM redirector.scan_events se JOIN redirector.assets a ON a.asset_id = se.resolved_asset_id
            WHERE se.token=$1 AND se.occurred_at BETWEEN $2 AND $3 AND NOT se.is_bot
            GROUP BY day, a.title ORDER BY day`, p),
  ]);
  return {
    token,
    series: series.rows,
    alias_split: aliasSplit.rows[0],
    devices: devices.rows,
    countries: countries.rows,
    conversion: conversion.rows[0],
    served_by_day: dqrByDay.rows,
  };
}

// §17.2 — group every placement token for one asset and rank by resolutions.
export async function campaignReport(query, assetId) {
  const r = await query(
    `SELECT t.token, t.placement, t.campaign, t.state,
            COALESCE(c.n, 0)::int AS resolutions, MAX(c.last) AS last_resolved
       FROM redirector.tokens t
       LEFT JOIN (
         SELECT token, COUNT(*) AS n, MAX(occurred_at) AS last
           FROM redirector.scan_events WHERE NOT is_bot GROUP BY token
       ) c ON c.token = t.token
      WHERE t.asset_id = $1
      GROUP BY t.token, t.placement, t.campaign, t.state, c.n
      ORDER BY resolutions DESC`,
    [assetId],
  );
  return r.rows; // cost_per_scan is operator-filled in the console
}

// Resume progression from what was actually served (covers anon + account) §17.1.
export async function resumeReport(query, token) {
  const r = await query(
    `SELECT a.sort_order AS position, a.title, COUNT(*)::int AS served
       FROM redirector.scan_events se JOIN redirector.assets a ON a.asset_id = se.resolved_asset_id
      WHERE se.token = $1 AND NOT se.is_bot
      GROUP BY a.sort_order, a.title ORDER BY a.sort_order`,
    [token],
  );
  return r.rows;
}

export async function probeReport(query, { from, to } = {}) {
  const { start, end } = parseRange(from, to);
  const [series, total] = await Promise.all([
    query(`SELECT date_trunc('day', occurred_at)::date AS day, COUNT(*)::int AS probes,
                  COUNT(DISTINCT ip_hash)::int AS sources
             FROM redirector.probe_events WHERE occurred_at BETWEEN $1 AND $2
             GROUP BY day ORDER BY day`, [start, end]),
    query(`SELECT COUNT(*)::int AS total FROM redirector.probe_events WHERE occurred_at BETWEEN $1 AND $2`, [start, end]),
  ]);
  return { total: total.rows[0].total, series: series.rows };
}
