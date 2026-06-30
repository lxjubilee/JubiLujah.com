// Average "bestseller" composite score across the LIVE catalog (the same album
// set the Live-on-Site banner counts). Reads the per-album scores from
// lib/album-ratings.ts. Server-only (reads the manifest via fs).
import fs from 'node:fs';
import path from 'node:path';
import { ALBUM_RATINGS } from './album-ratings';
import { EXCLUDED_ARTISTS } from './productionHistory';

export function liveBestsellerAverage(): number {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'music', 'catalog-manifest.json'), 'utf8'));
    let sum = 0, n = 0;
    for (const c of m.categories || []) for (const a of c.artists || []) {
      if (EXCLUDED_ARTISTS.has(a.slug)) continue;
      for (const al of a.albums || []) {
        if ((al.playable || 0) > 0) {
          const r = ALBUM_RATINGS[al.code];
          if (typeof r === 'number' && r > 0) { sum += r; n++; }
        }
      }
    }
    return n ? Math.round((sum / n) * 10) / 10 : 0;
  } catch { return 0; }
}
