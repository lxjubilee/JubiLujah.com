import Link from 'next/link';
import { listArtists } from '@/lib/manifest';
import { personaCardImage, avatarKey, isPersona } from '@/lib/personas';
import StatusCountsBar from './StatusCountsBar';

interface Props {
  eyebrow: string;
  title: string;
  intro: string;
  categoryKeys: string[];
  scope: string;
  // Extra artists to surface here by slug, regardless of their home category
  // (e.g. Melody Inspire appears on Family Friendly while still living in Inspire).
  extraSlugs?: string[];
}

// Server component — lists every artist across the given category keys as
// persona cards (avatar image with gradient fallback), matching the legacy look.
export default function CategoryView({ eyebrow, title, intro, categoryKeys, scope, extraSlugs = [] }: Props) {
  const base = categoryKeys.flatMap((k) => listArtists(k)).filter((a) => isPersona(a.slug));
  const seen = new Set(base.map((a) => a.slug));
  const extra = extraSlugs.length
    ? listArtists().filter((a) => extraSlugs.includes(a.slug) && !seen.has(a.slug))
    : [];
  const artists = [...extra, ...base];

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
          <p className="lead">{intro}</p>
          <StatusCountsBar scope={scope} />
        </div>
      </section>

      <section className="standard">
        <div className="container">
          <div className="persona-grid">
            {artists.map((a) => {
              const img = personaCardImage(a.slug);
              return (
                <Link key={a.slug} href={`/artist/${a.slug}`} className="persona-card">
                  <div className={`avatar ${avatarKey(a.slug)}`}>
                    {img && <img className="avatar-img" src={img} alt={a.name} loading="lazy" />}
                    <span className="avatar-label">{a.name}</span>
                  </div>
                  <div className="body">
                    {a.role && <div className="role">{a.role}</div>}
                    <div className="name">{a.name}</div>
                    <div className="stats">
                      <span><strong>{a.albumCount}</strong> albums</span>
                      <span><strong>{a.playableAlbums}</strong> ready</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          {artists.length === 0 && <p className="notice">No artists found in this category.</p>}
        </div>
      </section>
    </>
  );
}
