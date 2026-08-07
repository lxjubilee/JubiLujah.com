#!/usr/bin/env node
// ============================================================================
// rebuild-pools.mjs — spec §16 background service.
//
// Precomputes, for every theme × language, the eligible-track pool size and
// distinct-album count, and writes public/music/playlist-pools.json. The
// runtime engine (lib/eligibility.ts) stays the source of truth; this is the
// cache/warm layer §16 asks for: run nightly and on catalog publish (after
// scripts/enrich-tracks.mjs). It never caches ORDER — ordering is per-session.
//
// It also serves as a validator: any theme × language whose pool cannot satisfy
// the composition floor (target_track_count from ≥ min_distinct_albums) is
// reported so a new theme record can't ship a page that underfills unnoticed.
//
// The 7 eligibility rules here mirror lib/eligibility.ts §2.2 exactly.
//
// Run:  node scripts/rebuild-pools.mjs   (from app/web)
// ============================================================================
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v5 as uuidv5 } from 'uuid';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MUSIC = join(WEB, 'public', 'music');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';
const songUuid = (code, n) => uuidv5('song:' + String(code).toUpperCase() + ':' + String(n), JV_NAMESPACE);

const INSPIRE = new Set([
  'jubilee-inspire', 'melody-inspire', 'zariah-inspire', 'elias-inspire', 'eliana-inspire', 'caleb-inspire',
  'imani-inspire', 'zev-inspire', 'amir-inspire', 'nova-inspire', 'santiago-inspire', 'tahoma-inspire',
]);

const manifest = readJson(join(MUSIC, 'catalog-manifest.json'));
const meta = readJson(join(MUSIC, 'track-metadata.json')).tracks;
const themesDir = join(MUSIC, 'playlist-themes');
const themes = readdirSync(themesDir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(themesDir, f)));

const inRange = (v, r) => v >= r.min && v <= r.max;
const resolvePersonas = (t) => (t.eligible_personas === 'ALL_TWELVE' ? [...INSPIRE] : (t.eligible_personas || []));

// The candidate universe (playable, enriched, non-Christmas) — mirrors lib/catalogTracks.
const universe = [];
for (const c of manifest.categories || []) {
  for (const a of c.artists || []) {
    for (const al of a.albums || []) {
      if (al.christmas) continue;
      for (const tk of al.tracks || []) {
        if (tk.audio !== true || !tk.url) continue;
        const d = meta[songUuid(al.code, tk.n)];
        if (!d) continue;
        universe.push({ albumCode: al.code, persona: a.slug, meta: d, url: tk.url });
      }
    }
  }
}

// §2.2 eligibility for a theme + language.
function eligible(theme, lang, personaSet) {
  return universe.filter((t) =>
    inRange(t.meta.energy, theme.energy_range) &&
    inRange(t.meta.tempo, theme.tempo_range) &&
    t.meta.moods.some((m) => theme.emotional_profile.includes(m)) &&
    !t.meta.moods.some((m) => theme.excluded_moods.includes(m)) &&
    personaSet.has(t.persona) &&
    t.meta.lang === lang &&
    !!t.url,
  );
}

const out = { generated: new Date().toISOString(), note: 'Eligible pool sizes per theme×language (§16 cache). Order is never cached.', pools: {} };
const langs = [...new Set(universe.map((t) => t.meta.lang))].filter((l) => l !== 'other');
let problems = 0;

console.log(`themes: ${themes.length} | languages seen: ${langs.length} | candidate universe: ${universe.length}\n`);
for (const theme of themes.sort((a, b) => a.theme_id.localeCompare(b.theme_id))) {
  const personaSet = new Set(resolvePersonas(theme));
  const target = theme.target_track_count || 120;
  const minAlb = theme.min_distinct_albums || 30;
  const available = [];
  out.pools[theme.theme_id] = {};
  const rows = [];
  for (const lang of langs) {
    const pool = eligible(theme, lang, personaSet);
    if (!pool.length) continue;
    const albums = new Set(pool.map((t) => t.albumCode)).size;
    out.pools[theme.theme_id][lang] = { tracks: pool.length, albums };
    const fills = pool.length >= target && albums >= minAlb;
    if (fills) available.push(lang);
    if (lang === 'en' || fills) rows.push(`    ${lang}: ${pool.length} tracks / ${albums} albums ${fills ? '✓ fills' : '· partial (hidden per §7)'}`);
  }
  const enOk = available.includes('en');
  if (!enOk) problems++;
  console.log(`${enOk ? '✓' : '⚠'} ${theme.theme_id}  → available: [${available.join(', ') || 'none'}]`);
  rows.forEach((r) => console.log(r));
}

writeFileSync(join(MUSIC, 'playlist-pools.json'), JSON.stringify(out));
console.log(`\nwrote playlist-pools.json · ${Object.keys(out.pools).length} themes` + (problems ? ` · ⚠ ${problems} theme(s) cannot fill in English` : ' · all themes fill in English'));
process.exit(problems ? 1 : 0);
