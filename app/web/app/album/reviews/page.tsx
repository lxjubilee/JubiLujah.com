import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlbumByCode } from '@/lib/manifest';
import { coverFor } from '@/lib/covers';
import ReviewsBrowser, { type AlbumRef, type SongRef } from '@/components/ReviewsBrowser';

// Dedicated Ratings & Reviews page for an album (§7). URL: /album/reviews?code=XXX
export const revalidate = 3600; // ISR — the shell is static; reviews load client-side.

export function generateMetadata({ searchParams }: { searchParams: { code?: string } }): Metadata {
  const album = searchParams.code ? getAlbumByCode(searchParams.code) : null;
  if (!album) return { title: 'Reviews — album not found' };
  return {
    title: `Ratings & Reviews — ${album.title}`,
    description: `Community ratings and reviews for ${album.title} by ${album.artistName}.`,
  };
}

export default function AlbumReviewsPage({ searchParams }: { searchParams: { code?: string } }) {
  const album = searchParams.code ? getAlbumByCode(searchParams.code) : null;
  if (!album) notFound();

  const albumRef: AlbumRef = {
    id: album.id,
    code: album.code,
    title: album.title,
    artistName: album.artistName,
    artistSlug: album.artistSlug,
    cover: coverFor(album.code, album.path),
  };
  const songs: SongRef[] = album.tracks.map((t) => ({ id: t.id, n: t.n, title: t.title }));

  return (
    <div className="rv-page-wrap">
      <ReviewsBrowser album={albumRef} songs={songs} />
    </div>
  );
}
