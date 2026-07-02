// ============================================================================
// Mobile app config — PUBLIC read API (BRD: Mobile App Settings).
//
// Mounted at /api/mobile. GET /config returns the admin-curated category
// structure the mobile app overlays on its catalog: which top-level categories
// show, their order, their membership (albums/artists/collections), and the
// Music Type genres. Non-sensitive curation metadata — no auth required, like
// the public catalog routes.
//
// The catalog MANIFEST stays the source of album/artist/track/genre data; this
// endpoint only carries curation. When a category has no explicit admin items,
// sensible defaults are derived from the manifest (personas, children, etc.) so
// the five categories work out of the box before any curation.
// ============================================================================
import { Router } from 'express';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { getManifest, listArtists } from '../manifest.js';

const router = Router();

// distinct-album count per genre, from the same manifest the mobile app renders.
function genreCounts() {
  const m = getManifest();
  const counts = new Map();
  for (const c of m.raw.categories || []) {
    for (const a of c.artists || []) {
      for (const al of a.albums || []) {
        const seen = new Set();
        for (const g of Array.isArray(al.genres) ? al.genres : []) {
          const label = String(g).trim();
          const k = label.toLowerCase();
          if (!label || seen.has(k)) continue;
          seen.add(k);
          counts.set(label, (counts.get(label) || 0) + 1);
        }
      }
    }
  }
  return counts;
}

// Ordered Music Type list: explicit admin rows first (pinned 5 + any added), then
// auto genres that meet the ">= min albums" threshold, by album count desc.
function buildMusicTypes(rows, minCount) {
  const counts = genreCounts();
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const k = String(r.genre).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ genre: r.genre, label: r.label, order: out.length + 1, pinned: !!r.is_pinned });
  }
  const auto = [...counts.entries()]
    .filter(([g, n]) => n >= minCount && !seen.has(g.toLowerCase()))
    .sort((a, b) => b[1] - a[1]);
  for (const [g] of auto) {
    seen.add(g.toLowerCase());
    out.push({ genre: g, label: g, order: out.length + 1, pinned: false });
  }
  return out;
}

// Default membership derived from the manifest when a category has no admin items.
function defaultItems(key) {
  const m = getManifest();
  if (key === 'inspire_family') {
    return listArtists('inspire').map((a, i) => ({ type: 'artist', ref: a.slug, order: i + 1 }));
  }
  if (key === 'children') {
    const cat = (m.raw.categories || []).find((c) => c.key === 'children');
    const codes = [];
    for (const a of cat?.artists || []) for (const al of a.albums || []) codes.push(al.code);
    return codes.map((code, i) => ({ type: 'album', ref: code, order: i + 1 }));
  }
  if (key === 'family_friendly') {
    return m.byArtist.has('melody-inspire') ? [{ type: 'artist', ref: 'melody-inspire', order: 1 }] : [];
  }
  if (key === 'home') {
    return ['jubilee-inspire', 'melody-inspire']
      .filter((s) => m.byArtist.has(s))
      .map((s, i) => ({ type: 'artist', ref: s, order: i + 1 }));
  }
  return [];
}

function toItem(it, i) {
  const base = { type: it.item_type, ref: it.item_ref, order: it.display_order ?? i + 1 };
  if (it.item_type === 'collection') {
    return { ...base, title: it.title || 'Collection', albums: it.album_refs || [] };
  }
  return base;
}

router.get('/config', ah(async (req, res) => {
  const [cats, items, settings, mtypes] = await Promise.all([
    query(`SELECT id, key, label, kind, display_order
             FROM production.mobile_categories
            WHERE is_active AND is_visible
            ORDER BY display_order, id`),
    query(`SELECT category_id, item_type, item_ref, title, album_refs, display_order
             FROM production.mobile_category_items
            WHERE is_active
            ORDER BY display_order, id`),
    query(`SELECT min_album_count FROM production.mobile_settings WHERE id = 1`),
    query(`SELECT genre, label, display_order, is_pinned
             FROM production.mobile_music_types
            WHERE is_active
            ORDER BY display_order, id`),
  ]);

  const minCount = settings.rows[0]?.min_album_count ?? 12;
  const itemsByCat = new Map();
  for (const it of items.rows) {
    if (!itemsByCat.has(it.category_id)) itemsByCat.set(it.category_id, []);
    itemsByCat.get(it.category_id).push(it);
  }

  const categories = cats.rows.map((c) => {
    if (c.kind === 'music_type') {
      return {
        key: c.key, label: c.label, kind: c.kind, order: c.display_order,
        musicTypes: buildMusicTypes(mtypes.rows, minCount),
      };
    }
    const rows = itemsByCat.get(c.id) || [];
    const list = rows.length ? rows.map(toItem) : defaultItems(c.key);
    return { key: c.key, label: c.label, kind: c.kind, order: c.display_order, items: list };
  });

  res.set('Cache-Control', 'public, max-age=60');
  res.json({ version: 1, generated: getManifest().raw?.generated || null, categories });
}));

export default router;
