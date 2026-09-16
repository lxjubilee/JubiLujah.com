'use client';
import Link from 'next/link';
import { useState } from 'react';
import { usePlayer, type PlayerSong } from '@/stores/player';
import type { SeasonPlaylist, SeasonSong } from '@/lib/seasonPlaylists';

// ============================================================================
// "For Your Season" — the twelve default playlists, on the PLAYLISTS page.
//
// The public heading is the spec's working choice (setup/playlist-functionality
// .md §3). Each card opens its playlist page; its Play button starts the 36 songs
// on the footer player without leaving this page.
//
// NO SIGN-IN CODE HERE, deliberately. Playing needs an account, and that is
// already enforced in one place for the whole site: PlaybackGate sets
// `blockPlayback` for a signed-out visitor, and playQueue then opens the
// "sign in to play" prompt instead of starting anything. A second gate here could
// only disagree with it. Browsing the playlists stays open to everyone.
// ============================================================================

export function toPlayerSongs(playlistId: string, songs: SeasonSong[]): PlayerSong[] {
  return songs.map((s, i) => ({
    // Unique per SLOT, so the queue can highlight the row that is playing;
    // songId is the real catalogue id that play counting keys on.
    id: `season-${playlistId}#${i}`,
    songId: s.songId,
    title: s.title,
    artist: s.artist,
    album: s.album,
    url: s.url,
    cover: s.cover,
    href: `/playlists/${playlistId}`,
  }));
}

export function seasonArt(pl: Pick<SeasonPlaylist, 'accent' | 'id'>): React.CSSProperties {
  return { background: `linear-gradient(135deg, ${pl.accent} 0%, color-mix(in srgb, ${pl.accent} 35%, #0b0d14) 100%)` };
}

const PLAY = 'M7 5v14l12-7z';

export default function SeasonPlaylists({ items }: { items: SeasonPlaylist[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  const onPlay = async (id: string) => {
    if (busy) return;
    setBusy(id);
    try {
      const r = await fetch(`/playlists/${encodeURIComponent(id)}/songs`, { headers: { accept: 'application/json' } });
      if (!r.ok) return;
      const d = (await r.json()) as { songs: SeasonSong[] };
      if (d.songs?.length) usePlayer.getState().playQueue(toPlayerSongs(id, d.songs), 0);
    } catch { /* nothing to play — the card stays as it was */ } finally {
      setBusy(null);
    }
  };

  return (
    <section className="plx-section">
      <div className="container">
        <div className="plx-section-head">
          <h2 className="plx-section-title">For Your Season</h2>
          <span className="plx-section-count">{items.length}</span>
        </div>
        <p className="spl-lead">However you&rsquo;re feeling and wherever you are today, here are {items[0].songCount} songs picked for it.</p>

        <div className="plx-grid spl-grid">
          {items.map((pl) => (
            <article key={pl.id} className="plx-card spl-card">
              <Link href={`/playlists/${pl.id}`} className="plx-art spl-art" style={pl.image ? undefined : seasonArt(pl)} aria-label={`Open ${pl.title}`}>
                {pl.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="plx-art-img" src={pl.image} alt="" loading="lazy" decoding="async" />
                )}
                <span className="spl-art-shade" aria-hidden="true" />
                <span className="spl-art-title">{pl.title}</span>
                <span className="plx-art-count">{pl.songCount} songs</span>
              </Link>
              <div className="plx-card-body">
                <p className="plx-card-desc spl-desc">{pl.description}</p>
              </div>
              <div className="plx-card-actions">
                <button className="plx-btn plx-btn-primary" onClick={() => onPlay(pl.id)} disabled={busy === pl.id}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d={PLAY} /></svg>
                  {busy === pl.id ? ' Starting…' : ' Play'}
                </button>
                <Link className="plx-btn" href={`/playlists/${pl.id}`}>Open</Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
