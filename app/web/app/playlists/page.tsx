import type { Metadata } from 'next';
import MyPlaylists from '@/components/MyPlaylists';
import SeasonPlaylists from '@/components/SeasonPlaylists';
import { listSeasonPlaylists } from '@/lib/seasonPlaylists';

// THE PLAYLISTS PAGE. A Server Component since 2026-09-16, so it can read the
// "For Your Season" defaults from disk (lib/seasonPlaylists.ts); the listener's
// own playlists are fetched in the browser, as before, by <MyPlaylists />.
//
// SECTION ORDER. setup/playlist-functionality.md §2 puts My Playlists first for a
// signed-in listener who has some, then the defaults. Today the defaults are the
// twelve Emotional State playlists — there is no Thematic section on this page
// yet — and they lead for everyone: a signed-out visitor's My Playlists is only
// a "sign in" line, and a listener's own mixes are one scroll away. The spec
// marks the order as adjustable (§10).
//
// Tenant-scoped for free: every slot resolves through getAlbumByCode, which only
// sees this tenant's catalogue, so a site that cannot play Inspire albums gets no
// section rather than twelve empty cards.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Playlists',
  description: 'Twelve playlists for every season of life (joy, fear, grief, waiting, gratitude, rest and more), plus your own mixes.',
};

export default function PlaylistsPage() {
  const seasons = listSeasonPlaylists();
  return (
    <>
      <section className="plx-hero">
        <div className="container">
          <h1 className="plx-hero-title">Playlists</h1>
          <p className="plx-hero-lead">
            Music for wherever you are today, or build your own mixes from any album and keep them
            saved to your account.
          </p>
        </div>
      </section>
      <SeasonPlaylists items={seasons} />
      <MyPlaylists />
    </>
  );
}
