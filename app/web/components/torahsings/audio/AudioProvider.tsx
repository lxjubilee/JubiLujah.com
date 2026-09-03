'use client';

/**
 * The audio engine.
 *
 * One <audio> element lives at the root of the app, so a song keeps playing
 * while the visitor moves between the hero, an album page, and the articles.
 * Playback position is persisted per track and restored on return — a listener
 * who leaves in the middle of "The Fourth Day Choir" comes back to it.
 *
 * Sources come from the Jubilee CDN. See lib/media.ts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { resolveAudio } from '@/lib/torahsings/media';

export interface PlayableTrack {
  /** Stable, e.g. "creation:3". Keys the saved playback position. */
  id: string;
  title: string;
  /** e.g. "Creation" — rendered after the middot. */
  subtitle: string;
  src: string;
  /** Seeds the waveform. Usually the track id. */
  seed: string;
  /** Where clicking the now-playing label goes. */
  href?: string;
}

interface AudioContextValue {
  current: PlayableTrack | null;
  playing: boolean;
  /** Seconds. */
  time: number;
  /** Seconds. 0 until metadata loads. */
  duration: number;
  /** 0–1. */
  progress: number;
  /** True when the element is fetching enough to begin. */
  loading: boolean;
  /** 0–1 output volume. */
  volume: number;
  /** When true, the current track repeats instead of advancing. */
  loop: boolean;
  /** When true, advancing picks a random track from the queue. */
  shuffle: boolean;
  setVolume: (v: number) => void;
  toggleLoop: () => void;
  toggleShuffle: () => void;
  /** Skip to the next track in the queue (random when shuffle is on). */
  next: () => void;
  /** Restart the current track, or step to the previous one if near its start. */
  prev: () => void;
  play: (track: PlayableTrack, queue?: PlayableTrack[]) => void;
  /** Toggles the given track: starts it, or pauses/resumes if it is current. */
  toggle: (track: PlayableTrack, queue?: PlayableTrack[]) => void;
  pause: () => void;
  seekTo: (fraction: number) => void;
  stop: () => void;
  /** Start an album's queue from track one — or pause/resume if already on it. */
  startAlbum: (queue: PlayableTrack[]) => void;
  isCurrent: (id: string) => boolean;
}

const POSITIONS_KEY = 'torah-sings.positions';
const SAVE_EVERY_MS = 4000;

const AudioCtx = createContext<AudioContextValue | null>(null);

/** Just the stable launch action, split out so lists of tiles can subscribe to
 *  it without re-rendering on every timeupdate. */
const AudioActionsCtx = createContext<{ startAlbum: (queue: PlayableTrack[]) => void } | null>(null);

type Positions = Record<string, number>;

function readPositions(): Positions {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(POSITIONS_KEY) ?? '{}') as Positions;
  } catch {
    return {};
  }
}

function writePosition(id: string, seconds: number) {
  try {
    const all = readPositions();
    if (seconds < 3) delete all[id];
    else all[id] = Math.floor(seconds);
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — position simply will not persist */
  }
}

/**
 * RE-ENTRANT ON PURPOSE. TorahSingsShell's own comment states the invariant:
 * mounting two providers "would give a visitor two transports fighting over one
 * <audio>". Until now that invariant was only a note — nothing enforced it, and
 * the opposite failure was the live one: the reading surfaces
 * (/learn-hebrew/[slug], /hebraic-christianity/[slug]) are shared routes that
 * render on the JubileePraise tenant, where no shell mounts a provider at all.
 * `useAudio` threw, and ~390 long-form articles answered HTTP 500 to every
 * reader and every crawler that followed a link from their index pages.
 *
 * A route can now wrap itself in <AudioProvider> unconditionally and be correct
 * on BOTH tenants: where a provider already exists above it (the Torah Sings
 * shell) this one steps aside and the shell's single transport stays the only
 * one; where none does (JubileePraise) it supplies the missing one. The
 * invariant is now enforced by the component instead of remembered by the
 * caller — which is what makes wrapping safe to do at every such route.
 */
