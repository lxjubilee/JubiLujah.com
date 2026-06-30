'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import AddToPlaylist from './AddToPlaylist';
import { usePlayer, type PlayerSong } from '@/stores/player';
import { usePlaylistMembership } from '@/stores/playlistMembership';
import { getPlaylist, removeFromPlaylist, type PlaylistDetail } from '@/lib/playlists';

// ============================================================================
// A playlist rendered as a music page — same look as the album page (reuses the
// .album-exec / .jv-center / .jv-tracks styling) so it feels native. Shows the
// full track list, a working big Play button, and per-track play / add / remove.
// ============================================================================

const PLAY_D = 'M7 5v14l12-7z';
const PAUSE_D = 'M6 5h4v14H6zm8 0h4v14h-4z';
const TransportIcon = ({ paused }: { paused: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d={paused ? PLAY_D : PAUSE_D} /></svg>
);
const Equalizer = ({ paused }: { paused: boolean }) => (
  <span className={`jv-eq${paused ? ' paused' : ''}`} aria-label="Now playing"><span /><span /><span /><span /></span>
);

function fmt(s: number) {
  if (!isFinite(s) || s <= 0) return '--:--';
  const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function PlaylistApp({ id, autoplay = false }: { id: string; autoplay?: boolean }) {
  const playQueue = usePlayer((s) => s.playQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const markRemoved = usePlaylistMembership((s) => s.markRemoved);

  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const autoFired = useRef(false);

  useEffect(() => {
    let live = true;
    getPlaylist(id).then((d) => { if (live) setDetail(d); }).catch(() => { if (live) setError('Could not load this playlist. You may need to sign in.'); });
    return () => { live = false; };
  }, [id]);

  const items = detail?.items ?? [];
  const cover = items.find((it) => it.cover)?.cover || null;
  const playableCount = items.filter((it) => it.url).length;
  const rowId = (i: number) => `pl-${id}#${i}`;

  const toSongs = useCallback((): PlayerSong[] =>
    items.map((it, i) => ({
      id: rowId(i), songId: it.song_id, title: it.song_title,
      artist: it.artist_name || undefined, album: it.album_title || undefined,
      url: it.url ?? null, cover: it.cover ?? null, href: `/playlist?id=${id}`,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, id]);

  const playAll = useCallback(() => {
    const songs = toSongs().filter((s) => s.url);
    if (songs.length) playQueue(songs, 0);
  }, [toSongs, playQueue]);

  const playFrom = (i: number) => {
    const all = toSongs();
    if (!all[i]?.url) return;
    const playable = all.filter((x) => x.url);
    playQueue(playable, Math.max(0, playable.findIndex((x) => x.id === all[i].id)));
  };

  // Autoplay once when arriving via the "Play" action.
  useEffect(() => {
    if (autoplay && !autoFired.current && playableCount > 0) { autoFired.current = true; playAll(); }
  }, [autoplay, playableCount, playAll]);

  // Real durations from audio metadata.
  useEffect(() => {
    const audios: HTMLAudioElement[] = [];
    items.forEach((it, i) => {
      const key = rowId(i);
      if (!it.url || durations[key] !== undefined) return;
      const a = new Audio(); a.preload = 'metadata'; a.src = it.url;
      const on = () => { setDurations((d) => ({ ...d, [key]: a.duration || 0 })); a.removeEventListener('loadedmetadata', on); };
      a.addEventListener('loadedmetadata', on); audios.push(a);
    });
    return () => { audios.forEach((a) => { a.src = ''; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  const onRemove = async (itemId: string, songId: string) => {
    try {
      await removeFromPlaylist(id, itemId);
      setDetail((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d));
      markRemoved(songId);
    } catch { /* ignore */ }
  };

  const playlistActive = !!nowPlaying && nowPlaying.id.startsWith(`pl-${id}#`);
  const bigPlayPaused = !(playlistActive && isPlaying);
  const onBigPlay = () => { if (playlistActive) togglePlay(); else playAll(); };

  if (error) {
    return <div className="album-exec"><div className="container" style={{ padding: '60px 0' }}><p className="notice">{error} <Link href="/playlists" className="pl-link">Back to Playlists</Link></p></div></div>;
  }

  return (
    <div className="album-exec">
      <section className="jv-app">
        <div className="pl-page-grid">
          <main className="jv-panel jv-center pl-center">
            <div className="jv-center-head">
              <div className="jv-cover-wrap pl-cover-wrap">
                {cover
                  ? <Image className="pl-cover" src={cover} alt="" width={168} height={168} />
                  : <div className="pl-cover pl-cover-empty"><svg viewBox="0 0 24 24" width="46" height="46" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg></div>}
              </div>
              <div className="jv-center-meta">
                <div className="jv-eyebrow-sm">Playlist</div>
                <div className="jv-center-title">{detail?.name || 'Playlist'}</div>
                {detail?.description && <div className="pl-center-desc">{detail.description}</div>}
                <div className="jv-center-sub">
                  <span>{items.length} song{items.length === 1 ? '' : 's'}</span>
                  {playableCount < items.length && <><span className="dot">·</span><span>{playableCount} playable</span></>}
                </div>
              </div>
            </div>

            <div className="jv-center-actions">
              <button className={`jv-bigplay${bigPlayPaused ? '' : ' playing'}`} onClick={onBigPlay} disabled={playableCount === 0}
                title={bigPlayPaused ? 'Play Playlist' : 'Pause'} aria-label={bigPlayPaused ? 'Play Playlist' : 'Pause'}>
                <TransportIcon paused={bigPlayPaused} />
              </button>
              <Link href="/playlists" className="jv-follow">All Playlists</Link>
            </div>

            <div className="jv-tracks">
              <div className="jv-track-head"><span>#</span><span>Title</span><span></span><span className="jv-th-dur">🕑</span></div>
              {detail && items.length === 0 && (
                <div className="pl-empty-tracks">This Playlist has no songs yet. Open an album and use the “+” on a track to add one.</div>
              )}
              {items.map((it, i) => {
                const id2 = rowId(i);
                const playingThis = !!nowPlaying && nowPlaying.id === id2;
                return (
                  <div key={it.id} className={`jv-track-row${it.url ? '' : ' disabled'}${playingThis ? ' playing' : ''}`} onClick={() => playFrom(i)}>
                    <span className="jv-tnum-wrap">
                      {playingThis ? <Equalizer paused={!isPlaying} /> : <><span className="jv-tnum">{i + 1}</span><span className="jv-tplay">▶</span></>}
                    </span>
                    <span className="jv-tname">
                      <span className="jv-tname-text">{it.song_title}</span>
                      <span className="pl-tsub">{it.artist_name || it.album_title || ''}</span>
                    </span>
                    <span className="jv-tadd" onClick={(e) => e.stopPropagation()}>
                      <AddToPlaylist songId={it.song_id} />
                      <button className="pl-trash" title="Remove from Playlist" aria-label="Remove from Playlist" onClick={() => onRemove(it.id, it.song_id)}>✕</button>
                    </span>
                    <span className="jv-tdur">{it.url ? fmt(durations[id2]) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}
