import { cookies } from 'next/headers';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import { isPersona } from '@/lib/personas';
import { THEMES, classifyTheme } from '@/lib/themes';
import { albumRating } from '@/lib/album-ratings';
import { dailyShuffle } from '@/lib/dailyShuffle';
import { albumLanguage, LANG_COOKIE, DEFAULT_LANG, isSupportedLang } from '@/lib/languages';
import { LangProvider } from '@/lib/useLang';
import MediaRow, { TileData } from '@/components/MediaRow';
import LanguageHome from '@/components/LanguageHome';
import FeaturedArtists from '@/components/FeaturedArtists';
import TenantHome from '@/components/TenantHome';
import TorahSingsHome from '@/components/torahsings/TorahSingsHome';
import { currentTenant } from '@/lib/tenant';
import { usesAngelsCatalog } from '@/lib/tenants';

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
// JubileePraise.com brand.
const FEATURED_ALBUM_CODE = 'JEIM1069EN';

export default function HomePage() {
  // A single-catalogue tenant gets its own Home. This page is JubileePraise's: it
  // sorts the collection into worship themes and deliberately drops the
  // children's categories (see CHILDREN_CATEGORIES below), so rendering it for
  // goPartyGiggles would produce an empty page rather than a wrong one.
  const tenant = currentTenant();
  // Order matters. Torah Sings carries `categories: []` — empty, because it may
  // see nothing of the shared manifest — and an empty array is TRUTHY, so this
  // check has to come first or it would fall into TenantHome and render a page
  // with nothing on it.
  if (usesAngelsCatalog(tenant)) return <TorahSingsHome />;
  if (tenant.categories) return <TenantHome />;

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

  // Auto-shuffle each row every 24h — the SAME deterministic day-seeded shuffle
  // the mobile app applies to its auto-ordered sections (lib/dailyShuffle mirrors
  // app/api/src/services/sectionOrder.js). Every album stays visible; only the
  // order changes, advancing at 00:00 UTC and stable all day. Seeded per row key
  // so each theme row gets its own independent daily order. The composite rating
  // provides the deterministic base order the shuffle then permutes.
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => albumRating(b.code) - albumRating(a.code));
    buckets[key] = dailyShuffle(buckets[key], key);
  }

  // Pin the flagship "JubileePraise" album as the very first tile of the first row
  // (applied AFTER the shuffle, so the brand flagship stays first while every
  // other tile reshuffles daily).
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
        {/* The page's one <h1>. The design opens straight into cover rows with
            no visible headline, so this is off-screen (.sr-only) rather than
            absent — thirteen <h2> row titles under no <h1> is a broken outline
            for a crawler and for a screen reader alike. It names the property,
            which is what the page is. */}
        <h1 className="sr-only">{tenant.name} — {tenant.tagline}</h1>
        <div className="nf-rows">
          {THEMES.filter((t) => buckets[t.key].length > 0).map((t) => (
            <MediaRow key={t.key} title={t.label} items={buckets[t.key]} />
          ))}
          {/* The Family-Friendly Popular Music catch-all, then the Featured Artists strip last. */}
          {buckets[FAMILY_POPULAR.key].length > 0 && (
            <MediaRow key={FAMILY_POPULAR.key} title={FAMILY_POPULAR.label} items={buckets[FAMILY_POPULAR.key]} />
          )}
          <FeaturedArtists />
        </div>
      </LanguageHome>
    </LangProvider>
  );
}
