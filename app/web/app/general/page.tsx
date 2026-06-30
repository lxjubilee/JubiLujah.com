import type { Metadata } from 'next';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import MediaRow, { TileData } from '@/components/MediaRow';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Family Friendly',
  description: 'Melody Inspire — family-friendly music for all ages.',
};

// Family Friendly is Melody Inspire's home: it shows ONLY Melody's albums, and
// ALWAYS every one of them (all statuses, including in-studio and seasonal —
// `showAll` bypasses the usual studio gating, and includeChristmas keeps any
// seasonal titles here too).
export default function FamilyFriendlyPage() {
  const melody = personaRows({ includeChristmas: true }).find((r) => r.slug === 'melody-inspire');
  const items: TileData[] = (melody?.albums || []).map((al) => ({
    code: al.code,
    title: al.title,
    href: al.href,
    image: al.cover || null,
    status: al.status,
    trackCount: al.trackCount,
    artistName: melody!.name,
    hasCover: hasCover(al.code),
  }));

  return (
    <div className="nf-rows">
      {items.length > 0 ? (
        <MediaRow title={melody!.name} items={items} showAll requireCover />
      ) : (
        <div className="nf-billboard"><p>Albums coming soon.</p></div>
      )}
    </div>
  );
}
