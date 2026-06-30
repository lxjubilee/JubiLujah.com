// Per-language catalog coverage for the admin Languages page: how many live
// albums/songs each supported language has (album language = code suffix).
// Server-only (reads the manifest via fs). Counts the live/official catalog
// (excludes the same non-family artists the other admin stats exclude).
import fs from 'node:fs';
import path from 'node:path';
import { LANGUAGES, albumLanguage, DEFAULT_LANG, type Lang } from './languages';
import { EXCLUDED_ARTISTS } from './productionHistory';

export interface LangRow extends Lang { albums: number; songs: number }
export interface LanguageStats {
  supported: number;
  withContent: number;
  totalAlbums: number;
  totalSongs: number;
  rows: LangRow[];
}

// Language codes that have at least one live album (for the public flag bar:
// non-privileged users only see languages with real content). Always includes
// English so the default is selectable.
export function languagesWithContent(): string[] {
  const codes = new Set<string>([DEFAULT_LANG]);
  for (const r of languageStats().rows) if (r.albums > 0) codes.add(r.code);
  return [...codes];
}

export function languageStats(): LanguageStats {
  const counts: Record<string, { albums: number; songs: number }> = {};
  for (const l of LANGUAGES) counts[l.code] = { albums: 0, songs: 0 };
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'music', 'catalog-manifest.json'), 'utf8'));
    for (const c of m.categories || []) for (const a of c.artists || []) {
      if (EXCLUDED_ARTISTS.has(a.slug)) continue;
      for (const al of a.albums || []) {
        if ((al.playable || 0) <= 0) continue; // live only
        const lang = albumLanguage(al.code);
        if (counts[lang]) { counts[lang].albums += 1; counts[lang].songs += al.playable; }
      }
    }
  } catch { /* manifest unreadable */ }

  const rows: LangRow[] = LANGUAGES.map((l) => ({ ...l, albums: counts[l.code].albums, songs: counts[l.code].songs }))
    .sort((a, b) => b.albums - a.albums || a.name.localeCompare(b.name));
  return {
    supported: LANGUAGES.length,
    withContent: rows.filter((r) => r.albums > 0).length,
    totalAlbums: rows.reduce((s, r) => s + r.albums, 0),
    totalSongs: rows.reduce((s, r) => s + r.songs, 0),
    rows,
  };
}
