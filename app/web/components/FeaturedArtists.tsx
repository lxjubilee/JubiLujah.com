import Link from 'next/link';
import { personaRows } from '@/lib/manifest';
import { isPersona, avatarKey, personaCardImage } from '@/lib/personas';

// Owner-specified display order for the Home "Featured Artists" grid — NOT birth
// order (the Inspire page keeps birth order via INSPIRE_ORDER). Twelve personas,
// six per row → two rows of six.
const FEATURED_ORDER = [
  'melody-inspire', 'amir-inspire', 'jubilee-inspire', 'elias-inspire', 'santiago-inspire', 'tahoma-inspire',
  'imani-inspire', 'caleb-inspire', 'nova-inspire', 'eliana-inspire', 'zariah-inspire', 'zev-inspire',
];
const rank = (slug: string) => {
  const i = FEATURED_ORDER.indexOf(slug);
  return i === -1 ? FEATURED_ORDER.length : i;
};

export default function FeaturedArtists({ title = 'Featured Artists' }: { title?: string }) {
  const artists = personaRows()
    .filter((r) => r.category === 'inspire' && isPersona(r.slug)
      && r.albums.length > 0 && FEATURED_ORDER.includes(r.slug))
    .sort((a, b) => rank(a.slug) - rank(b.slug));
  if (!artists.length) return null;

  return (
    <section className="nf-row fa-row">
      <h2 className="nf-row-title">{title}</h2>
      <div className="fa-track">
        {artists.map((a) => {
          const name = a.name.trim().endsWith('Inspire') ? a.name.trim() : `${a.name.trim()} Inspire`;
          const img = personaCardImage(a.slug);
          // Clicking an artist opens their first album — preferring a ready
          // (playable) one so we never land on an empty studio album; falls back
          // to the artist page only if the persona somehow has no albums.
          const firstAlbum = a.albums.find((al) => al.status === 'ready') ?? a.albums[0];
          const href = firstAlbum ? firstAlbum.href : `/artist/${a.slug}`;
          return (
            <Link key={a.slug} href={href} className="fa-card">
              {/* The `avatar <key>` classes pull the persona's branded gradient
                  (site.css) in behind the photo as a fallback if it ever 404s. */}
              <div className={`fa-avatar avatar ${avatarKey(a.slug)}`}>
                {img
                  ? <img src={img} alt={name} loading="lazy" />
                  : <span className="fa-initial">{name.charAt(0)}</span>}
              </div>
              <div className="fa-name">{name}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
