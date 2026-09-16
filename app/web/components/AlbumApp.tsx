'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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
import { albumBlurb } from '@/lib/albumBlurb';
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

/**
 * Keep a heading on ONE line by shrinking its font until it fits its box.
 *
 * CSS alone cannot promise this: `nowrap` stops the wrap but cuts a long title
 * off, and a viewport-based size is only right for an average title. So the
 * stylesheet sets the full size, and this measures the rendered line and scales
 * the font down by exactly the overflow — re-measured when the title changes
 * (the page switches albums in place) and whenever the box is resized. Never
 * below MIN_PX; the stylesheet's ellipsis is the backstop past that.
 */
const MIN_TITLE_PX = 20;
function useFitOneLine<T extends HTMLElement>(text: string) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';                       // back to the stylesheet's size
      const full = parseFloat(getComputedStyle(el).fontSize) || 42;
      const box = el.clientWidth;
      const need = el.scrollWidth;
      if (box > 0 && need > box) {
        el.style.fontSize = `${Math.max(MIN_TITLE_PX, Math.floor(full * (box / need) * 0.98))}px`;
      }
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el.parentElement || el);
    // Web fonts can land after the first measurement and change the width.
    document.fonts?.ready?.then(fit).catch(() => {});
    return () => ro?.disconnect();
  }, [text]);
  return ref;
}

