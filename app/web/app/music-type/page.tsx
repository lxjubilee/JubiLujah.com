import type { Metadata } from 'next';
import { musicTypeSections, musicTypeLabel } from '@/lib/musicTypes';
import { albumRating } from '@/lib/album-ratings';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from '@/components/MediaRow';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Music Type',
  description: 'Browse JubiLujah by music type — worship, gospel, praise, contemporary, country and more, grouped by each album’s primary genre.',
};

// Same layout/style as the Home page (nf-rows + MediaRow), except each row is a
// Music Type (primary-genre) sub-category instead of a worship theme. Children's
// Music is excluded (see lib/musicTypes); Christmas is already excluded too.
export default function MusicTypePage() {
  const sections = musicTypeSections();

  return (
    <div className="nf-rows">
      {sections.map((sec) => {
        const items: TileData[] = sec.albums
          .map((a) => ({
            code: a.code,
            title: a.title,
            href: a.href,
            image: a.cover || null,
            status: a.status,
            trackCount: a.trackCount,
            artistName: a.artistName,
            hasCover: hasCover(a.code),
          }))
          .sort((x, y) => albumRating(y.code) - albumRating(x.code));
        if (!items.length) return null;
        return <MediaRow key={sec.slug} title={musicTypeLabel(sec.type)} items={items} requireCover />;
      })}
    </div>
  );
}
