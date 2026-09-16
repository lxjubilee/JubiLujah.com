import { NextResponse } from 'next/server';
import { getAlbumByCode } from '@/lib/manifest';
import { albumDescription } from '@/lib/albumDescriptions';

// GET /now-playing/about?c=<CODE>  ->  { code, title, description }
//
// The Now Playing page shows the album's written sentence under its cover. The
// page is a client view of the footer player, and the descriptions stay on the
// server (lib/albumDescriptions.ts), so it asks here. Not under /api: production
// nginx sends every /api/* request to the Express backend.

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const code = new URL(request.url).searchParams.get('c') || '';
  const album = /^[A-Za-z0-9]{4,20}$/.test(code) ? getAlbumByCode(code) : null;
  if (!album) return NextResponse.json({ error: 'Unknown album' }, { status: 404 });
  return NextResponse.json(
    {
      code: album.code,
      title: album.title,
      description: albumDescription(album.code, album.title, album.artistName, album.trackCount, album.tracks[0]?.title),
    },
    { headers: { 'cache-control': 'public, max-age=300' } },
  );
}