function fmt(s: number) {
  if (!isFinite(s) || s <= 0) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

// artistRole is still accepted (and still passed by app/album/page.tsx) but no
// longer shown: the banner names the album now, not the persona's role.
// staffPicks: every Staff Pick code, not a flag — the page switches albums in
// place, so the banner has to know for whichever album is current.
export default function AlbumApp({ artist, artistSlug = '', heroFallback = '', albums, initial, similar = [], support = {}, heroImages = {}, staffPicks = [] }: { artist: string; artistSlug?: string; artistRole?: string; heroFallback?: string; albums: AlbumLink[]; initial: CurrentAlbum; similar?: SimilarAlbum[]; support?: Record<string, string>; heroImages?: Record<string, string>; staffPicks?: string[] }) {
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

  // The album's supporting image: a wide companion photograph built from this
  // album's own cover art (see lib/support.ts). Keyed by code so it follows an
  // in-place album switch.
  //
  // It is the HERO's backdrop, and the persona banner is what it falls back to.
  // Both go through the same `--persona-img` custom property the stylesheet
  // already reads, so the gradient, the sizing and the right-edge anchoring are
  // whatever .x-hero has always done — this changes the picture, not the design.
  // Picture order: the album's 16:9 hero (as on the home page), then its support
  // image, then the persona banner. Both album pictures are top-anchored.
  const albumPicture = heroImages[current.code] || support[current.code] || '';
  const supportImage = albumPicture;
  const heroImage = albumPicture || heroFallback;
  const heroStyle = { ['--persona-img' as string]: heroImage ? `url('${heroImage}')` : 'none' } as CSSProperties;


  // ---- Public ratings (§2/§3/§6): album + per-song summaries -------------
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});
  const [compose, setCompose] = useState<{ type: TargetType; id: string; label: string } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [codes, setCodes] = useState<{ album: { token: string } | null; songs: { n: number; token: string }[] } | null>(null);
  const didAutoplay = useRef(false);

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

  // ---- The banner ----------------------------------------------------------
  // Rendered by both return paths below, so a studio album a guest cannot see
  // still gets the same header it gets today.
  //
  // WHAT IT SAYS (owner direction, 2026-09-16): the ALBUM, not the artist. It
  // used to be the artist's name over their persona role, which told a visitor
  // who they were looking at but not what. Now: the album title, one sentence
  // about it, a Play Album button with the artist named beside it, and the genres
  // as pills — everything else is one scroll down. The button is the same
  // control as the big round one in the track panel (onBigPlay), so the two can
  // never disagree about whether this album is playing.
  //
  // THE MODIFIER CLASS IS ONLY FOR THE SUPPORTING IMAGE, and it exists because
  // the two pictures crop differently. The hero is far wider than it is tall, so
  // `cover` scales any backdrop to the width and lets the height overflow — with
  // the default `center` anchoring, that overflow is taken evenly off the top and
  // the bottom, which on a 16:9 photograph is where the faces are. The persona
  // banners were composed for this box and still want centre; an album photograph
  // was not, so it is anchored to the top instead. See .x-hero--support.
  const titleRef = useFitOneLine<HTMLHeadingElement>(current.title);
  const canPlay = current.tracks.some((t) => t.url);
  const blurb = albumBlurb(current.code, current.title, artist, current.trackCount || current.tracks.length, current.tracks[0]?.title);
  const genres = [gp.primary, gp.secondary].filter(Boolean);
  // LAYOUT (owner direction, second pass, 2026-09-16): everything sits LOW in the
  // picture, top to bottom — the title on ONE line, the description, then one
  // bottom line holding Play Album, the genres and the artist, in that order.
  const hero = (
    <header className={`x-hero${supportImage ? ' x-hero--support' : ''}`} style={heroStyle}>
      <div className="x-container">
        <div className="x-inner x-album-inner">
          {/* 🔴 ONE LINE, ALWAYS (owner: "very, very important"). It may run the
              full width of the picture, and it shrinks to fit rather than wrap
              or be cut off: see useFitOneLine. */}
          <h1 ref={titleRef} className="x-album-title" lang={albumBcp47(current.code)} title={current.title}>{current.title}</h1>
          <p className="x-sub x-album-desc">{blurb}</p>
          <div className="x-album-actions">
            {canPlay && (
              <button type="button" className="x-album-play" onClick={onBigPlay} aria-pressed={!bigPlayPaused}>
                <TransportIcon paused={bigPlayPaused} />
                <span>{!bigPlayPaused ? 'Pause' : albumIsActive ? 'Resume' : 'Play Album'}</span>
              </button>
            )}
            {(genres.length > 0 || staffPicks.includes(current.code)) && (
              <ul className="x-album-genres" aria-label="Genres">
                {/* Only for an album a team member chose (content/staff-picks.json). */}
                {staffPicks.includes(current.code) && <li className="x-album-pill x-album-pill--staff">Staff Pick</li>}
                {genres.map((g) => <li key={g} className="x-album-pill">{g}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
      {/* THE ARTIST, the home hero's way (owner, 2026-09-16): huge and faint,
          right-justified in the corner, reaching as far left as the name needs.
          It replaced "by <artist>" on the bottom line. */}
      {artistSlug
        ? <a className="x-album-ident" href={`/artist/${artistSlug}`} aria-label={`More from ${artist}`}>{artist}</a>
        : <span className="x-album-ident" aria-hidden="true">{artist}</span>}
    </header>
  );

  // Song QR deep-link: /album?c=<code>&t=<n> auto-plays track n on arrival. Album
  // QR codes carry no `t`, so they just open the album (no autoplay). Best-effort:
  // browsers may require a tap, after which the track is already cued.
  useEffect(() => {
    if (didAutoplay.current) return;
    const raw = new URLSearchParams(window.location.search).get('t');
    if (!raw) return;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n)) return;
    const idx = current.tracks.findIndex((x) => x.n === n);
    const i = idx >= 0 ? idx : n - 1;
    if (i >= 0 && i < current.tracks.length && current.tracks[i]?.url) { didAutoplay.current = true; playFrom(i); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the album's scannable QR (+ per-song QRs). Public endpoint, no auth.
  const openQr = () => {
    setQrOpen(true); setCodes(null);
    fetch(`/api/redirector/codes/${encodeURIComponent(current.code)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setCodes(d)).catch(() => {});
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
      <>
        {hero}
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
      </>
    );
  }

  return (
    <>
      {hero}
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
                <div className="jv-center-title" lang={albumBcp47(current.code)} onClick={openQr}
                  title="Show this album's QR code" style={{ cursor: 'pointer' }}>{current.title}</div>
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
              <button className="jv-follow" type="button" onClick={openQr} title="Show album QR code">◧ QR</button>
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
                    <span className="jv-tdur">{t.url ? fmt(durations[id]) : '-'}</span>
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

      {qrOpen && (
        <div onClick={() => setQrOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#161622', border: '1px solid rgba(255,255,255,.1)', borderRadius: 14, padding: 20, maxWidth: 460, width: '100%', maxHeight: '85vh', overflowY: 'auto', color: '#e8e8e8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>QR code: {current.title}</h3>
              <button onClick={() => setQrOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#b7b7b7', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {!codes && <p className="notice">Loading…</p>}
            {codes && !codes.album && <p className="notice">This album doesn’t have a QR code yet.</p>}
            {codes && codes.album && (
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/qr/${codes.album.token}.svg?qz=2`} alt="Album QR code" width={150} height={150} style={{ background: '#fff', borderRadius: 8, padding: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 13, color: '#b7b7b7', margin: '2px 0 8px' }}>Scan to open this album. It won’t auto-play.</p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
                    <a href={`/qr/${codes.album.token}.svg`} download>SVG</a>
                    <a href={`/qr/${codes.album.token}.png?size=1024`} download>PNG</a>
                  </div>
                </div>
              </div>
            )}
            {codes && codes.songs.length > 0 && (
              <>
                <div style={{ margin: '18px 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', color: '#8f8f9f' }}>Song QR codes: scan to play that song</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 12 }}>
                  {codes.songs.map((s) => {
                    const tr = current.tracks.find((x) => x.n === s.n);
                    return (
                      <div key={s.token} style={{ textAlign: 'center', minWidth: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/qr/${s.token}.svg?qz=2`} alt="" width={72} height={72} style={{ background: '#fff', borderRadius: 6, padding: 0, width: '100%', height: 'auto' }} />
                        <div style={{ fontSize: 11, color: '#b7b7b7', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.n}. {tr?.title || ''}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {codes && codes.album && codes.songs.length === 0 && (
              <p className="notice" style={{ marginTop: 14, fontSize: 12 }}>Per-song QR codes are being minted.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
