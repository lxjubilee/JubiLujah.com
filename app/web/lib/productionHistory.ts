// ============================================================================
// Production History — weekly release/quota tracking.
//
// Each LIVE album (playable on the production site) is bucketed by the US
// workweek (Sunday→Saturday, PST) of its COMPLETION DATE = when its audio was
// uploaded to J: (see scripts/gen-completion-dates.mjs, album-completion-dates
// .json). Because completion dates are immutable, a past week's numbers are
// permanent automatically. Weekly quota: 45 albums / 540 songs = 100%.
//
// Server-only (reads generated JSON via fs).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';

export const ALBUM_QUOTA = 45;
export const SONG_QUOTA = 540;

// Workweeks before this YYWW are hidden: completion dates there came from a bulk
// file-copy that clustered J: mtimes, so their weekly breakdown isn't accurate.
// The page shows production results from this workweek forward. (Cumulative-live
// totals still include the earlier albums, since those albums ARE live.)
export const MIN_YYWW = 2623;

// Artists excluded from the official catalog (must mirror api/src/manifest.js
// EXCLUDED_ARTISTS). These non-family artists are hidden from the website browse,
// the mobile app, and the analytics counts — so the "live" totals here must skip
// them too, otherwise Production History over-counts vs Media Analytics.
export const EXCLUDED_ARTISTS = new Set([
  'gabriel-inspire', 'kingdom-pulse', 'radiant-stones',
  'children-evangelism', 'gospel-by-music', 'judah-boone', 'mercy-belle-hayes',
  'mihaiela-norica', 'ron-tank',
  'allan-hassan', 'animals-blue-symbols', 'cornell-kay', 'daisy-wylder', 'gage-darron',
  'happy-rumbles', 'my-tiny-tumbles', 'ruthie-bolton', 'wolf-ladybug-butterfly',
  'veselia-copiilor', 'zburdalnicii',
]);

export interface WeekRow {
  yyww: string;          // YYWW, e.g. "2625"
  year: number;
  week: number;
  startLabel: string;    // e.g. "Jun 21"
  endLabel: string;      // e.g. "Jun 27"
  rangeLabel: string;    // "Jun 21 – Jun 27, 2026"
  albums: number;        // albums completed this week (live)
  songs: number;         // songs completed this week (live)
  albumPct: number;      // round(albums / 45 * 100)
  songPct: number;       // round(songs / 540 * 100)
  quotaScore: number;    // round((albumPct + songPct) / 2)
  cumAlbums: number;     // cumulative live albums through end of this week
  cumSongs: number;
  isCurrent: boolean;
}

// PST (America/Los_Angeles) Y/M/D for an ISO date or epoch.
function pstYMD(d: string | number): { y: number; m: number; day: number } {
  const s = new Date(d).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [m, day, y] = s.split(/[/,\s]+/).map((x) => parseInt(x, 10));
  return { y, m, day };
}
function isLeap(y: number) { return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0); }
function dayOfYear(y: number, m: number, d: number) {
  const days = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let n = d; for (let i = 0; i < m - 1; i++) n += days[i]; return n;
}
const dow = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun
// US week number (%U): week 1 begins on the first Sunday; earlier days = week 0.
function usWeek(y: number, m: number, d: number): number {
  const doy = dayOfYear(y, m, d);
  const firstSun = 1 + ((7 - dow(y, 1, 1)) % 7);
  const weekStart = doy - dow(y, m, d);
  if (weekStart < firstSun) return 0;
  return Math.floor((weekStart - firstSun) / 7) + 1;
}
const yyww = (y: number, w: number) => String(y).slice(-2) + String(w).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function weekRange(y: number, w: number): { start: Date; end: Date } {
  const firstSun = 1 + ((7 - dow(y, 1, 1)) % 7);
  const startDoy = w === 0 ? 1 : firstSun + (w - 1) * 7;
  return { start: new Date(Date.UTC(y, 0, startDoy)), end: new Date(Date.UTC(y, 0, startDoy + 6)) };
}

function load<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'music', file), 'utf8')); } catch { return fallback; }
}

export function productionHistory(): { weeks: WeekRow[]; totalLiveAlbums: number; totalLiveSongs: number; currentYyww: string } {
  const manifest = load<any>('catalog-manifest.json', { categories: [] });
  const reg = load<{ dates: Record<string, string> }>('album-completion-dates.json', { dates: {} });
  const dates = reg.dates || {};

  // Sum live songs per album, keyed by code.
  const live: { code: string; songs: number }[] = [];
  for (const c of manifest.categories || []) for (const a of c.artists || []) {
    if (EXCLUDED_ARTISTS.has(a.slug)) continue;   // match the official (API) catalog
    for (const al of a.albums || []) {
      if ((al.playable || 0) > 0) live.push({ code: al.code, songs: al.playable });
    }
  }
  const totalLiveAlbums = live.length;
  const totalLiveSongs = live.reduce((s, x) => s + x.songs, 0);

  // Bucket by completion workweek.
  const buckets = new Map<string, { y: number; w: number; albums: number; songs: number }>();
  for (const al of live) {
    const iso = dates[al.code];
    if (!iso) continue;
    const { y, m, day } = pstYMD(iso);
    const w = usWeek(y, m, day);
    const key = yyww(y, w);
    const b = buckets.get(key) || { y, w, albums: 0, songs: 0 };
    b.albums += 1; b.songs += al.songs;
    buckets.set(key, b);
  }

  // Current workweek (PST).
  const now = pstYMD(new Date().toISOString());
  const currentYyww = yyww(now.y, usWeek(now.y, now.m, now.day));

  const ordered = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let cumA = 0, cumS = 0;
  const rows: WeekRow[] = ordered.map(([key, b]) => {
    cumA += b.albums; cumS += b.songs;
    const { start, end } = weekRange(b.y, b.w);
    const albumPct = Math.round((b.albums / ALBUM_QUOTA) * 100);
    const songPct = Math.round((b.songs / SONG_QUOTA) * 100);
    return {
      yyww: key, year: b.y, week: b.w,
      startLabel: `${MON[start.getUTCMonth()]} ${start.getUTCDate()}`,
      endLabel: `${MON[end.getUTCMonth()]} ${end.getUTCDate()}`,
      rangeLabel: `${MON[start.getUTCMonth()]} ${start.getUTCDate()} – ${MON[end.getUTCMonth()]} ${end.getUTCDate()}, ${b.y}`,
      albums: b.albums, songs: b.songs, albumPct, songPct,
      quotaScore: Math.round((albumPct + songPct) / 2),
      cumAlbums: cumA, cumSongs: cumS,
      isCurrent: key === currentYyww,
    };
  });
  // Hide the inaccurate early weeks (cumulative above already counted them, so
  // the first visible week's cumulative still reflects all live albums to date).
  const visible = rows.filter((r) => Number(r.yyww) >= MIN_YYWW);
  visible.reverse(); // newest first
  return { weeks: visible, totalLiveAlbums, totalLiveSongs, currentYyww };
}
