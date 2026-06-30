import type { Metadata } from 'next';
import { Open_Sans, Orbitron } from 'next/font/google';
import './globals.css';

// Open Sans — the JubileeInspire typeface, used on the auth pages for a matching
// look. Exposed as a CSS variable so only the auth screens opt into it.
const openSans = Open_Sans({ subsets: ['latin'], weight: ['300', '400', '600', '700', '800'], variable: '--font-open-sans', display: 'swap' });

// Orbitron — the JubileeVerse logo wordmark typeface, used by the site header.
const orbitron = Orbitron({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-orbitron', display: 'swap' });
import { cookies } from 'next/headers';
import { AuthProvider } from '@/components/AuthProvider';
import Header from '@/components/Header';
import { getArtist } from '@/lib/manifest';
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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'JubiLujah.com — Feel the Spirit Move',
    template: '%s — JubiLujah.com',
  },
  description:
    'JubiLujah.com — music that celebrates, restores, and resounds. The Inspire Family, Children Music, Faith-Based Believers, General Audiences, and Jubilee Prayers.',
  openGraph: {
    title: 'JubiLujah.com — Feel the Spirit Move',
    description: 'Music that celebrates, restores, and resounds.',
    url: SITE_URL,
    siteName: 'JubiLujah.com',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Fallback target for the "Music" nav link when nothing is playing yet:
  // the first album of Jubilee Inspire (the flagship Inspire Family persona).
  const firstInspire = getArtist('jubilee-inspire')?.albums?.[0]?.code;
  const defaultMusicHref = firstInspire ? `/album?c=${firstInspire}` : '/inspire';

  // Resolve the chosen UI language from the jv_lang cookie ON THE SERVER so the
  // whole site (chrome + content) renders in that language on the first paint —
  // no English flash. Reading a cookie makes the tree render per-request.
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang = cookieLang && isSupportedLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const dir = isRtlLang(lang) ? 'rtl' : 'ltr';

  return (
    <html lang={lang} dir={dir} className={`${openSans.variable} ${orbitron.variable}`}>
      <body>
        <LangProvider value={lang}>
          <AuthProvider>
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
          </AuthProvider>
        </LangProvider>
      </body>
    </html>
  );
}
