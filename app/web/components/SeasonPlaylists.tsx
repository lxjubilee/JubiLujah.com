'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer, type PlayerSong } from '@/stores/player';
import type { SeasonPlaylist, SeasonSong } from '@/lib/seasonPlaylists';

// ============================================================================
// "For Your Season" — the twelve default playlists, on the PLAYLISTS page.
//
// LOOKS AND BEHAVES LIKE THE HOME PAGE (owner, 2026-09-16): a row on the black
// page, tiles of one size, and the same hover card the album tiles open, with
// Play and Open. No explanatory copy and no "36 songs" on the tiles — the
// pictures and titles say enough.
//
// NO SIGN-IN CODE HERE, deliberately. Playing needs an account, and that is
// enforced in one place for the whole site: PlaybackGate sets `blockPlayback`
// for a signed-out visitor, and playQueue opens the sign-in prompt instead.
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

const PLAY = 'M8 5v14l11-7z';
const CHEVRON = 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z';

async function playSeason(id: string) {
  const r = await fetch(`/playlists/${encodeURIComponent(id)}/songs`, { headers: { accept: 'application/json' } });
  if (!r.ok) return;
  const d = (await r.json()) as { songs: SeasonSong[] };
  if (d.songs?.length) usePlayer.getState().playQueue(toPlayerSongs(id, d.songs), 0);
}

function SeasonTile({ pl }: { pl: SeasonPlaylist }) {
  const tileRef = useRef<HTMLAnchorElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });

  useEffect(() => { setMounted(true); }, []);

  // The home tiles' hover card, sized for a 16:9 picture.
  const computePos = () => {
    const el = tileRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(Math.round(r.width * 1.45), 320);
    const estH = width * (9 / 16) + 150;
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = r.top + r.height / 2 - estH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - estH - 8));
    setPos({ left, top, width });
  };
  const scheduleOpen = () => {
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => { computePos(); setOpen(true); }, 350);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const onPlay = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try { await playSeason(pl.id); } catch { /* nothing to play */ } finally { setBusy(false); }
  };

  const picture = (
    pl.image
      // eslint-disable-next-line @next/next/no-img-element
      ? <img src={pl.image} alt="" loading="lazy" decoding="async" />
      : <span className="nf-tile-bg" style={seasonArt(pl)} />
  );

  return (
    <>
      <Link
        ref={tileRef}
        href={`/playlists/${pl.id}`}
        className="nf-tile spl-tile"
        title={pl.title}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        {picture}
        <span className="spl-tile-shade" aria-hidden="true" />
        <span className="spl-tile-title">{pl.title}</span>
      </Link>

      {mounted && open && createPortal(
        <div
          className="nf-preview spl-preview"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <Link href={`/playlists/${pl.id}`} className="nf-preview-cover spl-preview-cover" aria-label={pl.title}>
            {picture}
          </Link>
          <div className="nf-preview-body">
            <div className="nf-preview-actions">
              <button className="nf-act play" onClick={onPlay} title="Play playlist" aria-label={`Play ${pl.title}`} disabled={busy}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d={PLAY} /></svg>
              </button>
              <Link href={`/playlists/${pl.id}`} className="nf-act details" title="Open playlist" aria-label={`Open ${pl.title}`}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d={CHEVRON} /></svg>
              </Link>
            </div>
            <div className="nf-preview-title">{pl.title}</div>
            <div className="nf-preview-genres">{pl.description}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function SeasonPlaylists({ items }: { items: SeasonPlaylist[] }) {
  if (!items.length) return null;
  return (
    <section className="nf-row spl-row">
      <h2 className="nf-row-title">For Your Season</h2>
      <div className="nf-row-track spl-track">
        {items.map((pl) => <SeasonTile key={pl.id} pl={pl} />)}
      </div>
    </section>
  );
}
