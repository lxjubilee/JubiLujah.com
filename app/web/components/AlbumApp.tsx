'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import AlbumCover from './AlbumCover';
import AddToPlaylist from './AddToPlaylist';
import PublicAlbumRating from './PublicAlbumRating';
import SongRatingControl from './SongRatingControl';
import ReviewComposer from './ReviewComposer';
import { useAuth } from './AuthProvider';
import { usePlayer, PlayerSong } from '@/stores/player';
import { albumUuid } from '@/lib/ids';
import { api } from '@/lib/api';
import { batchSummaries, type ReviewSummary, type TargetType } from '@/lib/reviews';
import { genrePair } from '@/lib/genres';
import { useLang } from '@/lib/useLang';
import { albumVisibleInLang, albumBcp47 } from '@/lib/languages';

export interface TrackD { id: string; n: number; title: string; url: string | null; }
export interface AlbumLink { code: string; title: string; cover: string; status: 'ready' | 'studio'; }
// A "Similar Music" entry — another album sharing this album's primary genre.
export interface SimilarAlbum { code: string; title: string; cover: string; status: 'ready' | 'studio'; artist: string; }
export interface CurrentAlbum {
  code: string; title: string; cover: string; status: 'ready' | 'studio'; trackCount: number; tracks: TrackD[];
}

