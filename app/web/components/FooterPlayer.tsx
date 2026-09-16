'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// What the always-visible bar plays when pressed before anything is loaded: the
// JubileePraise flagship, the album the brand is named after (pinned first on the
// home page, and the first Staff Pick).
const IDLE_ALBUM = 'JEIM1069EN';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { usePlayer } from '@/stores/player';
import { pingNowPlaying, stopNowPlaying } from '@/lib/analytics';
import { useUpgradeModal } from '@/stores/upgradeModal';
import AddToPlaylist from '@/components/AddToPlaylist';
import PlayerWave from '@/components/PlayerWave';
import { useAuth } from '@/components/AuthProvider';
import { useLikes } from '@/stores/likes';
import { useAuthGate } from '@/stores/authGate';
import { reactionStream } from '@/lib/reactionStream';

const I = {
  play: 'M7 5v14l12-7z',
  pause: 'M6 5h4v14H6zm8 0h4v14h-4z',
  prev: 'M6 5h2v14H6zm12.5 0L9 12l9.5 7z',
  next: 'M16 5h2v14h-2zM5.5 5L15 12l-9.5 7z',
  loop: 'M17 17H7v-3l-4 4 4 4v-3h12v-6h-2v4zM7 7h10v3l4-4-4-4v3H5v6h2V7z',
  shuffle: 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.66 6.83l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-2.8-2.71z',
  vol: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z',
  mute: 'M16.5 12A4.5 4.5 0 0014 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25a7.06 7.06 0 01-2.25 1.21v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73 4.27 3z',
  expand: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  close: 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  note: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  thumb: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
};
const Svg = ({ d, cls }: { d: string; cls?: string }) => (
  <svg viewBox="0 0 24 24" className={cls}><path d={d} /></svg>
);
const LOOP_GLYPH: Record<string, string> = { off: '', one: '1', source: 'S', all: '∞' };

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}

