import { NextResponse } from 'next/server';
import { getSeasonPlaylist } from '@/lib/seasonPlaylists';

// The songs of one "For Your Season" playlist, for the Play button on its card.
//
// A route rather than props on the /playlists page: twelve playlists of 36 songs
// is 432 rows, and shipping all of them in the page's HTML so that at most one
// playlist gets played would make the page ~100 KB heavier for everybody.
//
// Deliberately NOT under /api — next.config.mjs rewrites /api/* to the Express
// backend, and this is served by Next from the playlist files on disk.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const pl = getSeasonPlaylist(params.id);
  if (!pl) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ id: pl.id, title: pl.title, songs: pl.songs });
}
