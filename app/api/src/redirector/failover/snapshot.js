'use strict';
// ============================================================================
// Flat-file failover snapshot — software/redirector.md §9.6.
//
// Every night at 02:00 local, each domain writes a static snapshot of its active
// tokens and aliases to plain files on local disk. If the database is later
// unreachable, the resolver falls back to this snapshot and keeps serving
// redirects in read-only mode — closing the last single point of failure inside
// each domain (§9.6, acceptance §20.10).
//
//   <snapshotDir>/tokens.json    token -> { state, destination, device_routes }
//   <snapshotDir>/aliases.json   alias -> token
//   <snapshotDir>/manifest.json  { generated_at, domain, counts, version }
//
// Snapshot contents per §9.6: token, alias, state, the resolved storage URL for
// `asset` mode tokens, the fallback asset URL for `rule` mode tokens, the first
// child for `resume` mode, and the device route map. Landing pages degrade to
// direct redirects in failover, so only the destination is stored.
// ============================================================================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { applyDeviceRoutes } from '../deviceRoutes.js';

const DIR = config.redirector.snapshotDir;
const FILE = (name) => path.join(DIR, name);
const VERSION = 1;

// ---- serialization (pure) --------------------------------------------------
// Turn the DB rows into the compact snapshot payload. Kept pure so it can be
// tested and reused without the database.
export function serializeSnapshot(tokenRows, aliasRows) {
  const tokens = {};
  for (const t of tokenRows) {
    const destination =
      t.resolution_mode === 'asset' ? t.asset_url
      : t.resolution_mode === 'rule' ? t.rule_fallback_url
      : t.resolution_mode === 'resume' ? t.first_child_url
      : null;
    if (!destination) continue; // nothing to serve read-only; skip
    tokens[t.token] = {
      state: t.state,
      destination,
      device_routes: t.device_routes_json || null,
    };
  }
  const aliases = {};
  for (const a of aliasRows) {
    if (tokens[a.token]) aliases[a.alias] = a.token; // only aliases of snapshot-able tokens
  }
  return {
    tokens,
    aliases,
    manifest: {
      version: VERSION,
      generated_at: new Date().toISOString(),
      domain: config.redirector.baseUrl,
      counts: { tokens: Object.keys(tokens).length, aliases: Object.keys(aliases).length },
    },
  };
}

// Write a payload to disk atomically (tmp + rename per file).
export async function persistSnapshot(payload, dir = DIR) {
  await fsp.mkdir(dir, { recursive: true });
  const writeAtomic = async (name, data) => {
    const dest = path.join(dir, name);
    const tmp = `${dest}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fsp.rename(tmp, dest);
  };
  await writeAtomic('tokens.json', payload.tokens);
  await writeAtomic('aliases.json', payload.aliases);
  await writeAtomic('manifest.json', payload.manifest);
  return payload.manifest;
}

// ---- write (DB) ------------------------------------------------------------
// Query active tokens (+ their resolved destinations) and approved aliases,
// then persist. Called nightly by the scheduler and by the CLI + deploy check.
export async function writeSnapshot() {
  const t = await query(
    `SELECT tk.token, tk.state, tk.resolution_mode, tk.device_routes_json,
            a.storage_url  AS asset_url,
            fa.storage_url AS rule_fallback_url,
            fc.storage_url AS first_child_url
       FROM redirector.tokens tk
       LEFT JOIN redirector.assets a  ON a.asset_id = tk.asset_id
       LEFT JOIN redirector.rules  r  ON r.rule_id  = tk.rule_id
       LEFT JOIN redirector.assets fa ON fa.asset_id = r.fallback_asset_id
       LEFT JOIN LATERAL (
         SELECT storage_url FROM redirector.assets
          WHERE taxonomy_node_id = tk.resume_node_id AND is_active
          ORDER BY sort_order NULLS LAST, created_at LIMIT 1
       ) fc ON TRUE
      WHERE tk.state = 'active'`,
  );
  const a = await query(
    `SELECT alias, token FROM redirector.aliases WHERE approval_status = 'approved'`,
  );
  const payload = serializeSnapshot(t.rows, a.rows);
  const manifest = await persistSnapshot(payload);
  logger.info({ counts: manifest.counts, dir: DIR }, 'redirector: failover snapshot written');
  return manifest;
}

// ---- read + resolve --------------------------------------------------------
// Cached load with mtime invalidation so failover reads stay cheap.
let cache = null; // { mtimeMs, tokens, aliases, manifest }
async function load(dir = DIR) {
  const tokensPath = path.join(dir, 'tokens.json');
  let stat;
  try { stat = await fsp.stat(tokensPath); } catch { return null; }
  if (cache && cache.dir === dir && cache.mtimeMs === stat.mtimeMs) return cache;
  const [tokens, aliases, manifest] = await Promise.all([
    fsp.readFile(path.join(dir, 'tokens.json'), 'utf8').then(JSON.parse).catch(() => ({})),
    fsp.readFile(path.join(dir, 'aliases.json'), 'utf8').then(JSON.parse).catch(() => ({})),
    fsp.readFile(path.join(dir, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => ({})),
  ]);
  cache = { dir, mtimeMs: stat.mtimeMs, tokens, aliases, manifest };
  return cache;
}

// True when a usable snapshot exists on disk (used by the deploy load-test).
export function snapshotExists(dir = DIR) {
  return fs.existsSync(path.join(dir, 'tokens.json'));
}
export async function loadSnapshot(dir = DIR) {
  return load(dir);
}

// Resolve an input (token or alias) from the snapshot. Mirrors the live
// resolver's redirect outcome but is read-only and degraded (no landing pages).
// Returns null when the input is not present, so the caller serves notfound.
export async function resolveFromSnapshot(input, ctx = {}, dir = DIR) {
  const snap = await load(dir);
  if (!snap) return null;
  const dc = ctx.deviceClass || 'unknown';
  const userAgent = ctx.userAgent || '';

  let token = input;
  let viaAlias = null;
  let entry = snap.tokens[token];
  if (!entry) {
    const aliased = snap.aliases[input];
    if (aliased && snap.tokens[aliased]) {
      token = aliased;
      viaAlias = input;
      entry = snap.tokens[aliased];
    }
  }
  if (!entry) return null;

  const routed = applyDeviceRoutes(entry.device_routes, dc, userAgent);
  const destination = routed || entry.destination;
  if (!destination) return null;

  return {
    outcome: 'redirect',
    status: 302,
    destination,
    token,
    viaAlias,
    deviceClass: dc,
    isBot: dc === 'bot',
    degraded: true, // §9.6 read-only failover
  };
}
