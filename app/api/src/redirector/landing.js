'use strict';
// ============================================================================
// Landing page payload — software/redirector.md §11.
//
// When a token has landing_enabled, the resolver returns an arrival-page payload
// instead of a bare redirect: the data the web template needs to render the
// required blocks (§11.1) — hero, primary action, context strip, related items,
// and (later phases) the persona note and resume control. The real destination
// is included for the server that renders the page but is NEVER printed into the
// HTML: the primary action links to /r/<token>/go, which re-resolves server-side
// and tracks landing_action (§11.2), so no storage path ever leaks (§9.4).
//
// This is the page path, not the <100ms redirect hot path, so a couple of small
// indexed queries here are fine (the budget is <1s render, §11.2 / §20.2).
// ============================================================================
import { query } from '../db.js';

// The obvious next-tap verb by content kind (§11.1 primary action).
export function verbForKind(kind) {
  switch (kind) {
    case 'album': return 'Open album';
    case 'track': case 'video': case 'devotional': return 'Play';
    case 'book': case 'chapter': case 'article': return 'Read';
    case 'pdf': case 'image': return 'Download';
    case 'app': case 'external': return 'Open';
    default: return 'Open';
  }
}

// Pure shaping: given the asset row, its breadcrumb path, and sibling rows, build
// the payload object. Kept pure (no DB) so it can be tested offline.
export function shapeLanding(asset, path, relatedRows, base, extras = {}) {
  // App deep-link target derived from the asset (not the opaque token): the mobile
  // app opens the album directly by code (+ track for songs) rather than having to
  // resolve a token. album slug = <code>; song slug = <code>#<n>.
  let deepLink = null;
  const slug = asset.slug ? String(asset.slug) : '';
  if (asset.content_kind === 'album' && slug) deepLink = { code: slug, t: null };
  else if (asset.content_kind === 'track' && slug.includes('#')) {
    const [c, n] = slug.split('#');
    if (c) deepLink = { code: c, t: n || null };
  }
  return {
    hero: {
      title: asset.title,
      content_kind: asset.content_kind,
      summary: asset.summary || null,
      cover_image_url: asset.cover_image_url || null,
    },
    primary: { verb: verbForKind(asset.content_kind) },
    deepLink,
    context_path: path || null,
    related: (relatedRows || []).slice(0, 4).map((r) => ({
      title: r.title,
      kind: r.content_kind,
      cover_image_url: r.cover_image_url || null,
      short_url: r.token ? `${base}/r/${r.token}` : null,
    })),
    persona: extras.persona || null,   // §6.7 ephemeral persona tokens (Phase 11)
    resume: extras.resume || null,     // §6.6 resume tokens (Phase 8)
  };
}

// Breadcrumb from the asset's taxonomy node up to the root (e.g. Persona > Album > Song).
async function nodePath(nodeId) {
  if (!nodeId) return null;
  const r = await query(
    `WITH RECURSIVE up AS (
       SELECT node_id, parent_node_id, title, 0 AS depth
         FROM redirector.taxonomy_nodes WHERE node_id = $1
       UNION ALL
       SELECT n.node_id, n.parent_node_id, n.title, up.depth + 1
         FROM redirector.taxonomy_nodes n JOIN up ON n.node_id = up.parent_node_id)
     SELECT string_agg(title, ' > ' ORDER BY depth DESC) AS path FROM up`,
    [nodeId],
  );
  return r.rows[0]?.path || null;
}

// Two-to-four siblings from the same taxonomy node, each with its active token.
async function relatedSiblings(asset) {
  if (!asset.taxonomy_node_id) return [];
  const r = await query(
    `SELECT DISTINCT ON (a.asset_id) a.asset_id, a.title, a.content_kind, a.cover_image_url, t.token
       FROM redirector.assets a
       LEFT JOIN redirector.tokens t
         ON t.asset_id = a.asset_id AND t.resolution_mode = 'asset' AND t.state = 'active'
      WHERE a.taxonomy_node_id = $1 AND a.is_active AND a.asset_id <> $2
      ORDER BY a.asset_id, t.created_at NULLS LAST
      LIMIT 8`,
    [asset.taxonomy_node_id, asset.asset_id],
  );
  return r.rows.filter((x) => x.token).slice(0, 4);
}

export async function buildLandingPayload(asset, tokenRow, base, extras = {}) {
  const [path, related] = await Promise.all([nodePath(asset.taxonomy_node_id), relatedSiblings(asset)]);
  return shapeLanding(asset, path, related, base, extras);
}
