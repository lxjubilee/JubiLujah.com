import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SeasonPlaylistView from '@/components/SeasonPlaylistView';
import { getSeasonPlaylist } from '@/lib/seasonPlaylists';

// One "For Your Season" playlist: its banner, its description and its 36 songs.
// Browsable by anyone; playing needs an account (PlaybackGate, site-wide).
//
// Dynamic, not prerendered: every slot resolves through the tenant-scoped
// catalogue, and the tenant is the request's host.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const pl = getSeasonPlaylist(params.id);
  if (!pl) return { title: 'Playlist not found' };
  return {
    title: `${pl.title} | Playlist`,
    description: pl.description,
    openGraph: { title: pl.title, description: pl.description, images: pl.image ? [pl.image] : undefined },
  };
}

export default function SeasonPlaylistPage({ params }: { params: { id: string } }) {
  const pl = getSeasonPlaylist(params.id);
  if (!pl) notFound();
  return <SeasonPlaylistView playlist={pl} />;
}
