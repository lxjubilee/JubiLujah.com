// ============================================================================
//  TENANTS
// ============================================================================
//
// One Next.js application serves several properties. Which one a request belongs
// to is decided by its Host header and nothing else — there is no per-tenant
// build, no duplicated deployment, and no environment variable to get wrong.
//
// A tenant is a CATALOGUE SOURCE, a scope within it, and a name. JubileePraise.com
// carries the whole shared collection; goPartyGiggles.com and MyTinyTiggles.com
// each carry exactly one children's label out of it. The music, the covers and
// the CDN are shared — only what a visitor is allowed to see changes.
//
// TorahSings.com is the exception that made `catalog` necessary. Its 285
// Bible-book albums are not in catalog-manifest.json at all: they are generated
// from J:/torahsings.com/music into content/torahsings/angels-catalog.ts and
// grouped by canonical division (Torah · Prophets · Writings · Gospels ·
// Letters · Revelation) rather than by artist. Scoping the shared manifest
// could never have produced that, so the tenant names its source instead.
//
// PURE DATA ON PURPOSE. This module imports nothing from `next`, so it is safe in
// a server component, a client component, middleware or a plain node script. The
// request-bound half lives in lib/tenant.ts.

/**
 * Which catalogue a tenant reads.
 *
 * - `manifest` — public/music/catalog-manifest.json, filtered by `categories`.
 * - `angels`   — content/torahsings/angels-catalog.ts, the ANSMX Bible-book tree.
 *
 * A tenant reads exactly one. There is deliberately no "both": the two have
 * different album shapes (artist-keyed vs book-keyed) and merging them at read
 * time would mean inventing an artist for 285 albums that do not have one.
 */
export type CatalogSource = 'manifest' | 'angels';

export type TenantNavItem = {
  href: string;
  /** i18n key, for the nav labels JubileePraise already translates into 40 languages. */
  key?: string;
  /** Literal label, for tenant-specific links that have no translation yet. */
  label?: string;
};

export type Tenant = {
  /** Stable id. Used in logs, the x-tenant header and analytics. */
  key: string;
  /** Hostnames that resolve here. Lower-case, no port — see hostMatches. */
  hosts: string[];
  /** Display name, and the <title> suffix. */
  name: string;
  /** The logo splits into two spans so the second half can take the accent colour. */
  brandLead: string;
  brandTail: string;
  tagline: string;
  description: string;
  /**
   * Which catalogue this tenant reads. Defaults conceptually to `manifest` —
   * it is required rather than optional so that adding a tenant forces the
   * question to be answered rather than inherited by accident.
   */
  catalog: CatalogSource;
  /**
   * Manifest category keys this tenant may show. `null` means the whole
   * catalogue — that is JubileePraise and should stay that way.
   *
   * This is the security-relevant field: every catalogue read is filtered
   * through it, so an album belonging to another tenant is not merely hidden
   * from a listing, it is unreachable by direct code too.
   *
   * 🔴 `null` and `[]` are opposites and the difference is load-bearing. A
   * tenant on the `angels` catalogue takes `[]` — it may see NOTHING of the
   * shared manifest — and emphatically not `null`, which would hand a
   * TorahSings visitor the entire Inspire collection through /album?c=…
   */
  categories: string[] | null;
  nav: TenantNavItem[];
  /** Public logo path under /public. */
  logo: string;
  /** Accent colour for the brand tail, as a CSS colour. */
  accent: string;
};

