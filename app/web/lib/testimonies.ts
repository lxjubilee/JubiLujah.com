// ============================================================================
// Testimony interlude pool (SERVER-ONLY) — spec §8.
//
// Short RECORDED testimonies injected between songs. Per the spec, ONLY actual,
// historically recorded testimonies are eligible — never composed or dramatized
// accounts — so this module only ever reads a curated data file; it never
// generates content. Source: public/music/testimonies.json (produced from the
// testimony repository). Until that file exists this returns an empty pool, so
// the "Testimony interludes" toggle is present but simply injects nothing —
// correct behavior, never fabricated audio.
//
// testimonies.json shape:
//   { "generated": "...", "testimonies": [
//       { "id","category","title","url","durationSeconds","lang","image?" } ] }
// category ∈ a theme's testimony_categories (e.g. healing, provision, ...).
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import type { Interlude } from './compose';

interface RawTestimony {
  id: string;
  category: string;
  title: string;
  url: string;
  durationSeconds: number;
  lang?: string;
  image?: string | null;
}

const FILE = path.join(process.cwd(), 'public', 'music', 'testimonies.json');

let cache: RawTestimony[] | null = null;
function load(): RawTestimony[] {
  if (cache) return cache;
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    cache = Array.isArray(data.testimonies) ? data.testimonies : [];
  } catch {
    cache = [];
  }
  return cache!;
}

/** Interludes whose category is admissible for the theme (§8 matching), in the
 *  listener's language when a language is set on the testimony. 45–90s is the
 *  target length; over-long entries are dropped rather than breaking flow. */
export function getTestimonies(categories: string[], lang: string): Interlude[] {
  const cats = new Set(categories);
  return load()
    .filter((t) => cats.has(t.category))
    .filter((t) => !t.lang || t.lang === lang)
    .filter((t) => t.durationSeconds > 0 && t.durationSeconds <= 120)
    .map((t) => ({
      id: t.id,
      kind: 'testimony' as const,
      category: t.category,
      title: t.title,
      url: t.url,
      durationSeconds: t.durationSeconds,
      image: t.image ?? null,
    }));
}
