import type { Metadata } from 'next';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from '@/components/MediaRow';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Christmas',
  description: 'Christmas music across the Jubilee catalog.',
};

export default function ChristmasPage() {
  // Christmas albums can come from any artist — collect every album tagged
  // `christmas` (in the manifest), grouped by its artist, richest first.
  const rows = personaRows({ includeChristmas: true })
    .map((r) => ({ ...r, albums: r.albums.filter((al) => al.christmas) }))
    .filter((r) => r.albums.length > 0)
    .sort((a, b) => b.albums.length - a.albums.length);

  if (!rows.length) {
    return (
      <div className="nf-rows">
        <div className="nf-billboard"><p>Christmas albums are on the way.</p></div>
      </div>
    );
  }

  return (
    <div className="nf-rows">
      {rows.map((r) => {
        const items: TileData[] = r.albums.map((al) => ({
          code: al.code,
          title: al.title,
          href: al.href,
          image: al.cover || null,
          status: al.status,
          trackCount: al.trackCount,
          artistName: r.name,
          hasCover: hasCover(al.code),
        }));
        return <MediaRow key={r.slug} title={r.name} items={items} requireCover />;
      })}
    </div>
  );
}
