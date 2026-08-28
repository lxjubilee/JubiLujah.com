import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AlbumDetail } from '@/components/torahsings/album/AlbumDetail';
import { CatalogAlbumDetail, type MiniAlbum } from '@/components/torahsings/album/CatalogAlbumDetail';
import type { CatalogAlbum } from '@/lib/torahsings/angels';
import { allAlbumSlugs, getAlbum } from '@/lib/torahsings/content';
import { allCatalogCodes, catalogCategoryOf, getCatalogAlbum } from '@/lib/torahsings/catalog';
import { MODES, derive, noteLine } from '@/lib/torahsings/derivation';

/** Strip a catalog album down to the fields the side-column lists render. */
function toMini(a: CatalogAlbum): MiniAlbum {
  return { code: a.code, title: a.title, book: a.book, art: a.art ?? null, hue: a.hue, glyph: a.glyph ?? null };
}

export const revalidate = 3600;

type Params = { id: string };

export function generateStaticParams() {
  // Two album systems share this route: curated "content" albums (by slug) and
  // the larger "angels" catalog (by code). Both are pre-rendered here.
  return [...allAlbumSlugs(), ...allCatalogCodes()].map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = params;

  const content = getAlbum(id);
  if (content) {
    return {
      title: content.title,
      description: content.oneLiner,
      openGraph: { title: `${content.title} · Torah Sings`, description: content.oneLiner },
    };
  }

  const catalog = getCatalogAlbum(id);
  if (catalog) {
    const desc = `${catalog.book} · sung by the Angels`;
    return {
      title: catalog.title,
      description: desc,
      openGraph: { title: `${catalog.title} · Torah Sings`, description: desc },
    };
  }

  return { title: 'Album not found' };
}

export default async function AlbumPage({ params }: { params: Params }) {
  const { id } = params;

  // Curated content album (has a full derivation / article / lyrics).
  const content = getAlbum(id);
  if (content) {
    // The derivation is computed here, on the server, from the album's source
    // phrase. The table below is a rendering of this — not a transcription of it.
    const rows = derive(content.source.hebrew, content.mode);
    return (
      <AlbumDetail
        album={content}
        rows={rows}
        modeLabel={MODES[content.mode].label}
        noteLine={noteLine(rows)}
      />
    );
  }

  // Otherwise a catalog ("angels") album, keyed by its code.
  const catalog = getCatalogAlbum(id);
  if (catalog) {
    const category = catalogCategoryOf(id);
    const library = (category?.albums ?? []).map(toMini);
    const more = (category?.albums ?? [])
      .filter((a) => a.book === catalog.book && a.code !== catalog.code)
      .map(toMini);
    return (
      <CatalogAlbumDetail
        album={catalog}
        categoryTitle={category?.title}
        library={library}
        more={more}
      />
    );
  }

  notFound();
}
