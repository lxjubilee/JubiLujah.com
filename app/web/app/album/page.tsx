import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getAlbumByCode, getArtist } from '@/lib/manifest';
import { coverFor } from '@/lib/covers';
import { avatarKey } from '@/lib/personas';
import { similarAlbums } from '@/lib/musicTypes';
import AlbumApp, { AlbumLink, CurrentAlbum, SimilarAlbum } from '@/components/AlbumApp';

export const revalidate = 3600; // ISR

// The album is addressed by the short `?c=<CODE>` param (e.g. /album?c=JEIM1071EN).
// The legacy `?code=` is still accepted so older links/bookmarks keep working.
function albumCode(sp: { c?: string; code?: string }): string | null {
  return sp.c || sp.code || null;
}

export function generateMetadata({ searchParams }: { searchParams: { c?: string; code?: string } }): Metadata {
  const code = albumCode(searchParams);
  const album = code ? getAlbumByCode(code) : null;
  if (!album) return { title: 'Album not found' };
  return {
    title: `${album.title} — ${album.artistName}`,
    description: `${album.title} by ${album.artistName}. ${album.trackCount} tracks · ${album.status === 'ready' ? 'Ready to play' : 'In the studio'}.`,
  };
}

// Hero (x-hero) background: a wide banner from /public/images/hero banner/,
// chosen per persona (e.g. "zariah-inspire" -> slide-Zariah.jpg). The available
// banners are detected from the folder at startup, keyed by the persona's first
// name (the avatarKey), so dropping a new `slide-<Name>.jpg` in there wires it
// up automatically — no code edit needed. A persona with no matching file falls
// back to the Jubilee banner.
const HERO_DIR = path.join(process.cwd(), 'public', 'images', 'hero banner');
const HERO_BANNERS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  try {
    for (const f of fs.readdirSync(HERO_DIR)) {
      const match = /^slide-(.+)\.jpg$/i.exec(f);
      if (match) m.set(match[1].toLowerCase(), f);
    }
  } catch {
    /* folder missing — every persona falls back to the default below */
  }
  return m;
})();
function heroImage(slug: string): string {
  const key = avatarKey(slug);
  const file = HERO_BANNERS.get(key) || HERO_BANNERS.get('jubilee') || 'slide-Jubilee.jpg';
  return `/images/hero%20banner/${encodeURIComponent(file)}`;
}

export default function AlbumPage({ searchParams }: { searchParams: { c?: string; code?: string } }) {
  const code = albumCode(searchParams);
  const album = code ? getAlbumByCode(code) : null;
  if (!album) notFound();

  const artist = getArtist(album.artistSlug);
  const artistAlbums = artist?.albums || [];
  const totalTracks = artistAlbums.reduce((n, a) => n + (a.trackCount || 0), 0);
  const readyCount = artistAlbums.filter((a) => a.status === 'ready').length;

  const albums: AlbumLink[] = artistAlbums.map((a) => ({
    code: a.code, title: a.title, cover: `/cover/${a.code}.png`, status: a.status,
  }));

  // "Similar Music": other albums whose PRIMARY genre matches this album's.
  const sim = similarAlbums(album.code, 14);
  const similar: SimilarAlbum[] = sim.albums.map((a) => ({
    code: a.code, title: a.title, cover: a.cover || `/cover/${a.code}.png`, status: a.status, artist: a.artistName,
  }));
  const initial: CurrentAlbum = {
    code: album.code, title: album.title, cover: coverFor(album.code, album.path),
    status: album.status, trackCount: album.trackCount,
    tracks: album.tracks.map((t) => ({ id: t.id, n: t.n, title: t.title, url: t.url })),
  };

  const heroStyle = { ['--persona-img' as string]: `url('${heroImage(album.artistSlug)}')` } as CSSProperties;

  return (
    <div className="album-exec">
      <header className="x-hero" style={heroStyle}>
        <div className="x-container">
          <div className="x-inner">
            <div className="x-eyebrow">{album.categoryLabel} · Persona Executive Summary</div>
            <h1>{album.artistName}<em>&mdash; {artist?.role || 'Inspire Family'} · {artistAlbums.length} albums anchoring the {album.categoryLabel} catalog.</em></h1>
            <p className="x-sub">
              {artistAlbums.length} albums. <strong>{totalTracks.toLocaleString()} tracks.</strong> {artist?.role || 'Inspire Family'} —
              browse the library on the left, press play, and the music keeps going as you move through the site.
            </p>
            <div className="x-meta">
              <div><span className="label">Albums</span><span className="val">{artistAlbums.length}</span></div>
              <div><span className="label">Tracks</span><span className="val">{totalTracks.toLocaleString()}</span></div>
              <div><span className="label">Ready</span><span className="val ok">{readyCount}</span></div>
              <div><span className="label">Studio</span><span className="val accent">{artistAlbums.length - readyCount}</span></div>
            </div>
          </div>
        </div>
      </header>

      <AlbumApp artist={album.artistName} albums={albums} initial={initial} similar={similar} />
    </div>
  );
}
