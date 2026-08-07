'use strict';
// ============================================================================
// Resume tokens — software/redirector.md §6.6.
//
// A resume token is bound to a taxonomy node, not a single asset, and resolves to
// the next unconsumed item in that node's ordered children FOR THE SPECIFIC PERSON
// scanning: chapter one for a new reader, chapter seven for a returning one, from
// the same printed code.
//
// Progress:
//   - anonymous: a first-party cookie scoped to the domain (2y), owned by the web
//     layer; the resolver just receives/returns the position (never joined to any
//     other dataset, §17.3).
//   - SSO account: stored server-side in rdr_resume_state (subject_type='account'),
//     and takes precedence.
//   - cookie vs account disagreement resolves to the FURTHER position, never
//     backward. Advancing merges both forward.
//   - unreadable progress -> first child; never error (§9.4).
//
// The pure helpers (mergeEffective, nextUnconsumed) and resolveResume/advanceResume
// take injected deps so the whole logic is testable offline; the *Db wrappers bind
// the real queries.
// ============================================================================
import { query } from '../db.js';

// Further of two positions, never backward. null means "no progress yet".
export function mergeEffective(cookiePos, accountPos) {
  if (cookiePos == null && accountPos == null) return null;
  if (cookiePos == null) return accountPos;
  if (accountPos == null) return cookiePos;
  return Math.max(cookiePos, accountPos);
}

// The next child after `effectivePos` (by sort_order). No progress -> first child.
// Past the end -> clamp to the last child (a DQR/resume must never dead-end).
export function nextUnconsumed(children, effectivePos) {
  if (!children.length) return null;
  if (effectivePos == null) return children[0];
  const next = children.find((c) => (c.sort_order ?? 0) > effectivePos);
  return next || children[children.length - 1];
}

/**
 * @param children sorted asc by sort_order
 * @param ctx { cookiePos:number|null, accountId:string|null, reset:boolean }
 * @param deps { readAccount?: (accountId)=>Promise<number|null> }
 */
export async function resolveResume(children, ctx, deps = {}) {
  if (!children.length) return null;
  let accountPos = null;
  if (ctx.accountId && deps.readAccount) {
    try { accountPos = await deps.readAccount(ctx.accountId); } catch { accountPos = null; }
  }
  const effective = ctx.reset ? null : mergeEffective(ctx.cookiePos ?? null, accountPos);
  const child = nextUnconsumed(children, effective);
  const index = children.indexOf(child);
  return { child, position: child.sort_order ?? index, index, count: children.length };
}

// Consume `child`: merge progress forward for both cookie (returned) and account.
export async function advanceResume(ctx, child, deps = {}) {
  const pos = child.sort_order ?? 0;
  const newCookiePos = ctx.cookiePos == null ? pos : Math.max(ctx.cookiePos, pos);
  if (ctx.accountId && deps.writeAccount) {
    try { await deps.writeAccount(ctx.accountId, child.asset_id, pos); } catch { /* never block the redirect */ }
  }
  return newCookiePos;
}

// ---- DB-backed deps + wrappers --------------------------------------------
async function childrenOf(nodeId) {
  const r = await query(
    `SELECT asset_id, title, content_kind, summary, cover_image_url, sort_order, taxonomy_node_id
       FROM redirector.assets WHERE taxonomy_node_id = $1 AND is_active
      ORDER BY sort_order NULLS LAST, created_at`,
    [nodeId],
  );
  return r.rows;
}

function accountDeps(token) {
  return {
    readAccount: async (accountId) => {
      const r = await query(
        `SELECT last_position FROM redirector.resume_state
          WHERE token = $1 AND subject_key = $2 AND subject_type = 'account'`,
        [token, accountId],
      );
      return r.rows[0]?.last_position ?? null;
    },
    writeAccount: async (accountId, assetId, pos) => {
      await query(
        `INSERT INTO redirector.resume_state (token, subject_key, subject_type, last_asset_id, last_position)
         VALUES ($1,$2,'account',$3,$4)
         ON CONFLICT (token, subject_key) DO UPDATE
           SET last_asset_id = EXCLUDED.last_asset_id,
               last_position = GREATEST(redirector.resume_state.last_position, EXCLUDED.last_position),
               updated_at = NOW()`,
        [token, accountId, assetId, pos],
      );
    },
    resetAccount: async (accountId) => {
      await query(
        `DELETE FROM redirector.resume_state WHERE token = $1 AND subject_key = $2 AND subject_type = 'account'`,
        [token, accountId],
      );
    },
  };
}

export async function resolveResumeDb(token, nodeId, ctx) {
  const children = await childrenOf(nodeId);
  const deps = accountDeps(token);
  if (ctx.reset && ctx.accountId) { try { await deps.resetAccount(ctx.accountId); } catch { /* ignore */ } }
  return resolveResume(children, ctx, deps);
}

export async function advanceResumeDb(token, ctx, child) {
  return advanceResume(ctx, child, accountDeps(token));
}
