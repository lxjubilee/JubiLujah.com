'use client';
import Link from 'next/link';
import { usePlayer } from '@/stores/player';
import type { SeasonPlaylist, SeasonSong } from '@/lib/seasonPlaylists';
import { seasonArt, toPlayerSongs } from './SeasonPlaylists';

// One "For Your Season" playlist page: banner, description, Play all, and the
// song list — any row starts the playlist from that song.
//
// The row that is playing is found by the queue's per-slot id, not by songId, so
// the same song could never light up twice (and a song this playlist shares with
// the listener's other queue does not light up here).
export default function SeasonPlaylistView({ playlist }: { playlist: SeasonPlaylist & { songs: SeasonSong[] } }) {
  const nowId = usePlayer((s) => s.nowPlaying?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const songs = toPlayerSongs(playlist.id, playlist.songs);

  const playFrom = (i: number) => {
    const cur = usePlayer.getState();
    // The playing row is a transport control: pause and resume, not restart.
    if (nowId === songs[i].id) { if (isPlaying) cur.pause(); else cur.resume(); return; }
    cur.playQueue(songs, i);
  };

  const playingHere = songs.some((s) => s.id === nowId);

  return (
    <>
      <section className="spl-banner" style={playlist.image ? undefined : seasonArt(playlist)}>
        {playlist.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="spl-banner-img" src={playlist.image} alt="" />
        )}
        <div className="spl-banner-shade" aria-hidden="true" />
        <div className="container spl-banner-body">
          <Link href="/playlists" className="spl-back">← Playlists</Link>
          <p className="spl-eyebrow">For Your Season</p>
          <h1 className="spl-title">{playlist.title}</h1>
          <p className="spl-description">{playlist.description}</p>
          <p className="spl-meta">{playlist.songCount} songs · {playlist.artistCount} artists</p>
          <button className="spl-play" onClick={() => (playingHere && isPlaying ? usePlayer.getState().pause() : playFrom(playingHere ? songs.findIndex((s) => s.id === nowId) : 0))}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d={playingHere && isPlaying ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M7 5v14l12-7z'} />
            </svg>
            {playingHere && isPlaying ? 'Pause' : playingHere ? 'Resume' : 'Play all'}
          </button>
        </div>
      </section>

      <section className="plx-section">
        <div className="container">
          <ol className="spl-tracks">
            {playlist.songs.map((s, i) => {
              const active = songs[i].id === nowId;
              return (
                <li key={songs[i].id} className={`spl-track${active ? ' is-active' : ''}`}>
                  <button className="spl-track-play" onClick={() => playFrom(i)} aria-label={`${active && isPlaying ? 'Pause' : 'Play'} ${s.title}`}>
                    <span className="spl-track-n">{i + 1}</span>
                    <svg className="spl-track-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                      <path d={active && isPlaying ? 'M6 5h4v14H6zm8 0h4v14h-4z' : 'M7 5v14l12-7z'} />
                    </svg>
                  </button>
                  {s.cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className="spl-track-cover" src={s.cover} alt="" loading="lazy" decoding="async" />
                    : <span className="spl-track-cover" />}
                  <div className="spl-track-text">
                    <span className="spl-track-title">{s.title}</span>
                    <span className="spl-track-sub">
                      {s.artist} · <Link href={s.albumHref}>{s.album}</Link>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}