// Small album thumbnail for the Similar/More rails. Routed through next/image
// (AVIF, ~48px variant) instead of a raw CSS background of the full-size PNG.
// Falls back to the plain .jv-thumb placeholder (its gradient/colour) when the
// album has no published cover, so a missing cover never shows a broken-image
// glyph — matching the old background-image behaviour.
function Thumb({ cover }: { cover: string }) {
  const [broken, setBroken] = useState(false);
  return (!cover || broken)
    ? <span className="jv-thumb" />
    : <Image className="jv-thumb" src={cover} alt="" width={48} height={48} style={{ objectFit: 'cover' }} onError={() => setBroken(true)} />;
}
const Equalizer = ({ paused }: { paused: boolean }) => (
  <span className={`jv-eq${paused ? ' paused' : ''}`} aria-label="Now playing"><span /><span /><span /><span /></span>
);
// Transport glyphs for the big album play/pause button (same paths as the footer).
const PLAY_D = 'M7 5v14l12-7z';
const PAUSE_D = 'M6 5h4v14H6zm8 0h4v14h-4z';
const TransportIcon = ({ paused }: { paused: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d={paused ? PLAY_D : PAUSE_D} /></svg>
);

function fmt(s: number) {
  if (!isFinite(s) || s <= 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function AlbumApp({ artist, albums, initial, similar = [] }: { artist: string; albums: AlbumLink[]; initial: CurrentAlbum; similar?: SimilarAlbum[] }) {
  const playQueue = usePlayer((s) => s.playQueue);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  const isPlaying = usePlayer((s) => s.isPlaying);

  const { authenticated, canSeeStudio, loading: authLoading } = useAuth();
  const lang = useLang();
  const [cache, setCache] = useState<Record<string, CurrentAlbum>>({ [initial.code]: initial });
  const [code, setCode] = useState(initial.code);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const current = cache[code] || initial;
  const editId = albumUuid(code);
  const gp = genrePair(current.code, artist, current.title);

  // ---- Public ratings (§2/§3/§6): album + per-song summaries -------------
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});
  const [compose, setCompose] = useState<{ type: TargetType; id: string; label: string } | null>(null);

  const loadSummaries = useCallback(() => {
    const targets = [
      { type: 'album' as const, id: albumUuid(code) },
      ...current.tracks.map((t) => ({ type: 'song' as const, id: t.id })),
    ];
    batchSummaries(targets).then((r) => setSummaries(r.summaries)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, current.tracks.length]);

  useEffect(() => { loadSummaries(); }, [loadSummaries]);

  // Open the rate/review composer (or send guests to sign in).
  const openCompose = (type: TargetType, id: string, label: string) => {
    if (!authenticated) { window.location.href = '/signin'; return; }
    setCompose({ type, id, label });
  };
  const composeInitial = compose ? summaries[`${compose.type}:${compose.id}`]?.mine || null : null;

  // Switch albums in place (no navigation, no scroll jump). Fetch tracks lazily.
  const select = async (e: React.MouseEvent, target: string) => {
    e.preventDefault();
    if (target === code) return;
    window.history.replaceState(null, '', `/album?c=${target}`);
    if (!cache[target]) {
      try {
        const a = await api.get<CurrentAlbum & { tracks: TrackD[] }>(`/api/albums/${target}`);
        setCache((c) => ({ ...c, [target]: {
          code: a.code, title: a.title, cover: `/cover/${a.code}.png`, status: a.status,
          trackCount: a.trackCount, tracks: a.tracks.map((t) => ({ id: t.id, n: t.n, title: t.title, url: t.url })),
        } }));
      } catch { /* keep current on failure */ }
    }
    setCode(target);
  };

  // Unique per-row id. The manifest can carry tracks with missing/duplicate
  // track numbers, so songUuid(code, n) collides; the row index guarantees a
  // unique id per row for the player queue, the now-playing highlight, and the
  // duration cache — so exactly one row highlights at a time.
  const rowId = (i: number) => `${current.code}#${i}`;

  // Load real track durations (audio metadata) for the current album.
  useEffect(() => {
    const audios: HTMLAudioElement[] = [];
    current.tracks.forEach((t, i) => {
      const key = rowId(i);
      if (!t.url || durations[key] !== undefined) return;
      const a = new Audio();
      a.preload = 'metadata';
      a.src = t.url;
      const on = () => { setDurations((d) => ({ ...d, [key]: a.duration || 0 })); a.removeEventListener('loadedmetadata', on); };
      a.addEventListener('loadedmetadata', on);
      audios.push(a);
    });
    return () => { audios.forEach((a) => { a.src = ''; }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const toSongs = (): PlayerSong[] =>
    current.tracks.map((t, i) => ({ id: rowId(i), songId: t.id, title: t.title, artist, album: current.title, url: t.url, cover: current.cover, href: `/album?c=${current.code}` }));
  const playAll = () => { const s = toSongs().filter((x) => x.url); if (s.length) playQueue(s, 0); };

  // Is the track currently playing one of *this* album's rows? (row ids are
  // `${code}#${i}`.) When so, the big button mirrors the footer: it shows
  // pause while playing and toggles play/pause instead of restarting the album.
  const albumIsActive = !!nowPlaying && nowPlaying.id.startsWith(`${current.code}#`);
  const bigPlayPaused = !(albumIsActive && isPlaying);
  const onBigPlay = () => { if (albumIsActive) togglePlay(); else playAll(); };
  const playFrom = (i: number) => {
    const all = toSongs();
    if (!all[i].url) return;
    const playable = all.filter((x) => x.url);
    playQueue(playable, Math.max(0, playable.findIndex((x) => x.id === all[i].id)));
  };

  // Studio albums are hidden from signed-out visitors and plain viewers; only
  // admins/reviewers see them in the library and discovery rails.
  const visibleAlbums = (canSeeStudio ? albums : albums.filter((a) => a.status === 'ready'))
    .filter((a) => albumVisibleInLang(a.code, lang));
  const popular = visibleAlbums.slice(0, 6);
  const more = visibleAlbums.filter((a) => a.code !== code).slice(0, 6);

  const Mini = (a: AlbumLink) => (
    <a key={a.code} href={`/album?c=${a.code}`} onClick={(e) => select(e, a.code)} className="jv-mini">
      <Thumb cover={a.cover} />
      <span className="jv-mini-tx"><span className="jv-mini-title">{a.title}</span><span className="jv-mini-sub">{artist}</span></span>
    </a>
  );
  // Similar-music rows navigate fully (cross-artist), so the album page reloads
  // with the right artist + genre context.
  const SimilarRow = (a: SimilarAlbum) => (
    <a key={a.code} href={`/album?c=${a.code}`} className="jv-mini">
      <Thumb cover={a.cover} />
      <span className="jv-mini-tx"><span className="jv-mini-title">{a.title}</span><span className="jv-mini-sub">{a.artist}</span></span>
    </a>
  );
  const visibleSimilar = (canSeeStudio ? similar : similar.filter((a) => a.status === 'ready'))
    .filter((a) => albumVisibleInLang(a.code, lang));

  // Direct deep-link to a studio album: hidden from guests and plain viewers.
  // Defaults to blocked during auth load so studio content never flashes for a
  // guest; resolves to the full player once an admin/reviewer session loads.
  if (current.status === 'studio' && !canSeeStudio) {
    return (
      <section className="standard">
        <div className="container">
          {authLoading ? (
            <p className="notice">Loading…</p>
          ) : (
            <>
              <h1 className="section-title">Album not available</h1>
              <p className="notice">This album is still in the studio and isn’t published yet.</p>
            </>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="jv-app">
        <div className="jv-app-grid">
          {/* Left — Similar Music (other albums sharing this album's primary genre) */}
          <aside className="jv-panel jv-lib">
            <div className="jv-right-sec jv-similar-sec"><h3>Similar Music</h3></div>
            <div className="jv-lib-list jv-similar-list">
              {visibleSimilar.length > 0
                ? visibleSimilar.map(SimilarRow)
                : <div className="jv-mini-sub" style={{ padding: '4px 12px' }}>No similar albums yet.</div>}
            </div>
          </aside>

          {/* Center — now-playing album */}
          <main className="jv-panel jv-center">
            <div className="jv-center-head">
              <div className="jv-cover-wrap">
                <AlbumCover code={current.code} title={current.title} sizes="168px" />
              </div>
              <div className="jv-center-meta">
                <div className="jv-eyebrow-sm">Album</div>
                <div className="jv-center-title" lang={albumBcp47(current.code)}>{current.title}</div>
                <div className="jv-center-sub">
                  <span>{artist}</span><span className="dot">·</span>
                  <span>{current.trackCount} songs</span><span className="dot">·</span>
                  <span className={`status-pill ${current.status}`}>{gp.primary || (current.status === 'ready' ? 'Ready' : 'Studio')}</span>
                  {current.status === 'ready' && <span className="nf-hd">HD</span>}
                  {gp.secondary && <><span className="dot">·</span><span className="jv-secondary-genre">{gp.secondary}</span></>}
                </div>
                <PublicAlbumRating
                  summary={summaries[`album:${editId}`] || null}
                  code={current.code}
                  onRate={() => openCompose('album', editId, current.title)}
                />
              </div>
            </div>
            <div className="jv-center-actions">
              <button className={`jv-bigplay${bigPlayPaused ? '' : ' playing'}`} onClick={onBigPlay} title={bigPlayPaused ? 'Play album' : 'Pause'} aria-label={bigPlayPaused ? 'Play album' : 'Pause'}><TransportIcon paused={bigPlayPaused} /></button>
              <AddToPlaylist songIds={current.tracks.map((t) => t.id)} label="Add to Playlist" />
              <button className="jv-follow" type="button">Follow</button>
            </div>
            <div className="jv-tracks">
              <div className="jv-track-head"><span>#</span><span>Title</span><span></span><span className="jv-th-dur">🕑</span></div>
              {current.tracks.map((t, i) => {
                const id = rowId(i);
                const playingThis = !!nowPlaying && nowPlaying.id === id;
                return (
                  <div key={id} className={`jv-track-row${t.url ? '' : ' disabled'}${playingThis ? ' playing' : ''}`} onClick={() => playFrom(i)}>
                    <span className="jv-tnum-wrap">
                      {playingThis
                        ? <Equalizer paused={!isPlaying} />
                        : <><span className="jv-tnum">{t.n}</span><span className="jv-tplay">▶</span></>}
                    </span>
                    <span className="jv-tname">
                      <span className="jv-tname-text" lang={albumBcp47(current.code)}>{t.title}</span>
                      <SongRatingControl
                        summary={summaries[`song:${t.id}`] || null}
                        onRate={() => openCompose('song', t.id, t.title)}
                      />
                    </span>
                    <span className="jv-tadd" onClick={(e) => e.stopPropagation()}><AddToPlaylist songId={t.id} /></span>
                    <span className="jv-tdur">{t.url ? fmt(durations[id]) : '—'}</span>
                  </div>
                );
              })}
            </div>
          </main>

          {/* Right — discovery */}
          <aside className="jv-right">
            <div className="jv-right-sec"><h3>Popular Albums</h3>{popular.map(Mini)}</div>
            {more.length > 0 && <div className="jv-right-sec"><h3>More from {artist}</h3>{more.map(Mini)}</div>}
          </aside>
        </div>
      </section>

      {compose && (
        <ReviewComposer
          type={compose.type}
          id={compose.id}
          targetLabel={compose.label}
          initial={composeInitial}
          onClose={() => setCompose(null)}
          onSaved={() => loadSummaries()}
          onDeleted={() => loadSummaries()}
        />
      )}
    </>
  );
}
