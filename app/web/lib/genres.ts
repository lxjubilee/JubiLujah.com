// ============================================================================
// Top-2 "music style genres" for an album.
//
// PRIMARY source: public/music/album-genres.json — the real genres derived from
// each album's content files (lyrics .md "Styles:" lines + blueprint "Dominant
// Music Styles") by scripts/gen-album-genres.mjs. Keyed by album code.
//
// FALLBACK (for the few albums with no content files): derive from the persona's
// musical style + the album's worship theme. Pure + client-safe.
// ============================================================================
import { classifyTheme } from './themes';
import genreData from '@/public/music/album-genres.json';
import themeData from '@/public/music/album-themes.json';

const REAL: Record<string, string[]> = ((genreData as { genres?: Record<string, string[]> }).genres) || {};
const THEMES: Record<string, string> = ((themeData as { themes?: Record<string, string> }).themes) || {};

// A 1-5 word, Title-Case summary of what an album is ABOUT (not a genre),
// crafted per album from its lyrics. '' when none is set yet.
export function albumTheme(code: string): string {
  return THEMES[(code || '').toUpperCase()] || '';
}

// Persona slug -> primary music style (Title Case of the seed genre_anchor).
const PERSONA_GENRE: Record<string, string> = {
  'jubilee-inspire': 'Worship',
  'melody-inspire': 'Bridal Worship',
  'zariah-inspire': 'Intercession',
  'elias-inspire': 'Declaration',
  'eliana-inspire': 'Morning Worship',
  'caleb-inspire': 'Breakthrough',
  'imani-inspire': 'Gospel Soul',
  'zev-inspire': 'Hebrew Worship',
  'amir-inspire': 'Levantine Worship',
  'nova-inspire': 'Pop Worship',
  'santiago-inspire': 'Latin Worship',
  'tahoma-inspire': 'Cinematic Worship',
  'gabriel-inspire': 'Apostolic Worship',
};

// Worship theme -> a complementary music-style label.
const THEME_GENRE: Record<string, string> = {
  faithfulness: 'Worship',
  surrender: 'Devotional',
  praise: 'Praise & Worship',
  grace: 'Worship Ballad',
  victory: 'Anthem',
  hope: 'Inspirational',
  cross: 'Gospel',
  love: 'Worship Ballad',
  healing: 'Soaking',
  identity: 'Anthem',
  thanksgiving: 'Praise',
  presence: 'Soaking',
};

const FALLBACKS = ['Worship', 'Praise & Worship', 'Inspirational', 'Anthem', 'Gospel'];

export interface GenrePair { primary: string; secondary: string }

// Primary + secondary genre for an album — the album's ACTUAL music style,
// derived per-album from its blueprint "Dominant Music Styles" (album-genres.json
// via topGenres); the persona-anchor + worship-theme heuristic is the fallback
// only for albums with no content files.
export function genrePair(code: string, artistName: string, title: string): GenrePair {
  const top = topGenres(code, artistName, title);
  return { primary: top[0] || '', secondary: top[1] || '' };
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Up to two distinct music-style genres for an album. Uses the real, content-
// derived genres when available (by album code), else a persona+theme fallback.
export function topGenres(code: string, artistName: string, title: string): string[] {
  const real = REAL[(code || '').toUpperCase()];
  if (real && real.length) return real.slice(0, 2);

  const out: string[] = [];
  const persona = PERSONA_GENRE[slugify(artistName)];
  if (persona) out.push(persona);
  const themeGenre = THEME_GENRE[classifyTheme(title)];
  if (themeGenre && !out.includes(themeGenre)) out.push(themeGenre);
  for (const f of FALLBACKS) {
    if (out.length >= 2) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, 2);
}
