// ============================================================================
// Playlist Theme registry (SERVER-ONLY).
//
// A Playlist Theme (spec §2.1) is a first-class DATA object, not a hard-coded
// page. Every *.json file in public/music/playlist-themes/ is one theme; drop a
// new file in and a fully working playlist page exists at /playlist/<theme_id>
// with NO code change (acceptance criterion §18.14). This module loads and
// validates them.
//
// NOTE: distinct from lib/themes.ts (the 12-item Home browse taxonomy) and from
// album-themes.json (per-album taglines). Those are unrelated legacy concepts.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { INSPIRE_ORDER } from './personas';

export interface IntRange { min: number; max: number }

export interface ThemeSequencing {
  open_min_energy?: number;
  max_consecutive_below_energy?: number;
  max_consecutive_below_count?: number;
  distribute_peaks?: boolean;
}

export interface ThemeRecord {
  theme_id: string;
  theme_name: string;
  theme_statement: string;
  emotional_profile: string[];
  energy_range: IntRange;
  tempo_range: IntRange;
  excluded_moods: string[];
  eligible_personas: string[] | 'ALL_TWELVE';
  target_track_count: number;
  max_tracks_per_album: number;
  min_distinct_albums: number;
  testimony_categories: string[];
  supported_arcs: string[];
  default_arc: string;
  available_languages?: string[];
  sequencing?: ThemeSequencing;
  hero_image?: string | null;
  accent?: string;
  related_theme_ids?: string[];
}

const THEMES_DIR = path.join(process.cwd(), 'public', 'music', 'playlist-themes');

let cache: ThemeRecord[] | null = null;

function normalize(raw: Record<string, unknown>): ThemeRecord | null {
  if (!raw || typeof raw.theme_id !== 'string') return null;
  const r = raw as unknown as ThemeRecord;
  return {
    ...r,
    emotional_profile: r.emotional_profile || [],
    excluded_moods: r.excluded_moods || [],
    target_track_count: r.target_track_count || 120,
    max_tracks_per_album: r.max_tracks_per_album || 4,
    min_distinct_albums: r.min_distinct_albums || 30,
    testimony_categories: r.testimony_categories || [],
    supported_arcs: r.supported_arcs && r.supported_arcs.length ? r.supported_arcs : ['steady'],
    default_arc: r.default_arc || (r.supported_arcs && r.supported_arcs[0]) || 'steady',
    related_theme_ids: r.related_theme_ids || [],
  };
}

/** All theme records, sorted by name. Cached per server process. */
export function listThemes(): ThemeRecord[] {
  if (cache) return cache;
  let files: string[] = [];
  try {
    files = fs.readdirSync(THEMES_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    files = [];
  }
  const out: ThemeRecord[] = [];
  for (const f of files) {
    try {
      const t = normalize(JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf8')));
      if (t) out.push(t);
    } catch {
      /* skip malformed theme file */
    }
  }
  out.sort((a, b) => a.theme_name.localeCompare(b.theme_name));
  cache = out;
  return out;
}

export function getTheme(themeId: string): ThemeRecord | null {
  return listThemes().find((t) => t.theme_id === themeId) || null;
}

export function allThemeIds(): string[] {
  return listThemes().map((t) => t.theme_id);
}

/** Resolve eligible_personas to concrete persona slugs (ALL_TWELVE → the 12). */
export function resolveEligiblePersonas(theme: ThemeRecord): string[] {
  if (theme.eligible_personas === 'ALL_TWELVE') return [...INSPIRE_ORDER];
  return (theme.eligible_personas || []).filter((s) => INSPIRE_ORDER.includes(s));
}
