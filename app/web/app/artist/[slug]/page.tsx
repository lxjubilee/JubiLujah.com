import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getArtist } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import { canonical, musicGroupLd, breadcrumbLd, DEFAULT_OG_IMAGE } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
import AlbumCardGrid from '@/components/AlbumCardGrid';

// Dynamic so the translated chrome (Header/Footer) renders in the cookie's
// language; the catalog content itself is language-agnostic.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const artist = getArtist(params.slug);
  if (!artist) return { title: 'Artist not found', robots: { index: false, follow: false } };
  const description = `${artist.name}, ${artist.role || 'Jubilee artist'}. ${artist.albums?.length || 0} albums.`;
  return {
    title: artist.name,
    description,
    alternates: canonical(`/artist/${params.slug}`),
    /* `images` is restated rather than inherited: Next REPLACES the parent
       openGraph block wholesale when a page declares its own, so omitting it
       here does not fall back to the layout's default — it produces a page with
       no share image at all. Same reason on the two article routes. */
    openGraph: {
      title: artist.name, description, type: 'profile', url: `/artist/${params.slug}`,
      images: [{ url: DEFAULT_OG_IMAGE, width: 1091, height: 1086, alt: artist.name }],
    },
  };
}

export default function ArtistPage({ params }: { params: { slug: string } }) {
  const artist = getArtist(params.slug);
  if (!artist) notFound();
  const ready = artist.albums?.filter((a) => a.status === 'ready').length || 0;

  return (
    <>
      <JsonLd
        data={[
          musicGroupLd({
            slug: params.slug,
            name: artist.name,
            description: artist.role || undefined,
          }),
          breadcrumbLd([{ name: artist.name, path: `/artist/${params.slug}` }]),
        ]}
      />
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
