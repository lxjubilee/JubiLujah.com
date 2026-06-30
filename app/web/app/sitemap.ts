import type { MetadataRoute } from 'next';
import { listArtists, allAlbumCodes } from '@/lib/manifest';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/inspire', '/children', '/faith-based', '/general', '/prayers', '/playlists', '/privacy', '/terms']
    .map((p) => ({ url: `${SITE}${p}`, changeFrequency: 'weekly' as const, priority: p === '' ? 1 : 0.8 }));

  const artists = listArtists().map((a) => ({
    url: `${SITE}/artist/${a.slug}`, changeFrequency: 'weekly' as const, priority: 0.6,
  }));

  // Cap album URLs to keep the sitemap lean; the full catalog is large.
  const albums = allAlbumCodes(2000).map((code) => ({
    url: `${SITE}/album?c=${code}`, changeFrequency: 'monthly' as const, priority: 0.5,
  }));

  return [...staticRoutes, ...artists, ...albums];
}