export const TENANTS: Tenant[] = [
  {
    key: 'jubileepraise',
    // The jubilujah hosts are listed DELIBERATELY. The rebrand deploys to the existing
    // jubilujah.com box, path and domain, so the old hostnames must keep resolving to this
    // tenant until DNS for jubileepraise.com exists. Without them the match falls through to
    // DEFAULT_TENANT — which is this same tenant, so it happens to work, but by accident
    // rather than by intent. Remove them only once the new domain is live and redirecting.
    hosts: [
      'jubileepraise.com', 'www.jubileepraise.com',
      'jubilujah.com', 'www.jubilujah.com',
      'localhost', '127.0.0.1',
    ],
    name: 'JubileePraise.com',
    brandLead: 'Jubilee',
    brandTail: 'Praise',
    tagline: 'Feel the Spirit Move',
    description:
      'JubileePraise.com — music that celebrates, restores, and resounds. The Inspire Family, Children Music, Faith-Based Believers, General Audiences, and Jubilee Prayers.',
    catalog: 'manifest',
    categories: null, // the whole collection
    nav: [
      { href: '/', key: 'nav.home' },
      { href: '/inspire', key: 'nav.inspire' },
      { href: '/children', key: 'nav.children' },
      { href: '/general', key: 'nav.family' },
      { href: '/music-type', key: 'nav.musicType' },
      { href: '/christmas', key: 'nav.christmas' },
      { href: '/playlists', key: 'nav.playlists' },
      { href: '/subscription', key: 'nav.upgrade' },
    ],
    logo: '/images/brand-logo.png',
    accent: '#3DA5FF',
  },
  {
    key: 'partygiggles',
    hosts: ['gopartygiggles.com', 'www.gopartygiggles.com', 'partygiggles.com', 'www.partygiggles.com'],
    name: 'goPartyGiggles.com',
    brandLead: 'goParty',
    brandTail: 'Giggles',
    tagline: 'Big Songs for Big Kids',
    description:
      'goPartyGiggles.com — dance-along, sing-along music for ages 6 and up. Party Giggles from the JubileePraise collection.',
    catalog: 'manifest',
    categories: ['party-giggles'],
    nav: [
      { href: '/', key: 'nav.home' },
      { href: '/music-type', key: 'nav.musicType' },
      { href: '/playlists', key: 'nav.playlists' },
      { href: '/subscription', key: 'nav.upgrade' },
    ],
    logo: '/images/brand-logo.png',
    accent: '#FF3DA5',
  },
  {
    key: 'tinytiggles',
    hosts: ['mytinytiggles.com', 'www.mytinytiggles.com', 'tinytiggles.com', 'www.tinytiggles.com'],
    name: 'MyTinyTiggles.com',
    brandLead: 'MyTiny',
    brandTail: 'Tiggles',
    tagline: 'Little Songs for Little Ones',
    description:
      'MyTinyTiggles.com — gentle songs, lullabies and stable stories for ages 3 to 5. Tiny Tiggles from the JubileePraise collection.',
    catalog: 'manifest',
    categories: ['tiny-tiggles'],
    nav: [
      { href: '/', key: 'nav.home' },
      { href: '/music-type', key: 'nav.musicType' },
      { href: '/playlists', key: 'nav.playlists' },
      { href: '/subscription', key: 'nav.upgrade' },
    ],
    logo: '/images/brand-logo.png',
    accent: '#59C7F5',
  },
  {
    key: 'torahsings',
    hosts: ['torahsings.com', 'www.torahsings.com'],
    name: 'Torah Sings',
    brandLead: 'Torah',
    brandTail: 'Sings',
    tagline: 'The stars sang. The angels sang. Now you can hear it.',
    description:
      'Torah Sings — there are songs hidden inside the Scriptures. Taken symbol by symbol, the Paleo-Hebrew text surfaces melodies that read as sung from the angelic perspective. Not canon — something to consider.',
    // The ANSMX Bible-book tree, NOT the shared manifest.
    catalog: 'angels',
    // Deliberately empty, not null: Torah Sings may see nothing of the shared
    // JubileePraise catalogue. Its own albums come from the angels source.
    categories: [],
    nav: [
      { href: '/', label: 'Torah Sings' },
      { href: '/hebraic-christianity', label: 'Hebraic Christianity' },
      { href: '/learn-hebrew', label: 'Learn Hebrew' },
      { href: '/playlists', key: 'nav.playlists' },
      { href: '/membership', label: 'Membership' },
    ],
    logo: '/images/brand-logo.png',
    accent: '#feca57',
  },
  {
    key: 'singitdone',
    hosts: ['singitdone.com', 'www.singitdone.com'],
    name: 'SingItDone.com',
    brandLead: 'SingIt',
    brandTail: 'Done',
    tagline: 'Sing what He has already said',
    description:
      'SingItDone.com — declaration albums from the Inspire Family. Scripture sung in the first person, as what Yahuah has already spoken and already finished. One declaration per album, one artist on each.',
    catalog: 'manifest',
    // Its own category key, and the reason it is a scope rather than a second
    // catalogue: these albums are built into catalog-manifest.json like any
    // other. Not null (only the default may carry everything) and not [] (that
    // belongs to a tenant reading a different source entirely).
    categories: ['declarations'],
    nav: [
      { href: '/', key: 'nav.home' },
      { href: '/playlists', key: 'nav.playlists' },
      { href: '/subscription', key: 'nav.upgrade' },
    ],
    logo: '/images/brand-logo.png',
    accent: '#8E6FE0',
  },
];

/** JubileePraise is the fallback: an unrecognised Host must not silently show less. */
export const DEFAULT_TENANT = TENANTS[0];

/**
 * Resolve a Host header to a tenant.
 *
 * The port is stripped so `localhost:3000` and a proxied `:8080` both resolve,
 * and matching is case-insensitive because Host casing is not guaranteed.
 * An unknown host falls back to JubileePraise rather than erroring — a
 * misconfigured DNS entry should show the main site, not a stack trace.
 */
export function tenantForHost(host?: string | null): Tenant {
  if (!host) return DEFAULT_TENANT;
  const h = host.toLowerCase().trim().split(':')[0];
  for (const t of TENANTS) if (t.hosts.includes(h)) return t;
  return DEFAULT_TENANT;
}

export function tenantByKey(key?: string | null): Tenant {
  if (!key) return DEFAULT_TENANT;
  return TENANTS.find((t) => t.key === key) || DEFAULT_TENANT;
}

/** True when this tenant may show content from `categoryKey`. */
export function tenantAllowsCategory(t: Tenant, categoryKey?: string | null): boolean {
  if (!t.categories) return true;
  if (!categoryKey) return false;
  return t.categories.includes(categoryKey);
}

/**
 * True when this tenant's music comes from the ANSMX Bible-book catalogue
 * rather than the shared manifest.
 *
 * Read this instead of comparing `key === 'torahsings'` anywhere downstream:
 * the branch belongs to the catalogue source, not to one property's name, and a
 * second Bible-book tenant should not require hunting for string comparisons.
 */
export function usesAngelsCatalog(t: Tenant): boolean {
  return t.catalog === 'angels';
}
