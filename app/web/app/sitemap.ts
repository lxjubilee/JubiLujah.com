import type { MetadataRoute } from 'next';
import { listArtists, allAlbumCodes } from '@/lib/manifest';
import { backstageSlugs } from '@/lib/backstage';
import { allLearnHebrewSlugs } from '@/lib/torahsings/learn-hebrew';
import { allHebraicSlugs } from '@/lib/torahsings/hebraic';
import { SITE_URL } from '@/lib/seo';

// The origin comes from lib/seo now, so robots.txt, the canonical tags and this
// file cannot disagree — they used to repeat the same
// `process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'` expression in
// three places, and a prerendered robots.txt once shipped the localhost half of
// it to production while this file (dynamic) emitted the real host.
const SITE = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = [
    '', '/inspire', '/children', '/christmas', '/faith-based', '/general', '/music-type',
    '/prayers', '/playlists', '/backstage', '/learn-hebrew', '/hebraic-christianity',
    '/privacy', '/terms',
  ].map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.8 }));

  // Backstage articles — long-form editorial, worth indexing individually.
  const backstage = backstageSlugs().map((slug) => ({
    url: `${SITE}/backstage/${slug}`, changeFrequency: 'monthly' as const, priority: 0.6,
  }));

  /* THE ~390 ARTICLES THAT WERE NEVER LISTED HERE. Learn Hebrew (187) and
     Hebraic Christianity (197) are the largest body of original long-form text
     on the site and the most likely to earn search traffic on their own — they
     answer questions people actually type. They were absent from this file for
     a reason that has now been removed: until 2026-09-02 every one of them
     returned HTTP 500 (`useAudio must be used inside <AudioProvider>`), so
     submitting them would have handed a crawler 390 server errors. They render
     now, so they belong in the index. */
  const learnHebrew = allLearnHebrewSlugs().map((slug) => ({
    url: `${SITE}/learn-hebrew/${slug}`, changeFrequency: 'monthly' as const, priority: 0.7,
  }));
  const hebraic = allHebraicSlugs().map((slug) => ({
    url: `${SITE}/hebraic-christianity/${slug}`, changeFrequency: 'monthly' as const, priority: 0.7,
  }));

  const artists = listArtists().map((a) => ({
    url: `${SITE}/artist/${a.slug}`, changeFrequency: 'weekly' as const, priority: 0.6,
  }));

  // Cap album URLs to keep the sitemap lean; the full catalog is large.
  const albums = allAlbumCodes(2000).map((code) => ({
    url: `${SITE}/album?c=${code}`, changeFrequency: 'monthly' as const, priority: 0.5,
  }));

  return [...staticRoutes, ...backstage, ...learnHebrew, ...hebraic, ...artists, ...albums];
}
