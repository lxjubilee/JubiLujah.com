'use strict';
// ============================================================================
// DQR rule cache — software/redirector.md §7.2.
//
// "Evaluation must complete in under 50ms. Precompute or cache the candidate
//  pool in memory, refreshed every 5 minutes." Rules and the latest_in_collection
//  lookup are cached here with a 5-minute TTL so the hot resolve path does at most
//  one tiny DB read (the resolved asset), and usually zero for the rule itself.
//
// evaluateRuleForToken() is what the resolver calls: it returns BOTH the evaluated
// asset id and the mandatory fallback id, so the resolver can guarantee a DQR
// never dead-ends (§7.2) even if evaluation returns nothing or the asset is gone.
// ============================================================================
import { query } from '../../db.js';
import { evaluateRule } from './engine.js';

const TTL_MS = 5 * 60 * 1000;

const ruleCache = new Map();       // rule_id -> { exp, rule }
const collectionCache = new Map(); // node_id -> { exp, assetId }

async function loadRule(ruleId) {
  const hit = ruleCache.get(ruleId);
  if (hit && hit.exp > Date.now()) return hit.rule;
  const r = await query(
    `SELECT rule_id, strategy, parameters_json, pool_json, timezone, default_region, fallback_asset_id, is_active
       FROM redirector.rules WHERE rule_id = $1`,
    [ruleId],
  );
  const rule = r.rows[0] || null;
  ruleCache.set(ruleId, { exp: Date.now() + TTL_MS, rule });
  return rule;
}

// Newest published, active asset under a collection node (for latest_in_collection).
async function latestInCollection(nodeId) {
  if (!nodeId) return null;
  const hit = collectionCache.get(nodeId);
  if (hit && hit.exp > Date.now()) return hit.assetId;
  const r = await query(
    `SELECT asset_id FROM redirector.assets
      WHERE taxonomy_node_id = $1 AND is_active
      ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1`,
    [nodeId],
  );
  const assetId = r.rows[0]?.asset_id || null;
  collectionCache.set(nodeId, { exp: Date.now() + TTL_MS, assetId });
  return assetId;
}

// Resolve a rule token to { evaluatedId, fallbackId }. Never throws — evaluation
// failure yields evaluatedId=null so the caller falls back.
export async function evaluateRuleForToken(ruleId, ctx = {}) {
  const rule = await loadRule(ruleId);
  if (!rule) return { evaluatedId: null, fallbackId: null };
  let evaluatedId = null;
  try {
    evaluatedId = await evaluateRule(rule, ctx, { latestInCollection });
  } catch {
    evaluatedId = null; // §7.2 — fall back rather than dead-end
  }
  return { evaluatedId, fallbackId: rule.fallback_asset_id || null };
}

// Test/ops hook: drop caches (e.g. after a rule edit) so the next resolve is fresh.
export function clearRuleCaches() {
  ruleCache.clear();
  collectionCache.clear();
}
