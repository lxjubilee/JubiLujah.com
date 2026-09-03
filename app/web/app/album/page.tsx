import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlbumByCode, getArtist } from '@/lib/manifest';
import { coverFor } from '@/lib/covers';
import { supportMapFor } from '@/lib/support';
import { avatarKey } from '@/lib/personas';
import { similarAlbums } from '@/lib/musicTypes';
import { canonical, musicAlbumLd, breadcrumbLd } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
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
  // An unknown code is not a page — say so, rather than leaving a thin
  // "Album not found" body indexable under the site's title template.
  if (!album) return { title: 'Album not found', robots: { index: false, follow: false } };
  const cover = coverFor(album.code, album.path);
  const description = `${album.title} by ${album.artistName}. ${album.trackCount} tracks · ${album.status === 'ready' ? 'Ready to play' : 'In the studio'}.`;
  return {
    title: `${album.title} — ${album.artistName}`,
    description,
    /* Canonical on the ?c= form. The route also answers to the legacy ?code=
       parameter (see albumCode above), so without this every album is reachable
       at two URLs and reads as duplicated. Both now point at the ?c= one. */
    alternates: canonical(`/album?c=${album.code}`),
    openGraph: {
      title: `${album.title} — ${album.artistName}`,
      description,
      type: 'music.album',
      url: `/album?c=${album.code}`,
      ...(cover ? { images: [{ url: cover, alt: `${album.title} cover art` }] } : {}),
    },
    ...(cover ? { twitter: { card: 'summary' as const, images: [cover] } } : {}),
  };
}

// Hero (x-hero) background: a wide banner from /public/images/hero banner/,
// chosen per persona (e.g. "zariah-inspire" -> Slide-Zariah.webp). The available
// banners are detected from the folder at startup, keyed by the persona's first
// name (the avatarKey), so dropping a new `Slide-<Name>.<ext>` in there wires it
// up automatically. The match is extension-agnostic (webp/jpg/png/avif), so
// swapping image formats needs no code edit. A persona with no matching file
// falls back to the default Inspire banner. A couple of slides are filed under a
// different base name than the avatarKey (Jubilee -> Slide-Inspire, Eliana ->
// Slide-Elina); HERO_ALIAS bridges those.
const HERO_DIR = path.join(process.cwd(), 'public', 'images', 'hero banner');
const HERO_BANNERS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  try {
    for (const f of fs.readdirSync(HERO_DIR)) {
      const match = /^slide-(.+)\.(?:webp|jpe?g|png|avif)$/i.exec(f);
      if (match) m.set(match[1].toLowerCase(), f);
    }
  } catch {
    /* folder missing — every persona falls back to the default below */
  }
  return m;
})();
const HERO_ALIAS: Record<string, string> = { jubilee: 'inspire', eliana: 'elina' };
function heroImage(slug: string): string {
  const key = avatarKey(slug);
  const file =
    HERO_BANNERS.get(key) ||
    HERO_BANNERS.get(HERO_ALIAS[key]) ||
    HERO_BANNERS.get('inspire') ||
    'Slide-Inspire.webp';
  return `/images/hero%20banner/${encodeURIComponent(file)}`;
}

export default function AlbumPage({ searchParams }: { searchParams: { c?: string; code?: string } }) {
  const code = albumCode(searchParams);
  const album = code ? getAlbumByCode(code) : null;
  if (!album) notFound();

  const artist = getArtist(album.artistSlug);
  const artistAlbums = artist?.albums || [];

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

  // The wide 16:9 band above the song list, when the album has one on the CDN.
  // Resolved for every album the rail can switch to, not just this one: the
  // component swaps albums in place without navigating, so a map built for the
  // requested album alone would show the band on arrival and never again.
  const support = supportMapFor([album.code, ...artistAlbums.map((a) => a.code)]);

  // THE HERO IS RENDERED BY AlbumApp, not here, and that is a deliberate move.
  // Its backdrop is now the album's own supporting image when one exists, and
  // AlbumApp switches albums IN PLACE without navigating — so a hero rendered at
  // this level would keep showing the first album's picture for the rest of the
  // visit. The persona banner below is the fallback it falls back TO.
  return (
    <div className="album-exec">
      {/* MusicAlbum + its trail. The track names are the ones already rendered
          below; publishing them here is what lets a result show the album as a
          record with contents rather than as an untyped page. */}
      <JsonLd
        data={[
          musicAlbumLd({
            code: album.code,
            title: album.title,
            artistName: album.artistName,
            artistSlug: album.artistSlug,
            image: coverFor(album.code, album.path) || null,
            trackNames: album.tracks.map((t) => t.title),
          }),
          breadcrumbLd([
            { name: album.artistName, path: `/artist/${album.artistSlug}` },
            { name: album.title, path: `/album?c=${album.code}` },
          ]),
        ]}
      />
      <AlbumApp
        artist={album.artistName}
        artistRole={artist?.role || 'Inspire Family'}
        heroFallback={heroImage(album.artistSlug)}
        albums={albums}
        initial={initial}
        similar={similar}
        support={support}
      />
    </div>
  );
}
