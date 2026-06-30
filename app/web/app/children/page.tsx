import type { Metadata } from 'next';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from '@/components/MediaRow';

export const revalidate = 3600; // ISR — refresh hourly

export const metadata: Metadata = {
  title: 'Children Music',
  description: 'Party Giggles (ages 6–13) and Tiny Tiggles (ages 3–5) — dance parties, lullabies, and stable stories.',
};

// Two labels, each its own section. Order is fixed: Party Giggles, then Tiny Tiggles.
const SECTIONS = [
  { key: 'party-giggles', label: 'Party Giggles (Ages 6+)' },
  { key: 'tiny-tiggles', label: 'Tiny Tiggles (Ages 3+)' },
];

export default function ChildrenPage() {
  const rows = personaRows();

  return (
    <div className="nf-rows">
      {SECTIONS.map((sec) => {
        // All albums in this label (aggregated across its artists). Studio albums
        // are kept so the count badge can report LIVE/TOTAL and so the privileged
        // tier sees them; MediaRow hides studio from ordinary viewers.
        const items: TileData[] = rows
          .filter((r) => r.category === sec.key)
          .flatMap((r) =>
            r.albums
              .map((al) => ({
                code: al.code,
                title: al.title,
                href: al.href,
                image: al.cover || null,
                status: al.status,
                trackCount: al.trackCount,
                artistName: r.name,
                hasCover: hasCover(al.code),
              }))
          );
        if (!items.length) return null;
        return <MediaRow key={sec.key} title={sec.label} items={items} requireCover />;
      })}
    </div>
  );
}
