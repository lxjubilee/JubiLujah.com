'use client';
import { create } from 'zustand';
import { useAuthGate } from './authGate';
import { useUpgradeModal } from './upgradeModal';
import { recordPlay, getSessionId } from '@/lib/analytics';
import { resolvePlayIntent } from '@/lib/subscription';

// ============================================================================
// Persistent player store (Build-Spec §13). Mounted once in the root layout so
// playback survives client-side navigation natively (the App Router keeps the
// layout — and the single <audio> element — mounted across route changes).
// ============================================================================
export interface PlayerSong {
  id: string;
  // Catalog song UUID (catalog.songs.id). Distinct from `id`, which some views
  // (e.g. the album page) set to a synthetic per-row key for queue/highlight.
  // Carried so features like "add to playlist" can reference the real song.
  songId?: string;
  title: string;
  artist?: string;
  album?: string;
  url: string | null;
  cover?: string | null;
  // Source page this song is played from (e.g. its album or playlist page). Used
  // by the footer "expand" control to open the page where the music is playing.
  href?: string;
}

export type LoopMode = 'off' | 'one' | 'source' | 'all';

interface PlayerState {
  audio: HTMLAudioElement | null;
  nowPlaying: PlayerSong | null;
  isPlaying: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  upNext: PlayerSong[];
  history: PlayerSong[];
  loopMode: LoopMode;
  shuffle: boolean;
  expanded: boolean;
  // When true (a resolved guest), starting playback is blocked and the sign-in
  // prompt is shown instead. Set by <PlaybackGate /> from the auth state.
  blockPlayback: boolean;
  // In-progress play being tracked for analytics (null between tracks).
  playTrack: { songId: string; startedAt: number; source: string } | null;
  // Free-plan preview cap (seconds). When set, FooterPlayer pauses the track at
  // this position and opens the upgrade prompt. null = no cap (full play).
  capSeconds: number | null;

  setAudio: (el: HTMLAudioElement | null) => void;
  setGate: (blocked: boolean) => void;
  beginPlay: () => void;
  endPlay: (completed: boolean) => void;
  playQueue: (songs: PlayerSong[], startIndex?: number) => void;
  play: (song: PlayerSong) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleLoop: () => void;
  toggleShuffle: () => void;
  setExpanded: (b: boolean) => void;
  snapshot: () => void;
  _sync: (partial: Partial<PlayerState>) => void;
}

const STORAGE_KEY = 'jvPlayerState';
const LOOP_MODES: LoopMode[] = ['off', 'one', 'source', 'all'];

function persist(s: PlayerState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      nowPlaying: s.nowPlaying, position: s.position, volume: s.volume,
      muted: s.muted, upNext: s.upNext, history: s.history, loopMode: s.loopMode,
      isPlaying: s.isPlaying, shuffle: s.shuffle,
    }));
  } catch { /* sessionStorage unavailable */ }
}

function restore(): Partial<PlayerState> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const s = JSON.parse(raw);
    return {
      nowPlaying: s.nowPlaying ?? null,
      position: typeof s.position === 'number' ? s.position : 0,
      volume: typeof s.volume === 'number' ? s.volume : 0.8,
      muted: !!s.muted,
      upNext: Array.isArray(s.upNext) ? s.upNext : [],
      history: Array.isArray(s.history) ? s.history : [],
      loopMode: LOOP_MODES.includes(s.loopMode) ? s.loopMode : 'off',
      isPlaying: !!s.isPlaying,
      shuffle: !!s.shuffle,
    };
  } catch { return {}; }
}

function load(audio: HTMLAudioElement | null, song: PlayerSong | null, autoplay: boolean) {
  if (!audio || !song || !song.url) return;
  if (audio.src !== song.url) audio.src = song.url;
  if (autoplay) audio.play().catch(() => {});
  if ('mediaSession' in navigator && song) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title, artist: song.artist || '', album: song.album || '',
        artwork: song.cover ? [{ src: song.cover, sizes: '300x300', type: 'image/webp' }] : [],
      });
    } catch { /* noop */ }
  }
}

