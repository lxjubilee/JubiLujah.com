'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { listLikes, type LikedItem } from '@/lib/likes';

const NOTE = 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z';

// Account-backed favorites. Lists the albums (and songs) the signed-in user has
// liked across the site.
export default function LikedPage() {
  const { authenticated, loading } = useAuth();
  const [items, setItems] = useState<LikedItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!authenticated) { setLoaded(true); return; }
    listLikes().then((r) => setItems(r.items)).catch(() => {}).finally(() => setLoaded(true));
  }, [authenticated, loading]);

  return (
    <>
      <section className="plx-hero">
        <div className="container">
          <div className="plx-hero-eyebrow">Your Favorites</div>
          <h1 className="plx-hero-title">Liked albums</h1>
          <p className="plx-hero-lead">Everything you’ve liked across the site, saved to your account and synced across devices.</p>
        </div>
      </section>

      <section className="plx-section">
        <div className="container">
          {!loading && !authenticated && (
            <div className="plx-signin">
              <p><Link href="/signin?returnTo=/liked" className="pl-link">Sign in</Link> to like albums and see your favorites here.</p>
            </div>
          )}

          {authenticated && loaded && items.length === 0 && (
            <p className="plx-empty">No likes yet. Hover any album and tap the 👍 to add it here.</p>
          )}

          {authenticated && items.length > 0 && (
            <div className="plx-grid">
              {items.map((it) => (
                <Link key={`${it.target_type}:${it.target_id}`} href={it.code ? `/album?c=${it.code}` : '#'} className="plx-card liked-card">
                  <div className="plx-art">
                    {it.cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className="plx-art-img" src={it.cover} alt="" />
                      : <svg className="plx-art-note" viewBox="0 0 24 24" fill="currentColor"><path d={NOTE} /></svg>}
                    {it.status && <span className="plx-art-count">{it.status === 'ready' ? 'Ready' : 'Studio'}</span>}
                  </div>
                  <div className="plx-card-body">
                    <h3 className="plx-card-name">{it.title}</h3>
                    {it.artist && <p className="plx-card-desc">{it.artist}</p>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
