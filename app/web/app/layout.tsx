import type { Metadata } from 'next';
import { Open_Sans, Orbitron, Playfair_Display, Spline_Sans_Mono } from 'next/font/google';
import './globals.css';
// Torah Sings' base sheet. Every rule is scoped under [data-tenant='torahsings']
// (stamped on <html> below), so importing it globally costs the other tenants
// nothing but keeps it in the one stylesheet Next emits.
import './torahsings.css';
// The JubileeInspire rail's stylesheet. Global rather than a CSS module because
// the rail's class names are global (it also styles <body>), and imported here
// rather than mounted from the component because that needs React 19's
// <link precedence> and this app is React 18. See components/InspireRail.tsx.
import './inspire-rail.css';

// Open Sans — the JubileeInspire typeface, used on the auth pages for a matching
// look. Exposed as a CSS variable so only the auth screens opt into it.
const openSans = Open_Sans({ subsets: ['latin'], weight: ['300', '400', '600', '700', '800'], variable: '--font-open-sans', display: 'swap' });

// Orbitron — the JubileeVerse logo wordmark typeface, used by the site header.
const orbitron = Orbitron({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-orbitron', display: 'swap' });

// Torah Sings' two additional faces: Spline Sans Mono for eyebrows and labels,
// Playfair Display for the Hebraic Christianity reading room. Both are declared
// unconditionally — next/font must be called at module scope, not inside a
// branch — but they cost nothing on the other tenants: the variables are only
// attached to <html> for Torah Sings, and an unreferenced CSS variable does not
// download a font.
const splineSansMono = Spline_Sans_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '700'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });
import { cookies } from 'next/headers';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';
import { getArtist, listArtists } from '@/lib/manifest';
import { languagesWithContent } from '@/lib/languageStats';
import { LangProvider } from '@/lib/useLang';
import { LANG_COOKIE, DEFAULT_LANG, isSupportedLang } from '@/lib/languages';
import { isRtlLang } from '@/lib/i18n';
import SiteFooter from '@/components/SiteFooter';
import Particles from '@/components/Particles';
import FooterPlayer from '@/components/FooterPlayer';
import PlaybackGate from '@/components/PlaybackGate';
import UpgradeModal from '@/components/UpgradeModal';
import CoverUploadModal from '@/components/CoverUploadModal';
import TrackManagerModal from '@/components/TrackManagerModal';
import ScrollRestoreGuard from '@/components/ScrollRestoreGuard';
import NavTracker from '@/components/NavTracker';
import { TenantProvider } from '@/components/TenantProvider';
import InspireRail from '@/components/InspireRail';
import TorahSingsShell from '@/components/torahsings/TorahSingsShell';
import { currentTenant } from '@/lib/tenant';
import { usesAngelsCatalog } from '@/lib/tenants';