export const usePlayer = create<PlayerState>((set, get) => ({
  audio: null,
  nowPlaying: null,
  isPlaying: false,
  position: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  upNext: [],
  history: [],
  loopMode: 'off',
  shuffle: false,
  expanded: false,
  blockPlayback: false,
  playTrack: null,
  capSeconds: null,

  setGate: (blocked) => set({ blockPlayback: blocked }),

  // ---- Analytics play tracking + Free-plan entitlement ------------------
  beginPlay: () => {
    const np = get().nowPlaying;
    if (!np || !np.songId) { set({ playTrack: null, capSeconds: null }); return; }
    const href = np.href || '';
    const source = href.includes('/playlist') ? 'playlist'
      : href.includes('/album') ? 'album'
      : href.includes('/search') ? 'search' : 'direct';
    set({ playTrack: { songId: np.songId, startedAt: Date.now(), source }, capSeconds: null });

    // Server-authoritative Free-plan check: ask whether THIS track plays in full
    // or is capped to a preview. Fails open (no cap) for paid users / signed-out
    // guests / errors. Guarded against the user skipping to another track first.
    const songId = np.songId;
    resolvePlayIntent(songId).then((intent) => {
      if (!intent) return;
      if (get().nowPlaying?.songId !== songId) return;
      if (intent.mode === 'limited') {
        useUpgradeModal.getState().arm(intent);
        set({ capSeconds: intent.preview_seconds || 60 });
      }
    }).catch(() => { /* fail open */ });
  },
  endPlay: (completed) => {
    const pt = get().playTrack;
    if (!pt) return;
    set({ playTrack: null });
    const audio = get().audio;
    const listened = Math.max(0, Math.round(audio?.currentTime || 0));
    if (listened < 1) return;   // ignore non-plays / immediate skips
    const duration = Math.round(get().duration || audio?.duration || 0);
    recordPlay({
      song_id: pt.songId,
      session_id: getSessionId(),
      source: pt.source,
      started_at: new Date(pt.startedAt).toISOString(),
      ended_at: new Date().toISOString(),
      listening_seconds: listened,
      duration_seconds: duration || undefined,
      completed,
      skipped: !completed,
    });
  },

  setAudio: (el) => {
    set({ audio: el });
    if (el) {
      const snap = restore();
      set(snap);
      el.volume = snap.muted ? 0 : (snap.volume ?? 0.8);
      if (snap.nowPlaying) {
        // Reload the saved track, seek to where it was, and — if it was playing
        // before the refresh — resume automatically so playback is uninterrupted.
        load(el, snap.nowPlaying, false);
        const onMeta = () => {
          try { el.currentTime = snap.position ?? 0; } catch { /* noop */ }
          // Don't auto-resume for a guest (e.g. session left over from a prior login).
          if (snap.isPlaying && !get().blockPlayback) el.play().catch(() => { /* autoplay may be blocked */ });
          el.removeEventListener('loadedmetadata', onMeta);
        };
        el.addEventListener('loadedmetadata', onMeta);
      }
    }
  },

  playQueue: (songs, startIndex = 0) => {
    if (get().blockPlayback) { useAuthGate.getState().show(); return; }
    const playable = songs.filter((s) => s.url);
    if (!playable.length) return;
    get().endPlay(false);
    const idx = Math.min(Math.max(startIndex, 0), playable.length - 1);
    const song = playable[idx];
    set({ nowPlaying: song, upNext: playable.slice(idx + 1), history: [], position: 0 });
    load(get().audio, song, true);
    get().beginPlay();
    persist(get());
  },

  play: (song) => {
    if (get().blockPlayback) { useAuthGate.getState().show(); return; }
    if (!song.url) return;
    get().endPlay(false);
    const { nowPlaying, history } = get();
    if (nowPlaying && nowPlaying.id !== song.id) set({ history: [...history, nowPlaying].slice(-200) });
    set({ nowPlaying: song, position: 0 });
    load(get().audio, song, true);
    get().beginPlay();
    persist(get());
  },

  togglePlay: () => {
    const { audio, nowPlaying } = get();
    if (!audio || !nowPlaying) return;
    if (audio.paused) get().resume(); else get().pause();
  },
  pause: () => { get().audio?.pause(); },
  resume: () => {
    if (get().blockPlayback) { useAuthGate.getState().show(); return; }
    get().audio?.play().catch(() => {});
  },

  next: () => {
    get().endPlay(false);
    const { audio, upNext, history, nowPlaying, loopMode, shuffle } = get();
    if (nowPlaying) set({ history: [...history, nowPlaying].slice(-200) });
    if (upNext.length) {
      // Shuffle: advance to a random track from the queue instead of the next in
      // order. The chosen track is removed; the rest of the queue is preserved.
      const idx = shuffle ? Math.floor(Math.random() * upNext.length) : 0;
      const song = upNext[idx];
      const rest = upNext.slice(0, idx).concat(upNext.slice(idx + 1));
      set({ nowPlaying: song, upNext: rest, position: 0 });
      load(audio, song, true);
      get().beginPlay();
    } else if (loopMode === 'all' && get().history.length) {
      const h = get().history.slice();
      const first = h.shift()!;
      set({ nowPlaying: first, upNext: h, history: [], position: 0 });
      load(audio, first, true);
      get().beginPlay();
    }
    persist(get());
  },

  prev: () => {
    const { audio, history, nowPlaying, upNext } = get();
    if (audio && audio.currentTime > 3) { get().seek(0); return; }
    if (!history.length) { get().seek(0); return; }
    get().endPlay(false);
    const prev = history[history.length - 1];
    set({
      nowPlaying: prev,
      history: history.slice(0, -1),
      upNext: nowPlaying ? [nowPlaying, ...upNext] : upNext,
      position: 0,
    });
    load(audio, prev, true);
    get().beginPlay();
    persist(get());
  },

  seek: (seconds) => {
    const { audio, duration } = get();
    if (!audio) return;
    let s = Math.max(0, seconds);
    if (duration && s > duration) s = duration;
    try { audio.currentTime = s; } catch { /* noop */ }
    set({ position: s });
  },

  setVolume: (v) => {
    const vol = Math.min(1, Math.max(0, v));
    const { audio } = get();
    if (audio) audio.volume = vol;
    set({ volume: vol, muted: vol === 0 });
    persist(get());
  },

  toggleMute: () => {
    const { audio, muted, volume } = get();
    const nextMuted = !muted;
    if (audio) audio.volume = nextMuted ? 0 : volume;
    set({ muted: nextMuted });
  },

  cycleLoop: () => {
    const { loopMode, audio } = get();
    const next = LOOP_MODES[(LOOP_MODES.indexOf(loopMode) + 1) % LOOP_MODES.length];
    if (audio) audio.loop = next === 'one';
    set({ loopMode: next });
    persist(get());
  },

  toggleShuffle: () => {
    set({ shuffle: !get().shuffle });
    persist(get());
  },

  setExpanded: (b) => set({ expanded: b }),
  // Persist the live state (position + isPlaying + queue) so a page refresh can
  // resume exactly where it left off. Called on play/pause and just before unload.
  snapshot: () => persist(get()),
  _sync: (partial) => set(partial),
}));
