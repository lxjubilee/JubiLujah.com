'use client';
import { usePlayer, PlayerSong } from '@/stores/player';
import type { Album } from '@/lib/types';

const PlayIcon = () => (<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>);

export default function AlbumTracks({ album }: { album: Album }) {
  const playQueue = usePlayer((s) => s.playQueue);

  const toSongs = (): PlayerSong[] =>
    album.tracks.map((t) => ({
      id: t.id,
      songId: t.id,
      title: t.title,
      artist: album.artistName,
      album: album.title,
      url: t.url,
      cover: null,
      href: `/album?c=${album.code}`,
    }));

  const playFrom = (index: number) => {
    const songs = toSongs();
    // Map the clicked playable index to its position in the playable-only queue.
    const playable = songs.filter((s) => s.url);
    const target = songs[index];
    const startIndex = Math.max(0, playable.findIndex((s) => s.id === target.id));
    playQueue(playable, startIndex);
  };

  if (!album.tracks.length) {
    return <p className="notice">This album is in the studio — no audio tracks have been uploaded yet.</p>;
  }

  return (
    <ul className="track-list">
      {album.tracks.map((t, i) => (
        <li key={t.id} className={`track-row${t.url ? '' : ' disabled'}`}>
          <span className="tnum">{t.n}</span>
          <span className="ttitle">{t.title}</span>
          <button
            className="tplay"
            disabled={!t.url}
            onClick={() => playFrom(i)}
            aria-label={`Play ${t.title}`}
            title={t.url ? 'Play' : 'No audio yet'}
          >
            <PlayIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