export default function FooterPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Whether the upgrade prompt has already been shown for the CURRENT capped
  // track. Prevents the timeupdate handler from re-opening the modal on every
  // tick (which made it impossible to dismiss). Reset when the track changes.
  const promptedRef = useRef(false);
  const p = usePlayer();
  const router = useRouter();

  // Register the singleton audio element + bind events once.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    usePlayer.getState().setAudio(el);
    const sync = usePlayer.getState()._sync;
    const snapshot = usePlayer.getState().snapshot;
    // Persist play/pause immediately, and throttle position saves to ~once/3s so a
    // refresh resumes near the exact spot without thrashing sessionStorage.
    let lastSave = 0;
    const onPlay = () => { sync({ isPlaying: true }); snapshot(); };
    const onPause = () => { sync({ isPlaying: false }); snapshot(); };
    const onTime = () => {
      // Free-plan preview cap: pause at the limit and prompt to upgrade (BRD
      // §Free Plan Restrictions). Re-pausing on every tick past the cap also
      // blocks a manual resume, so the preview can't be bypassed.
      const cap = usePlayer.getState().capSeconds;
      if (cap != null && el.currentTime >= cap) {
        el.pause();
        try { el.currentTime = cap; } catch { /* noop */ }
        sync({ isPlaying: false, position: cap });
        // Show the prompt only ONCE per capped track — so the user can dismiss it
        // (the pause above still enforces the preview if they try to resume).
        if (!promptedRef.current) { promptedRef.current = true; useUpgradeModal.getState().show(); }
        return;
      }
      sync({ position: el.currentTime || 0 });
      const now = Date.now();
      if (now - lastSave > 3000) { lastSave = now; snapshot(); }
    };
    const onMeta = () => sync({ duration: el.duration || 0 });
    // Capture the exact position/state the instant the page unloads (refresh/close).
    const onPageHide = () => { usePlayer.getState().endPlay(false); snapshot(); };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    const onVol = () => sync({ volume: el.volume, muted: el.volume === 0 });
    const onEnded = () => {
      const st = usePlayer.getState();
      st.endPlay(true);   // a finished track is a completed play
      if (st.loopMode === 'one') { el.currentTime = 0; el.play().catch(() => {}); st.beginPlay(); }
      else st.next();
    };
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('volumechange', onVol);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('volumechange', onVol);
      el.removeEventListener('ended', onEnded);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, []);

  // Keyboard shortcuts (skip when typing).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = document.activeElement as HTMLElement | null;
      if (t && (/(input|textarea|select)/i.test(t.tagName) || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = usePlayer.getState();
      switch (e.key) {
        case ' ': e.preventDefault(); st.togglePlay(); break;
        case 'ArrowLeft': e.preventDefault(); st.seek(st.position - 10); break;
        case 'ArrowRight': e.preventDefault(); st.seek(st.position + 10); break;
        case 'ArrowUp': e.preventDefault(); st.setVolume(st.volume + 0.05); break;
        case 'ArrowDown': e.preventDefault(); st.setVolume(st.volume - 0.05); break;
        case 'n': case 'N': st.next(); break;
        case 'p': case 'P': st.prev(); break;
        case 'm': case 'M': st.toggleMute(); break;
        case 'l': case 'L': st.cycleLoop(); break;
        case 's': case 'S': st.toggleShuffle(); break;
        case 'Escape': if (st.expanded) st.setExpanded(false); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // THE BAR IS ALWAYS THERE (owner, 2026-09-16): "it should launch with the footer
  // ... sticky and it should always display when on this website, without fail."
  // Until 2026-09-16 it mounted only once a track was loaded, which made the home
  // hero change height on the first press of Play. So the space is reserved
  // permanently, and the heroes (.jp-hero, the album banner) fit exactly between
  // the header and this bar from the first paint.
  useEffect(() => {
    document.body.classList.add('jv-has-player');
    return () => document.body.classList.remove('jv-has-player');
  }, []);
  // New track → allow the upgrade prompt to show again if it gets capped.
  useEffect(() => { promptedRef.current = false; }, [p.nowPlaying]);

  const song = p.nowPlaying;

  // IDLE: nothing loaded yet. The bar still offers to play: today's flagship album.
  const [idleBusy, setIdleBusy] = useState(false);
  const startIdle = async () => {
    if (idleBusy) return;
    setIdleBusy(true);
    try {
      const album = await api.get<{ title: string; artistName?: string; tracks: { id: string; title: string; url: string | null }[] }>(`/api/albums/${IDLE_ALBUM}`);
      const songs = album.tracks.filter((t) => t.url).map((t) => ({
        id: t.id, songId: t.id, title: t.title, artist: album.artistName, album: album.title,
        url: t.url, cover: `/cover/${IDLE_ALBUM}.png`, href: `/album?c=${IDLE_ALBUM}`,
      }));
      if (songs.length) p.playQueue(songs, 0);
    } catch { /* nothing to start; the bar simply waits */ } finally {
      setIdleBusy(false);
    }
  };

  // Real-time "now playing" heartbeat → admin Active Listeners. Pings on play and
  // every 25s; clears presence on pause/stop/track-change. Fire-and-forget.
  useEffect(() => {
    const sid = song?.songId;
    if (!sid || !p.isPlaying) { stopNowPlaying(); return; }
    pingNowPlaying(sid);
    const t = setInterval(() => pingNowPlaying(sid), 25000);
    return () => clearInterval(t);
  }, [song?.songId, p.isPlaying]);

  // 👍 LIKE and ♥ FAVORITE for the playing song (owner, 2026-09-16), so listeners
  // rate songs as they hear them. Each is held on the account (0034); the first 36
  // of either also build the listener's first playlist, server-side. Turning one
  // on sends the reaction stream up past the header; turning it off is quiet.
  const { authenticated } = useAuth();
  const ensureLikes = useLikes((s) => s.ensureLoaded);
  const toggleLike = useLikes((s) => s.toggle);
  const songId = song?.songId || '';
  const liked = useLikes((s) => (songId ? s.has('song', songId) : false));
  const favorite = useLikes((s) => (songId ? s.has('song', songId, 'favorite') : false));
  useEffect(() => { if (authenticated) ensureLikes(); }, [authenticated, ensureLikes]);
  const react = (e: React.MouseEvent<HTMLButtonElement>, kind: 'like' | 'favorite') => {
    if (!songId) return;
    if (!authenticated) {
      useAuthGate.getState().show(kind === 'favorite' ? 'Sign in to save your favorites' : 'Sign in to like songs');
      return;
    }
    const on = kind === 'favorite' ? favorite : liked;
    if (!on) reactionStream(e.currentTarget, kind === 'favorite' ? 'heart' : 'thumb');
    void toggleLike('song', songId, kind);
  };

  const pct = p.duration > 0 ? Math.min(100, Math.max(0, (p.position / p.duration) * 100)) : 0;
  const sub = [song?.artist, song?.album].filter(Boolean).join(' · ');

  const seekFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    p.seek(frac * (p.duration || 0));
  };

  return (
    <>
      {/* No crossOrigin: the CDN does not send Access-Control-Allow-Origin, and
          plain media playback does not need CORS (we don't use the Web Audio API).
          Setting crossOrigin="anonymous" would make the browser block the load. */}
      <audio ref={audioRef} id="jv-audio" preload="metadata" />

      <div className={`jv-player${song ? ' active' : ' idle'}${p.isPlaying ? ' jv-playing' : ''}`}>
        <PlayerWave />
        <div className="now">
          <div className="cover" onClick={() => router.push('/now-playing')} title="Open now-playing">
            {song?.cover ? <Image src={song.cover} alt="" width={60} height={60} /> : <Svg d={I.note} cls="placeholder-glyph" />}
          </div>
          <div className="meta">
            <div className="title">{song?.title || 'Ready to listen'}</div>
            <div className="sub">{song ? sub : 'Press play, or pick any album'}</div>
          </div>
        </div>

        <div className="ctrls">
          <div className="buttons">
            <button className={`react like${liked ? ' on' : ''}`} onClick={(e) => react(e, 'like')} title={liked ? 'Liked' : 'Like this song'} aria-label="Like" aria-pressed={liked} disabled={!songId}><Svg d={I.thumb} /></button>
            <button className="prev" onClick={() => p.prev()} title="Previous (P)" aria-label="Previous" disabled={!song}><Svg d={I.prev} /></button>
            <button className="play" onClick={() => (song ? p.togglePlay() : void startIdle())} title="Play/Pause (Space)" aria-label="Play"><Svg d={p.isPlaying ? I.pause : I.play} /></button>
            <button className="next" onClick={() => p.next()} title="Next (N)" aria-label="Next" disabled={!song}><Svg d={I.next} /></button>
            <button className={`react fav${favorite ? ' on' : ''}`} onClick={(e) => react(e, 'favorite')} title={favorite ? 'In your favorites' : 'Add to favorites'} aria-label="Favorite" aria-pressed={favorite} disabled={!songId}><Svg d={I.heart} /></button>
          </div>
          <div className="progress-row">
            <div className="times"><span className="cur">{fmt(p.position)}</span> / <span className="dur">{fmt(p.duration)}</span></div>
            <div className="progress" onClick={seekFromClick} role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)}>
              <div className="fill" style={{ width: `${pct}%` }} />
              <div className="scrub-thumb" style={{ left: `${pct}%` }} />
            </div>
          </div>
        </div>

        <div className="right">
          {song?.songId ? <AddToPlaylist songId={song.songId} /> : null}
          <button className={`shuffle${p.shuffle ? ' active' : ''}`} onClick={() => p.toggleShuffle()} title={`Shuffle: ${p.shuffle ? 'on' : 'off'} (S)`} aria-label="Shuffle" aria-pressed={p.shuffle}>
            <Svg d={I.shuffle} />
          </button>
          <button className={`loop${p.loopMode !== 'off' ? ' active' : ''}`} onClick={() => p.cycleLoop()} title={`Loop: ${p.loopMode} (L)`} aria-label="Loop mode">
            <Svg d={I.loop} />
            {LOOP_GLYPH[p.loopMode] ? <span className="loop-badge">{LOOP_GLYPH[p.loopMode]}</span> : null}
          </button>
          <div className="volume" title="Volume (↑/↓, M)">
            <button className="mute-btn" onClick={() => p.toggleMute()} aria-label="Mute"><Svg d={p.muted || p.volume === 0 ? I.mute : I.vol} /></button>
            <input type="range" min={0} max={1} step={0.01} value={p.muted ? 0 : p.volume} onChange={(e) => p.setVolume(parseFloat(e.target.value))} aria-label="Volume" />
          </div>
          <button className="expand" onClick={() => router.push('/now-playing')} title="Open now-playing page" aria-label="Open now-playing page"><Svg d={I.expand} /></button>
        </div>
      </div>

      <div className={`jv-player-overlay${p.expanded ? ' open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) p.setExpanded(false); }}>
        <button className="close" onClick={() => p.setExpanded(false)} aria-label="Close"><Svg d={I.close} /></button>
        <div className="ov-main">
          <div className="ov-cover">{song?.cover ? <Image src={song.cover} alt="" width={360} height={360} /> : <Svg d={I.note} />}</div>
          <div className="ov-info">
            <div className="ov-title">{song?.title || '-'}</div>
            <div className="ov-artist">{song?.artist || ''}</div>
            <div className="ov-album">{song?.album || ''}</div>
          </div>
        </div>
      </div>
    </>
  );
}
