import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { albumsForType } from '@/lib/musicTypes';
import { hasCover } from '@/lib/covers';
import MediaRow, { type TileData } from '@/components/MediaRow';

// Dynamic so the translated chrome (Header/Footer) renders in the cookie's
// language; the catalog content itself is language-agnostic.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { type: string } }): Metadata {
  const r = albumsForType(params.type);
  if (!r) return { title: 'Music Type' };
  return {
    title: `${r.type} Music`,
    description: `${r.type} albums on JubiLujah — every album whose primary music style is ${r.type}.`,
  };
}

export default function MusicTypeDetailPage({ params }: { params: { type: string } }) {
  const r = albumsForType(params.type);
  if (!r) notFound();

  const items: TileData[] = r.albums.map((a) => ({
    code: a.code,
    title: a.title,
    href: a.href,
    image: a.cover || null,
    status: a.status,
    trackCount: a.trackCount,
    artistName: a.artistName,
    hasCover: hasCover(a.code),
  }));

  return (
    <section className="standard">
      <div className="container">
        <Link href="/music-type" className="pl-link">← All music types</Link>
        <div className="eyebrow" style={{ color: 'var(--accent-gold)', marginTop: 12 }}>Music Type</div>
        <h1 style={{ marginBottom: 4 }}>{r.type}</h1>
      </div>
      <MediaRow title={`${r.type} albums`} items={items} requireCover />
    </section>
  );
}
