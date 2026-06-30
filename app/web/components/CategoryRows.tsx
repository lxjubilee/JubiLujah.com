import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from './MediaRow';

// Inspire-Family-style layout: one MediaRow (album grid) per artist in the given
// categories, richest artist first. `extraSlugs` pulls in specific artists that
// live in another category (e.g. Melody Inspire on Family Friendly).
export default function CategoryRows({
  categoryKeys,
  extraSlugs = [],
  emptyText = 'Albums coming soon.',
}: {
  categoryKeys: string[];
  extraSlugs?: string[];
  emptyText?: string;
}) {
  const seen = new Set<string>();
  const rows = personaRows()
    .filter((r) => (categoryKeys.includes(r.category) || extraSlugs.includes(r.slug)) && r.albums.length > 0)
    .filter((r) => (seen.has(r.slug) ? false : (seen.add(r.slug), true)))
    .sort((a, b) => b.albums.length - a.albums.length);

  if (!rows.length) {
    return (
      <div className="nf-rows">
        <div className="nf-billboard"><p>{emptyText}</p></div>
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
