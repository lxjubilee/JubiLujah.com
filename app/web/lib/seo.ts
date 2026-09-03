// ============================================================================
//  SEO — the canonical origin, and the structured data that describes us.
// ============================================================================
//
// WHAT WAS MISSING, AND WHY EACH PIECE IS HERE.
//
// Audited 2026-09-02 against the running site. The page-level basics were in
// good shape — every route had a real <title> and a real description, <html
// lang>/dir tracked the chosen language, and all 277 images on the home page
// carried alt text. Four things were absent entirely:
//
//   1. CANONICAL URLs. The single most damaging omission, because this site is
//      reachable on FOUR hostnames serving byte-identical content —
//      jubileepraise.com, www.jubileepraise.com, jubilujah.com and
//      www.jubilujah.com are all in the JubileePraise tenant's `hosts` list.
//      With no <link rel="canonical">, a search engine treats those as four
//      copies and splits the ranking signals between them. Founder's call
//      (2026-09-02): www.jubileepraise.com is the canonical property.
//   2. og:image / twitter:image — every share of every page rendered as a bare
//      text card, on a catalogue whose whole product is 163 MB of cover art.
//   3. Structured data — not one ld+json block anywhere, on a music catalogue
//      that is *made* of the things schema.org has vocabulary for.
//   4. Sitemap coverage of the ~390 long-form articles.
//
// ---------------------------------------------------------------------------
//  THE ORIGIN, AND WHY THE DEFAULT IS PRODUCTION RATHER THAN LOCALHOST
// ---------------------------------------------------------------------------
//
// This used to read `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'`
// in three separate files. That default is a trap, and it has already fired
// once: `robots.ts` is STATICALLY PRERENDERED, so a build with the variable
// unset bakes the fallback into the file, and production shipped
// `Sitemap: http://localhost:3000/sitemap.xml` — an address no crawler can
// reach. It is written up in PUBLISH.md ("FIXED 2026-08-28"), where the fix is
// to remember `NEXT_PUBLIC_SITE_URL=…` on the build command line. Remembering
// is not a fix; the next person to build without it ships the same bug.
//
// The variable is ALSO not where it looks like it is: `app/.env` sets it, but
// Next reads env from `app/web/`, so `app/.env` has never had any effect on a
// build. Only the fallback has.
//
// So the fallback is now the correct production origin. A forgotten variable
// now produces the right answer instead of a silent one; the variable is left
// as an override for anyone who genuinely wants a different origin (a preview
// deploy, or localhost in robots.txt while developing).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.jubileepraise.com')
  .replace(/\/$/, '');

/** Absolute URL for `path` on the canonical origin. `path` starts with "/". */
export function absUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * The `alternates` block for a page's Metadata.
 *
 * RELATIVE ON PURPOSE. Next resolves a relative canonical against the request's
 * `metadataBase`, which app/layout.tsx sets per TENANT — so goPartyGiggles
 * canonicalises to gopartygiggles.com and JubileePraise to SITE_URL, from this
 * one call. Writing an absolute URL here would canonicalise every tenant's
 * pages to JubileePraise, which is the opposite of what a canonical is for:
 * it would ask Google to drop the other properties from the index entirely.
 */
export function canonical(path: string) {
  return { canonical: path.startsWith('/') ? path : `/${path}` };
}

/**
 * The site-wide share image. 1091×1086 — square, which is why the Twitter card
 * type stays `summary` rather than `summary_large_image`: nearly every image
 * this site can offer a crawler is square (album covers are 1:1), and
 * `summary_large_image` centre-crops to 2:1, which would slice the top and
 * bottom off every cover. A correct small card beats a mangled big one.
 */
export const DEFAULT_OG_IMAGE = '/images/JubileeLogo.png';

// ---------------------------------------------------------------------------
//  STRUCTURED DATA
// ---------------------------------------------------------------------------
// Plain objects, serialised by <JsonLd> (components/JsonLd.tsx). Kept as data
// rather than strings so TypeScript catches a malformed graph and so the shapes
// can be unit-read; @type strings are schema.org vocabulary.

type Ld = Record<string, unknown>;

/** The publisher. Referenced by @id from the other blocks so the graph joins up. */
export function organizationLd(name: string, description: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name,
    url: SITE_URL,
    description,
    logo: { '@type': 'ImageObject', url: absUrl(DEFAULT_OG_IMAGE), width: 1091, height: 1086 },
  };
}

/**
 * The site itself, plus the search box.
 *
 * `potentialAction` is what can earn a sitelinks search box in the result page.
 * The target must be a real, working URL template — /search?q= is exactly the
 * route the header's search form already submits to, so this describes
 * behaviour that exists rather than advertising a feature that does not.
 */
export function webSiteLd(name: string): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** An album. `tracks` are names only — we do not publish per-track URLs. */
export function musicAlbumLd(a: {
  code: string; title: string; artistName: string; artistSlug: string;
  image?: string | null; trackNames?: string[]; genres?: string[];
}): Ld {
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicAlbum',
    '@id': absUrl(`/album?c=${a.code}`),
    name: a.title,
    url: absUrl(`/album?c=${a.code}`),
    byArtist: { '@type': 'MusicGroup', name: a.artistName, url: absUrl(`/artist/${a.artistSlug}`) },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
  if (a.image) ld.image = a.image;
  if (a.genres?.length) ld.genre = a.genres;
  if (a.trackNames?.length) {
    ld.numTracks = a.trackNames.length;
    ld.track = a.trackNames.map((name, i) => ({
      '@type': 'MusicRecording', position: i + 1, name,
    }));
  }
  return ld;
}

/** An artist / persona. */
export function musicGroupLd(a: {
  slug: string; name: string; description?: string; image?: string | null; albumCount?: number;
}): Ld {
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    '@id': absUrl(`/artist/${a.slug}`),
    name: a.name,
    url: absUrl(`/artist/${a.slug}`),
  };
  if (a.description) ld.description = a.description;
  if (a.image) ld.image = a.image;
  return ld;
}

/**
 * A long-form editorial article (Learn Hebrew, Hebraic Christianity, Backstage).
 *
 * NOTE ON DATES. `datePublished`/`dateModified` are emitted only when a real
 * date is passed, and the article corpora do not carry one — LearnHebrewArticle
 * and HebraicArticle have `order`, not a timestamp. They are therefore absent
 * rather than filled in with the build date, which would tell every crawler
 * that 390 articles were written the day the site was last deployed and rewrite
 * that claim on every deploy. An absent date costs a rich-result field; a
 * fabricated one is a lie that compounds.
 */
export function articleLd(a: {
  path: string; title: string; description?: string; image?: string | null;
  published?: string | null; modified?: string | null; section?: string;
  author?: string;
}): Ld {
  const ld: Ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': absUrl(a.path),
    headline: a.title,
    url: absUrl(a.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absUrl(a.path) },
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
  if (a.description) ld.description = a.description;
  if (a.image) ld.image = a.image;
  if (a.author) ld.author = { '@type': 'Person', name: a.author };
  if (a.published) ld.datePublished = a.published;
  if (a.modified || a.published) ld.dateModified = a.modified || a.published;
  if (a.section) ld.articleSection = a.section;
  return ld;
}

/** Trail for the result-page breadcrumb line. `trail` excludes the site root. */
export function breadcrumbLd(trail: { name: string; path: string }[]): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...trail].map((c, i) => ({
      '@type': 'ListItem', position: i + 1, name: c.name, item: absUrl(c.path),
    })),
  };
}
