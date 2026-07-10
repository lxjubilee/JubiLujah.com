import type { Metadata } from 'next';
import { personaRows } from '@/lib/manifest';
import { hasCover } from '@/lib/covers';
import { isPersona, INSPIRE_ORDER } from '@/lib/personas';
import { albumRating } from '@/lib/album-ratings';
import MediaRow, { TileData } from '@/components/MediaRow';

export const revalidate = 3600; // ISR — refresh hourly

export const metadata: Metadata = {
  title: 'Inspire Family',
  description: 'Twelve rated personas singing Christ-centered worship across every culture and craft.',
};

// Persona sections are listed in birth order (INSPIRE_ORDER, shared with the Home
// "Featured Artists" strip). Gabriel Inspire is excluded.
const rank = (slug: string) => {
  const i = INSPIRE_ORDER.indexOf(slug);
  return i === -1 ? INSPIRE_ORDER.length : i;
};

// Flagship album pinned to the front of its persona row so it is the very first
// album on the page — matches the Jubilujah.com brand.
const FEATURED_ALBUM_CODE = 'JEIM1069EN';

export default function InspirePage() {
  const rows = personaRows()
    .filter((r) => r.category === 'inspire' && isPersona(r.slug) && r.albums.length > 0 && INSPIRE_ORDER.includes(r.slug))
    .sort((a, b) => rank(a.slug) - rank(b.slug));

  return (
    <div className="nf-rows">
      {rows.map((r) => {
        // Every persona section is titled "<First> Inspire".
        const name = r.name.trim().endsWith('Inspire') ? r.name.trim() : `${r.name.trim()} Inspire`;
        const items: TileData[] = r.albums.map((al) => ({
          code: al.code,
          title: al.title,
          href: al.href,
          image: al.cover || null,
          status: al.status,
          trackCount: al.trackCount,
          artistName: name,
          hasCover: hasCover(al.code),
        }));
        // Order this persona's albums by composite rating, highest first.
        items.sort((a, b) => albumRating(b.code) - albumRating(a.code));
        // Float the flagship album to the front of its row.
        const fi = items.findIndex((it) => it.code === FEATURED_ALBUM_CODE);
        if (fi > 0) items.unshift(items.splice(fi, 1)[0]);
        return <MediaRow key={r.slug} title={name} items={items} requireCover />;
      })}
    </div>
  );
}
