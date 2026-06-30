import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArtist } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import AlbumCardGrid from '@/components/AlbumCardGrid';

// Dynamic so the translated chrome (Header/Footer) renders in the cookie's
// language; the catalog content itself is language-agnostic.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const artist = getArtist(params.slug);
  if (!artist) return { title: 'Artist not found' };
  return { title: artist.name, description: `${artist.name} — ${artist.role || 'Jubilee artist'}. ${artist.albums?.length || 0} albums.` };
}

export default function ArtistPage({ params }: { params: { slug: string } }) {
  const artist = getArtist(params.slug);
  if (!artist) notFound();
  const ready = artist.albums?.filter((a) => a.status === 'ready').length || 0;

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">{artist.categoryLabel}</div>
          <h1>{artist.name}</h1>
          {artist.role && <p className="lead">{artist.role}</p>}
          <p className="section-sub">{artist.albums?.length || 0} albums · {ready} ready to play</p>
        </div>
      </section>

      <section className="standard">
        <div className="container">
          <AlbumCardGrid
            items={(artist.albums || []).map((al) => ({ code: al.code, title: al.title, status: al.status, hasCover: hasCover(al.code) }))}
            emptyText="No albums available yet."
          />
        </div>
      </section>
    </>
  );
}