export function AudioProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(AudioCtx);
  if (inherited) return <>{children}</>;
  return <AudioTransport>{children}</AudioTransport>;
}

function AudioTransport({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const queueRef = useRef<PlayableTrack[]>([]);
  const lastSaveRef = useRef(0);
  /** Mirror of `current`, so the stable actions can read it without deps. */
  const currentRef = useRef<PlayableTrack | null>(null);

  const [current, setCurrent] = useState<PlayableTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [loop, setLoop] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  /** Mirror of `shuffle`, so queue-advance logic can read it without deps. */
  const shuffleRef = useRef(false);

  /** Set output volume (0–1) and mirror it onto the element immediately. */
  const setVolume = useCallback((v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const toggleLoop = useCallback(() => setLoop((l) => !l), []);
  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);

  useEffect(() => {
    shuffleRef.current = shuffle;
  }, [shuffle]);

  /** Index in the current queue of the track after `id` (random when shuffling). */
  const advanceIndex = (queue: PlayableTrack[], id: string | undefined): number => {
    const idx = queue.findIndex((t) => t.id === id);
    if (shuffleRef.current && queue.length > 1) {
      let r = idx;
      while (r === idx) r = Math.floor(Math.random() * queue.length);
      return r;
    }
    return idx + 1;
  };

  // Keep the element's volume/loop in sync with state (and across track loads).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume, current]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loop;
  }, [loop, current]);

  /** Start a track, optionally seeding a queue for auto-advance. */
  const play = useCallback((track: PlayableTrack, queue?: PlayableTrack[]) => {
    const el = audioRef.current;
    if (!el) return;

    const src = resolveAudio(track.src);
    if (!src) return;

    if (queue) queueRef.current = queue;

    const switching = current?.id !== track.id;
    if (switching) {
      setCurrent(track);
      setTime(0);
      setDuration(0);
      setLoading(true);
      el.src = src;
      el.load();
    }

    void el.play().catch(() => {
      // Autoplay was refused, or the source is unavailable. Stay honest.
      setPlaying(false);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(
    (track: PlayableTrack, queue?: PlayableTrack[]) => {
      if (current?.id === track.id) {
        if (playing) pause();
        else void audioRef.current?.play().catch(() => setPlaying(false));
        return;
      }
      play(track, queue);
    },
    [current?.id, playing, pause, play],
  );

  const seekTo = useCallback((fraction: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration === 0) return;
    el.currentTime = Math.min(1, Math.max(0, fraction)) * el.duration;
    setTime(el.currentTime);
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    el.load();
    queueRef.current = [];
    setCurrent(null);
    setPlaying(false);
    setTime(0);
    setDuration(0);
  }, []);

  /** Skip forward — next in the queue, or a random track when shuffling. */
  const next = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) return;
    const i = advanceIndex(queue, currentRef.current?.id);
    if (queue[i]) play(queue[i]);
  }, [play]);

  /** Restart the current track, or step back a track if within its first 3s. */
  const prev = useCallback(() => {
    const el = audioRef.current;
    if (el && el.currentTime > 3) {
      el.currentTime = 0;
      setTime(0);
      return;
    }
    const queue = queueRef.current;
    const idx = queue.findIndex((t) => t.id === currentRef.current?.id);
    const target = queue[idx - 1];
    if (target) play(target);
    else if (el) {
      el.currentTime = 0;
      setTime(0);
    }
  }, [play]);

  // Keep the ref current so `startAlbum` can stay dependency-free (stable).
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  /**
   * Launch an album from its first track. Stable across renders — reads live
   * state from refs/the element — so a page full of tiles can hold onto it
   * without re-rendering as the clock ticks. If a track from this same album is
   * already loaded, it just pauses/resumes instead of restarting.
   */
  const startAlbum = useCallback((queue: PlayableTrack[]) => {
    const el = audioRef.current;
    if (!el || queue.length === 0) return;
    queueRef.current = queue;

    const onThisAlbum = queue.some((t) => t.id === currentRef.current?.id);
    if (onThisAlbum) {
      if (el.paused) void el.play().catch(() => setPlaying(false));
      else el.pause();
      return;
    }

    const track = queue[0];
    const src = resolveAudio(track.src);
    if (!src) return;
    setCurrent(track);
    setTime(0);
    setDuration(0);
    setLoading(true);
    el.src = src;
    el.load();
    void el.play().catch(() => {
      setPlaying(false);
      setLoading(false);
    });
  }, []);

  /* ---- element event wiring ------------------------------------------- */

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => {
      setPlaying(true);
      setLoading(false);
    };
    const onPause = () => {
      setPlaying(false);
      if (current) writePosition(current.id, el.currentTime);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      // Restore where this listener left off, unless they were nearly done.
      if (current) {
        const saved = readPositions()[current.id];
        if (saved && saved > 3 && saved < el.duration - 5) {
          el.currentTime = saved;
          setTime(saved);
        }
      }
    };

    const onTimeUpdate = () => {
      setTime(el.currentTime);
      const now = performance.now();
      if (current && now - lastSaveRef.current > SAVE_EVERY_MS) {
        lastSaveRef.current = now;
        writePosition(current.id, el.currentTime);
      }
    };

    const onEnded = () => {
      if (current) writePosition(current.id, 0);
      const queue = queueRef.current;
      const idx = queue.findIndex((t) => t.id === current?.id);
      const nextTrack = idx >= 0 ? queue[advanceIndex(queue, current?.id)] : undefined;
      if (nextTrack) play(nextTrack);
      else setPlaying(false);
    };

    const onError = () => {
      setPlaying(false);
      setLoading(false);
    };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('waiting', onWaiting);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('loadedmetadata', onLoadedMetadata);
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('waiting', onWaiting);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('loadedmetadata', onLoadedMetadata);
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [current, play]);

  /* Save position when the tab goes away. */
  useEffect(() => {
    const save = () => {
      const el = audioRef.current;
      if (el && current && el.currentTime > 0) writePosition(current.id, el.currentTime);
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
    };
  }, [current]);

  /*
   * No surprise playback. If the browser restores this page from its
   * back/forward cache (a common "why is it suddenly playing when I came back?"
   * culprit), make sure the element stays paused — nothing sounds until the
   * visitor presses play.
   */
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        audioRef.current?.pause();
        setPlaying(false);
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const value = useMemo<AudioContextValue>(
    () => ({
      current,
      playing,
      loading,
      time,
      duration,
      progress: duration > 0 ? time / duration : 0,
      volume,
      loop,
      shuffle,
      setVolume,
      toggleLoop,
      toggleShuffle,
      next,
      prev,
      play,
      toggle,
      pause,
      seekTo,
      stop,
      startAlbum,
      isCurrent: (id: string) => current?.id === id,
    }),
    [current, playing, loading, time, duration, volume, loop, shuffle, setVolume, toggleLoop, toggleShuffle, next, prev, play, toggle, pause, seekTo, stop, startAlbum],
  );

  // Stable — only `startAlbum` (itself stable), so consumers never re-render.
  const actions = useMemo(() => ({ startAlbum }), [startAlbum]);

  return (
    <AudioActionsCtx.Provider value={actions}>
      <AudioCtx.Provider value={value}>
        {children}
        {/* The single element. Lives at the root so playback survives navigation. */}
        <audio ref={audioRef} preload="metadata" />
      </AudioCtx.Provider>
    </AudioActionsCtx.Provider>
  );
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used inside <AudioProvider>');
  return ctx;
}

/** Just the stable launch action — for long lists of album tiles. */
export function useAudioActions() {
  const ctx = useContext(AudioActionsCtx);
  if (!ctx) throw new Error('useAudioActions must be used inside <AudioProvider>');
  return ctx;
}
