'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePlayer } from '@/stores/player';
import { useAuth } from './AuthProvider';
import { useLikes } from '@/stores/likes';
import { useAuthGate } from '@/stores/authGate';
import { reactionStream } from '@/lib/reactionStream';

// ============================================================================
// /now-playing: the album on the footer bar, large, in the middle of the screen.
//
// Nothing here owns playback. The <audio> element and every control live in the
// footer player (components/FooterPlayer.tsx), which stays underneath this page;
// this view only reads the same store and calls the same actions, so the two can
// never disagree about what is playing.
// ============================================================================

const P = {
  play: 'M8 5.5v13l11-6.5-11-6.5z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  prev: 'M6 5h2v14H6zm12.5 0L9 12l9.5 7z',
  next: 'M16 5h2v14h-2zM5.5 5L15 12l-9.5 7z',
  note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  thumb: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
};
const Svg = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function NowPlayingView() {
  const song = usePlayer((s) => s.nowPlaying);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const upNext = usePlayer((s) => s.upNext);

  const { authenticated } = useAuth();
  const songId = song?.songId || '';
  const liked = useLikes((s) => (songId ? s.has('song', songId) : false));
  const favorite = useLikes((s) => (songId ? s.has('song', songId, 'favorite') : false));
  useEffect(() => { if (authenticated) useLikes.getState().ensureLoaded(); }, [authenticated]);

  const react = (e: React.MouseEvent<HTMLButtonElement>, kind: 'like' | 'favorite') => {
    if (!songId) return;
    if (!authenticated) {
      useAuthGate.getState().show(kind === 'favorite' ? 'Sign in to save your favorites' : 'Sign in to like songs');
      return;
    }
    if (!(kind === 'favorite' ? favorite : liked)) reactionStream(e.currentTarget, kind === 'favorite' ? 'heart' : 'thumb');
    void useLikes.getState().toggle('song', songId, kind);
  };

  const pct = duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    usePlayer.getState().seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * (duration || 0));
  };

  if (!song) {
    return (
      <section className="np-stage np-empty">
        <div className="np-empty-inner">
          <div className="np-empty-glyph"><Svg d={P.note} size={44} /></div>
          <h1 className="np-title">Nothing is playing yet</h1>
          <p className="np-sub">Press play on the bar below, or pick any album.</p>
          <div className="np-links">
            <Link href="/" className="np-link">Browse Albums</Link>
            <Link href="/playlists" className="np-link">Playlists</Link>
          </div>
        </div>
      </section>
    );
  }

  const art = song.cover || null;

  return (
    <section className={`np-stage${isPlaying ? ' is-playing' : ''}`}>
      {art && <div className="np-backdrop" style={{ backgroundImage: `url('${art}')` }} aria-hidden="true" />}
      <div className="np-veil" aria-hidden="true" />

      <div className="np-main">
        <div className="np-center">
          <div className="np-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {art ? <img src={art} alt={song.album ? `${song.album} cover` : ''} /> : <div className="np-cover-blank"><Svg d={P.note} size={64} /></div>}
          </div>

          <div className="np-meta">
            <h1 className="np-title" title={song.title}>{song.title}</h1>
            <p className="np-sub">
              {song.artist}
              {song.artist && song.album ? ' · ' : ''}
              {song.album && (song.href ? <Link href={song.href} className="np-album-link">{song.album}</Link> : song.album)}
            </p>
          </div>

          <div className="np-progress-row">
            <span className="np-time">{fmt(position)}</span>
            <div className="np-progress" onClick={seek} role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)}>
              <div className="np-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="np-time">{fmt(duration)}</span>
          </div>

          <div className="np-controls">
            <button type="button" className={`np-btn np-react like${liked ? ' on' : ''}`} onClick={(e) => react(e, 'like')} aria-label="Like" aria-pressed={liked} title={liked ? 'Liked' : 'Like this song'}><Svg d={P.thumb} /></button>
            <button type="button" className="np-btn" onClick={() => usePlayer.getState().prev()} aria-label="Previous"><Svg d={P.prev} size={26} /></button>
            <button type="button" className="np-btn np-play" onClick={() => usePlayer.getState().togglePlay()} aria-label={isPlaying ? 'Pause' : 'Play'}><Svg d={isPlaying ? P.pause : P.play} size={30} /></button>
            <button type="button" className="np-btn" onClick={() => usePlayer.getState().next()} aria-label="Next"><Svg d={P.next} size={26} /></button>
            <button type="button" className={`np-btn np-react fav${favorite ? ' on' : ''}`} onClick={(e) => react(e, 'favorite')} aria-label="Favorite" aria-pressed={favorite} title={favorite ? 'In your favorites' : 'Add to favorites'}><Svg d={P.heart} /></button>
          </div>

          {song.href && <Link href={song.href} className="np-link np-view">View Album</Link>}
        </div>

        {upNext.length > 0 && (
          <aside className="np-next" aria-label="Up next">
            <h2 className="np-next-title">Up Next</h2>
            <ol className="np-next-list">
              {upNext.slice(0, 8).map((s, n) => (
                <li key={`${s.id}-${n}`} className="np-next-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {s.cover ? <img src={s.cover} alt="" /> : <span className="np-next-blank"><Svg d={P.note} size={16} /></span>}
                  <span className="np-next-tx">
                    <span className="np-next-name">{s.title}</span>
                    {s.artist && <span className="np-next-sub">{s.artist}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </section>
  );
}
