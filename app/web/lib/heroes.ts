// ============================================================================
// HOME HERO — the wide album banners the home page opens with.
//
// The pictures are made by wpf/CoverArtStudio's Hero Images view, which
// reverse-engineers each album's square cover into a 16:9 cinematic still with
// no lettering, and writes it into this app:
//
//     public/images/heroes/<persona-folder>/<CODE>.webp
//         ->  /images/heroes/jubilee-inspire/JEIM1043EN.webp
//
// This module is the read side. It walks that folder, pairs every picture with
// the album it was made from, and hands the home page a few at random.
//
// 🔴 THE FOLDER IS THE SOURCE OF TRUTH, NOT A LIST. There is no manifest of
// heroes to keep in step: a picture appears here because it exists on disk, and
// one pulled for regeneration (Cover Art Studio moves it to
// review\_heroes-rejected\) stops being offered the moment it is moved. A list
// would have to be edited in a second place every time, and the site would go on
// serving a picture that had already been rejected.
//
// 🔴 ONLY <CODE>.webp, NEVER <CODE> (2).webp. Cover Art Studio never overwrites
// a hero: a second draft lands beside the first as "(2)", and promoting it is a
// decision someone makes by hand. Offering both here would put an unreviewed
// draft on the front page on a coin toss.
//
// Server-only: it reads the filesystem. Import from Server Components.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { getAlbumByCode } from './manifest';
import { coverFor } from './covers';
import { albumBlurb } from './albumBlurb';
import { albumDescription } from './albumDescriptions';

const HERO_DIR = path.join(process.cwd(), 'public', 'images', 'heroes');
const EXTENSIONS = new Set(['.webp', '.png', '.jpg', '.jpeg']);

export interface HeroSlide {
  code: string;
  title: string;
  artistName: string;
  /** The album page — where the picture goes when it is clicked. */
  href: string;
  /** Site-absolute URL of the hero picture. */
  image: string;
  /** The album's square cover — what the footer player shows once it is playing. */
  cover: string;
  /** One sentence about the album, composed from its own theme and genres. */
  blurb: string;
  trackCount: number;
}

/**
 * Every album that has a hero picture AND is playable in this tenant's
 * catalogue, in a stable order (by code).
 *
 * Cached for the life of the process, like the catalogue itself: this is a
 * directory walk of a folder that only changes when someone generates a picture
 * and redeploys, and the home page is the hottest route on the site.
 */
let cached: HeroSlide[] | null = null;

export function heroPool(): HeroSlide[] {
  if (cached) return cached;

  const out: HeroSlide[] = [];
  let personas: string[] = [];
  try {
    personas = fs.readdirSync(HERO_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    // No heroes folder at all — a valid state (a fresh checkout, another
    // tenant's build). The home page simply opens on its rows.
    cached = [];
    return cached;
  }

  for (const persona of personas) {
    let files: string[] = [];
    try { files = fs.readdirSync(path.join(HERO_DIR, persona)); } catch { continue; }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!EXTENSIONS.has(ext)) continue;

      // The live hero for an album is <CODE>.<ext> exactly. A name with
      // anything else in it — "(2)", a date, a note — is a draft sitting beside
      // it, and drafts are not published.
      const code = path.basename(file, ext);
      if (!/^[A-Z]{2,6}\d{3,6}[A-Z]{2}$/.test(code)) continue;

      // The album has to exist, be finished, and have something to play: the
      // slide carries a Play button, and one that starts nothing is worse than
      // no button at all. getAlbumByCode is tenant-scoped, so a tenant that
      // cannot see this album gets no slide for it.
      const album = getAlbumByCode(code);
      if (!album || album.status !== 'ready' || album.playable < 1) continue;

      out.push({
        code,
        title: album.title,
        artistName: album.artistName,
        href: `/album?c=${code}`,
        image: `/images/heroes/${persona}/${encodeURIComponent(file)}`,
        cover: coverFor(code, album.path),
        blurb: albumDescription(code, album.title, album.artistName, album.trackCount, album.tracks?.[0]?.title),
        trackCount: album.trackCount,
      });
    }
  }

  out.sort((a, b) => a.code.localeCompare(b.code));
  cached = out;
  return cached;
}

/**
 * One sentence about an album. Moved to lib/albumBlurb.ts on 2026-09-16 so the
 * album page banner can describe an album exactly the way this banner does; kept
 * here under its old name for anything that imports it from heroes.
 */
export const heroBlurb = albumBlurb;

/**
 * A few slides for the home page, drawn at random.
 *
 * RANDOM PER REQUEST, which is only honest because the home page is already
 * `dynamic = 'force-dynamic'` — it reads the language cookie on the server, so
 * it is rendered per request anyway and there is no cached HTML for a random
 * pick to contradict. A Fisher-Yates over a copy: sorting by Math.random() is
 * biased and, on some engines, can throw on an inconsistent comparator.
 */
export function heroSlides(count = 3): HeroSlide[] {
  const pool = heroPool().slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}

/**
 * THE FAMILY CAROUSEL (owner, 2026-09-16): twelve slides, one for each Inspire
 * family member. Each member's picture is drawn at random from their own albums,
 * and the order of the twelve is shuffled too, so every visit opens on a
 * different face. Grouped by the album's artist, so a tenant that cannot see a
 * member's albums simply gets one slide fewer.
 */
export function familyHeroSlides(): HeroSlide[] {
  const byArtist = new Map<string, HeroSlide[]>();
  for (const s of heroPool()) {
    const list = byArtist.get(s.artistName);
    if (list) list.push(s); else byArtist.set(s.artistName, [s]);
  }
  const picks = Array.from(byArtist.values(), (list) => list[Math.floor(Math.random() * list.length)]);
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}