import { SITE_URL, DEFAULT_OG_IMAGE, canonical, organizationLd, webSiteLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';

// Metadata is per-request now, because the title, the description and the
// canonical URL all belong to whichever property the Host header names. A static
// `metadata` export cannot see the request, so it would have titled every
// goPartyGiggles page "JubileePraise.com".
export async function generateMetadata(): Promise<Metadata> {
  const t = currentTenant();
  const url = t.key === 'jubileepraise' ? SITE_URL : `https://${t.hosts[0]}`;
  return {
    metadataBase: new URL(url),
    title: {
      default: `${t.name} — ${t.tagline}`,
      template: `%s — ${t.name}`,
    },
    description: t.description,
    /* The home page's own canonical. Every other route sets its own (via
       lib/seo `canonical()`); Next does NOT derive one from the path, so a
       route that omits it simply has none. */
    alternates: canonical('/'),
    openGraph: {
      title: `${t.name} — ${t.tagline}`,
      description: t.tagline,
      url,
      siteName: t.name,
      type: 'website',
      /* The site-wide share image, inherited by every page that does not name
         its own (album and artist pages do). Without this the whole site
         shared as a bare text card. */
      images: [{ url: DEFAULT_OG_IMAGE, width: 1091, height: 1086, alt: t.name }],
    },
    twitter: { card: 'summary', images: [DEFAULT_OG_IMAGE] },
    robots: { index: true, follow: true },
    other: { google: 'notranslate' },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = currentTenant();

  // Fallback target for the "Music" nav link when nothing is playing yet.
  //
  // Jubilee Inspire is JubileePraise's flagship and is NOT in a children's tenant's
  // catalogue, so getArtist() correctly returns null there — the scoped manifest
  // does not contain her. Fall back to the tenant's own first album instead of
  // sending a goPartyGiggles visitor to /inspire, which is empty for them.
  const firstInspire = getArtist('jubilee-inspire')?.albums?.[0]?.code;
  const firstOwn = firstInspire ? null : listArtists()[0]?.slug;
  const defaultMusicHref = firstInspire
    ? `/album?c=${firstInspire}`
    : firstOwn ? `/artist/${firstOwn}` : '/';

  // Resolve the chosen UI language from the jv_lang cookie ON THE SERVER so the
  // whole site (chrome + content) renders in that language on the first paint —
  // no English flash. Reading a cookie makes the tree render per-request.
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang = cookieLang && isSupportedLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const dir = isRtlLang(lang) ? 'rtl' : 'ltr';

  // Torah Sings brings its own chrome and its own transport (see
  // components/torahsings/TorahSingsShell). Everything OUTSIDE the branch stays
  // shared — TenantProvider, the language provider and AuthProvider in
  // particular, because a Torah Sings visitor still lands on JubileePraise's
  // /signin, /account and /admin, and those routes need the session context.
  const torahSings = usesAngelsCatalog(tenant);
  const fontVars = torahSings
    ? `${orbitron.variable} ${splineSansMono.variable} ${playfair.variable}`
    : `${openSans.variable} ${orbitron.variable}`;

  return (
    <html
      lang={lang}
      dir={dir}
      translate="no"
      data-tenant={tenant.key}
      className={`notranslate ${fontVars}`}
      /*
       * THE TENANT'S BRAND ACCENT, AS A CSS VARIABLE.
       *
       * app/globals.css used to hard-code #E6AC00 (JubileePraise gold) in 53
       * places, with no tenant scoping at all — so goPartyGiggles and
       * MyTinyTiggles rendered gold too, even though tenants.ts has declared
       * their own accents (#FF3DA5 and #59C7F5) all along. Those rules now read
       * var(--brand-accent) and this is where it comes from.
       *
       * DELIBERATELY NOT CALLED --accent: that name is already taken twice in
       * this app — app/styles/site.css binds it to the JV red #e94560, and
       * footer-player.css rebinds it inside the player. Reusing it would have
       * repainted both.
       *
       * Torah Sings is unaffected either way: its palette lives in
       * torahsings.css, scoped under [data-tenant='torahsings'].
       */
      style={{ '--brand-accent': tenant.accent } as React.CSSProperties}
    >
      <body>
        {/* The site-level graph — publisher identity plus the search box, on
            every page so the two @id nodes the per-page blocks reference are
            always resolvable. Emitted server-side; see components/JsonLd.tsx. */}
        <JsonLd data={[organizationLd(tenant.name, tenant.description), webSiteLd(tenant.name)]} />
        <TenantProvider tenant={tenant}>
        <LangProvider value={lang}>
          <AuthProvider>
            {torahSings ? (
              <TorahSingsShell>{children}</TorahSingsShell>
            ) : (
            <>
            {/*
              * The JubileeInspire rail — the same one kJubilee.com carries, and
              * the way back to the other Inspire properties.
              *
              * JUBILEEPRAISE ONLY, DELIBERATELY. Its rows are Born Again DNA,
              * the JSV Bible, Jubilee News and Bible References; goPartyGiggles
              * and MyTinyTiggles are children's sites, and a rail pointing
              * five-year-olds at a genetics site is not a design decision
              * anybody made. Torah Sings never reaches here at all — it renders
              * through TorahSingsShell in the branch above, with its own chrome.
              */}
            {tenant.key === 'jubileepraise' && <InspireRail />}
            <ScrollRestoreGuard />
            <NavTracker />
            <Particles />
            <Header defaultMusicHref={defaultMusicHref} langWithContent={languagesWithContent()} />
            <main>{children}</main>
            <SiteFooter />
            {/* Mounted once here so playback survives client-side navigation. */}
            <FooterPlayer />
            {/* Gates playback behind sign-in; renders the "sign in to play" prompt. */}
            <PlaybackGate />
            {/* Free-plan daily-limit upgrade prompt (shown when a preview is capped). */}
            <UpgradeModal />
            {/* Admin-only: replace an album cover (uploads to CDN/R2). */}
            <CoverUploadModal />
            {/* Admin-only: manage an album's .mp3 files on the J: drive. */}
            <TrackManagerModal />
            </>
            )}
          </AuthProvider>
        </LangProvider>
        </TenantProvider>
      </body>
    </html>
  );
}
