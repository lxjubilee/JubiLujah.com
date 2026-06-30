import { cookies } from 'next/headers';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import { isPersona } from '@/lib/personas';
import { THEMES, classifyTheme } from '@/lib/themes';
import { albumRating } from '@/lib/album-ratings';
import { albumLanguage, LANG_COOKIE, DEFAULT_LANG, isSupportedLang } from '@/lib/languages';
import { LangProvider } from '@/lib/useLang';
import MediaRow, { TileData } from '@/components/MediaRow';
import LanguageHome from '@/components/LanguageHome';

// Dynamic (not ISR): we read the jv_lang cookie ON THE SERVER so the first render
// is already in the selected language — no flash of the English Home before the
// per-language Home appears. Catalog HTML is served cf-cache-status: DYNAMIC
// anyway, so this doesn't change the user-facing caching.
export const dynamic = 'force-dynamic';

// Home sub-categories: the 12 worship THEMES, plus a final catch-all that always
// appears LAST. Every album in the catalog is attached to exactly one of these
// 13 — or to "Christmas" (the seasonal 14th), which is excluded from the Home
// feed entirely (personaRows drops Christmas albums by default).
const FAMILY_POPULAR = { key: 'family-popular', label: 'Family-Friendly Popular Music' };

// Albums sorted into the worship-theme rows: the Inspire personas (Gabriel and
// Melody route to the catch-all, like every other non-themed album).
const THEMED_EXCLUDE = new Set(['gabriel-inspire', 'melody-inspire']);

// Children's Music (Party Giggles / Tiny Tiggles) has its own category and is
// never shown on Home.
const CHILDREN_CATEGORIES = new Set(['party-giggles', 'tiny-tiggles']);

// Flagship album pinned as the very first tile on the Home page — matches the
// JubiLujah.com brand.
const FEATURED_ALBUM_CODE = 'JEIM1069EN';

export default function HomePage() {
  const buckets: Record<string, TileData[]> = {};
  for (const t of THEMES) buckets[t.key] = [];
  buckets[FAMILY_POPULAR.key] = [];

  const tile = (al: { code: string; title: string; href: string; cover?: string | null; status: 'ready' | 'studio'; trackCount: number }, artistName: string): TileData => ({
    code: al.code,
    title: al.title,
    href: al.href,
    image: al.cover || null,
    status: al.status,
    trackCount: al.trackCount,
    artistName,
  });

  // personaRows() spans the ENTIRE collection (every category/persona) and
  // already excludes the seasonal Christmas albums (the 14th sub-category).
  const rows = personaRows();
  const placed = new Set<string>();

  // 1) Curated worship-theme rows: Inspire personas' READY, cover-published
  //    albums, each sorted into exactly one of the 12 themes by title.
  for (const r of rows) {
    if (r.category !== 'inspire' || !isPersona(r.slug) || THEMED_EXCLUDE.has(r.slug)) continue;
    for (const al of r.albums) {
      if (al.status !== 'ready' || !hasCover(al.code)) continue;
      buckets[classifyTheme(al.title)].push(tile(al, r.name));
      placed.add(al.code);
    }
  }

  // 2) Catch-all: every remaining album lands in "Family-Friendly Popular Music"
  //    — under the SAME business rules as the theme rows (READY + a published
  //    cover). Children's Music is excluded (it has its own category).
  for (const r of rows) {
    if (CHILDREN_CATEGORIES.has(r.category)) continue;
    for (const al of r.albums) {
      if (placed.has(al.code)) continue;
      if (al.status !== 'ready' || !hasCover(al.code)) continue;
      buckets[FAMILY_POPULAR.key].push(tile(al, r.name));
      placed.add(al.code);
    }
  }

  // Order every row by album composite rating, highest first.
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => albumRating(b.code) - albumRating(a.code));
  }

  // Pin the flagship "JubiLujah" album as the very first tile of the first row.
  for (const key of Object.keys(buckets)) {
    const i = buckets[key].findIndex((t) => t.code === FEATURED_ALBUM_CODE);
    if (i !== -1) {
      const [t] = buckets[key].splice(i, 1);
      buckets[THEMES[0].key].unshift(t);
      break;
    }
  }

  // Non-English albums (by code suffix), for the per-language Home view. Empty
  // while the catalog is all-English; populates as …<XX> albums are published.
  // Scope (for now): INSPIRE FAMILY personas only — translated albums from other
  // personas (e.g. the Romanian children's persona) are intentionally excluded
  // here, matching the API which also drops non-family artists from its catalog.
  // Includes STUDIO translations too (not just ready): the privileged tier
  // (admin/executive/reviewer) sees in-production language albums on the
  // per-language Home so they can review what's being worked on; LanguageHome
  // hides them from ordinary viewers.
  const otherLang: (TileData & { lang: string })[] = [];
  for (const r of rows) {
    if (r.category !== 'inspire') continue; // Inspire Family translations only
    for (const al of r.albums) {
      const lang = albumLanguage(al.code);
      if (lang !== 'en' && lang !== 'other') {
        otherLang.push({ ...tile(al, r.name), lang });
      }
    }
  }

  // Server-resolved language (from the jv_lang cookie) seeds LangProvider so the
  // whole Home subtree — LanguageHome + every MediaRow — renders in the selected
  // language on the first paint, with no English flash.
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang = cookieLang && isSupportedLang(cookieLang) ? cookieLang : DEFAULT_LANG;

  return (
    <LangProvider value={lang}>
      <LanguageHome otherAlbums={otherLang}>
        <div className="nf-rows">
          {THEMES.filter((t) => buckets[t.key].length > 0).map((t) => (
            <MediaRow key={t.key} title={t.label} items={buckets[t.key]} />
          ))}
          {/* Always last: the Family-Friendly Popular Music catch-all. */}
          {buckets[FAMILY_POPULAR.key].length > 0 && (
            <MediaRow key={FAMILY_POPULAR.key} title={FAMILY_POPULAR.label} items={buckets[FAMILY_POPULAR.key]} />
          )}
        </div>
      </LanguageHome>
    </LangProvider>
  );
}
