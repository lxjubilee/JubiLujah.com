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
// endpoint only carries curation. A category the admin hasn't curated (no
// sections) is returned with an empty `sections` list — the mobile app hides
// such pages — so only admin-curated categories appear in the app.
// ============================================================================
import { Router } from 'express';
import { ah } from '../util/async.js';
import { query } from '../db.js';
import { getManifest } from '../manifest.js';

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
// Curated (admin) rows carry an `albums` list (their manually-picked album refs);
// auto genres omit it, so the app falls back to catalog genre-tag matching.
function buildMusicTypes(rows, minCount, albumsByType) {
  const counts = genreCounts();
  const out = [];
  const seen = new Set();
  for (const r of rows) {
    const k = String(r.genre).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ genre: r.genre, label: r.label, order: out.length + 1, pinned: !!r.is_pinned, albums: albumsByType.get(r.id) || [] });
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

function toItem(it, i) {
  const base = { type: it.item_type, ref: it.item_ref, order: it.display_order ?? i + 1 };
  if (it.item_type === 'collection') {
    return { ...base, title: it.title || 'Collection', albums: it.album_refs || [] };
  }
  return base;
}

// Nested config (v2): each page carries an optional per-page `hero` and an
// ordered list of typed `sections`, each holding its items. A page with no admin
// sections returns an empty `sections` list (no manifest defaults), so the app
// hides it. The `music_type` page keeps its `musicTypes` list.
router.get('/config', ah(async (req, res) => {
  const [cats, sections, items, hero, settings, mtypes, mtAlbums] = await Promise.all([
    query(`SELECT id, key, label, kind, display_order, hero_enabled
             FROM production.mobile_categories
            WHERE is_active
            ORDER BY display_order, id`),
    query(`SELECT id, category_id, name, kind, display_order
             FROM production.mobile_sections
            WHERE is_active
            ORDER BY display_order, id`),
    query(`SELECT section_id, item_type, item_ref, title, album_refs, display_order
             FROM production.mobile_category_items
            WHERE is_active AND section_id IS NOT NULL
            ORDER BY display_order, id`),
    query(`SELECT category_id, album_ref, headline, subtitle, display_order
             FROM production.mobile_hero_slides
            WHERE is_active
              AND (starts_at IS NULL OR starts_at <= NOW())
              AND (ends_at   IS NULL OR ends_at   >= NOW())
            ORDER BY display_order, id`),
    query(`SELECT min_album_count FROM production.mobile_settings WHERE id = 1`),
    query(`SELECT id, genre, label, display_order, is_pinned
             FROM production.mobile_music_types
            WHERE is_active
            ORDER BY display_order, id`),
    query(`SELECT music_type_id, album_ref, display_order
             FROM production.mobile_music_type_albums
            WHERE is_active
            ORDER BY display_order, id`),
  ]);

  const minCount = settings.rows[0]?.min_album_count ?? 12;
  const groupBy = (rows, key) => {
    const m = new Map();
    for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
    return m;
  };
  const sectionsByCat = groupBy(sections.rows, 'category_id');
  const itemsBySection = groupBy(items.rows, 'section_id');
  const heroByCat = groupBy(hero.rows, 'category_id');
  const mtAlbumsByType = new Map();
  for (const r of mtAlbums.rows) {
    if (!mtAlbumsByType.has(r.music_type_id)) mtAlbumsByType.set(r.music_type_id, []);
    mtAlbumsByType.get(r.music_type_id).push(r.album_ref);
  }

  const categories = cats.rows.map((c) => {
    if (c.kind === 'music_type') {
      return {
        key: c.key, label: c.label, kind: c.kind, order: c.display_order,
        musicTypes: buildMusicTypes(mtypes.rows, minCount, mtAlbumsByType),
      };
    }

    const secRows = sectionsByCat.get(c.id) || [];
    // Admin sections ONLY — no manifest-derived defaults. A category the admin
    // hasn't curated (0 sections) returns no sections, so the mobile app hides it
    // (a page with 0 admin sections must not appear). music_type is unaffected —
    // it carries `musicTypes`, not sections, above.
    const sectionList = secRows.map((s) => ({
      name: s.name, kind: s.kind, order: s.display_order,
      items: (itemsBySection.get(s.id) || []).map(toItem),
    }));

    const out = { key: c.key, label: c.label, kind: c.kind, order: c.display_order, sections: sectionList };
    if (c.hero_enabled) {
      out.hero = {
        enabled: true,
        slides: (heroByCat.get(c.id) || []).map((h, i) => ({
          ref: h.album_ref,
          order: h.display_order ?? i + 1,
          headline: h.headline || null,
          subtitle: h.subtitle || null,
        })),
      };
    }
    return out;
  });

  res.set('Cache-Control', 'public, max-age=60');
  res.json({ version: 2, generated: getManifest().raw?.generated || null, categories });
}));

export default router;
