'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clock } from '@/lib/torahsings/format';
import { useAudio } from './AudioProvider';
import styles from './NowPlayingBar.module.css';

/** Material-style icon paths used across the transport (24×24 viewBox). */
const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  prev: 'M6 6h2v12H6zm3.5 6l8.5 6V6z',
  next: 'M6 18l8.5-6L6 6v12zM16 6v12h2V6z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  shuffle:
    'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.12L14.5 20H20v-5.5l-2.04 2.04-3.13-3.12z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z',
  volume: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z',
  fullscreen: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
} as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/**
 * The footer transport, styled after InspireManna's `.player`: an 80px bar in a
 * `cover+meta | prev·play·next + progress | add·shuffle·repeat·volume·fullscreen`
 * grid, with an accent top edge that becomes a flowing rainbow line while a track
 * plays. It appears only once a track is loaded.
 */
export function NowPlayingBar() {
  const {
    current,
    playing,
    time,
    duration,
    progress,
    volume,
    loop,
    shuffle,
    toggle,
    seekTo,
    setVolume,
    toggleLoop,
    toggleShuffle,
    next,
    prev,
  } = useAudio();

  const router = useRouter();
  const barRef = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState(false);

  /* While the transport is on screen it's fixed over the bottom of the page, so
     pad the document by its height — this keeps the footer and any bottom
     content clear of it, the way JubileePraise's body.jv-has-player does. */
  useEffect(() => {
    if (!current) return;
    document.body.style.paddingBottom = '80px';
    return () => {
      document.body.style.paddingBottom = '';
    };
  }, [current]);

  if (!current) return null;

  const seekAt = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    seekTo((clientX - r.left) / r.width);
  };

  const noteIcon = (
    <span className={styles.note} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
      </svg>
    </span>
  );

  return (
    <div
      className={`${styles.player} ${playing ? styles.isPlaying : ''}`}
      role="region"
      aria-label="Now playing"
    >
      {/* Left — cover + meta */}
      <div className={styles.now}>
        {current.href ? (
          <Link href={current.href} className={styles.cover} aria-label={current.title}>
            {noteIcon}
          </Link>
        ) : (
          <span className={styles.cover}>{noteIcon}</span>
        )}
        <div className={styles.meta}>
          {current.href ? (
            <Link href={current.href} className={styles.title}>
              {current.title}
            </Link>
          ) : (
            <span className={styles.title}>{current.title}</span>
          )}
          <span className={styles.sub}>{current.subtitle}</span>
        </div>
      </div>

      {/* Center — prev · play · next, then progress */}
      <div className={styles.ctrls}>
        <div className={styles.buttons}>
          <button type="button" className={styles.btn} onClick={prev} aria-label="Previous track">
            <Icon d={ICON.prev} />
          </button>

          <button
            type="button"
            className={styles.play}
            onClick={() => toggle(current)}
            aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
            aria-pressed={playing}
          >
            <Icon d={playing ? ICON.pause : ICON.play} />
          </button>

          <button type="button" className={styles.btn} onClick={next} aria-label="Next track">
            <Icon d={ICON.next} />
          </button>
        </div>

        <div className={styles.progressRow}>
          <span className={styles.times}>{clock(time)}</span>
          <div
            ref={barRef}
            className={styles.progress}
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={duration || 0}
            aria-valuenow={time}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekAt(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons & 1) seekAt(e.clientX);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') seekTo(Math.min(1, progress + 0.05));
              if (e.key === 'ArrowLeft') seekTo(Math.max(0, progress - 0.05));
            }}
          >
            <span className={styles.fill} style={{ width: `${progress * 100}%` }} />
            <span className={styles.thumb} style={{ left: `${progress * 100}%` }} />
          </div>
          <span className={styles.times}>{duration ? clock(duration) : '—:—'}</span>
        </div>
      </div>

      {/* Right — add · shuffle · repeat · volume · fullscreen */}
      <div className={styles.right}>
        <button
          type="button"
          className={`${styles.opt} ${saved ? styles.active : ''}`}
          onClick={() => setSaved((s) => !s)}
          aria-label="Add to My List"
          aria-pressed={saved}
        >
          <Icon d={ICON.add} />
        </button>

        <button
          type="button"
          className={`${styles.opt} ${shuffle ? styles.active : ''}`}
          onClick={toggleShuffle}
          aria-label="Shuffle"
          aria-pressed={shuffle}
        >
          <Icon d={ICON.shuffle} />
        </button>

        <button
          type="button"
          className={`${styles.opt} ${loop ? styles.active : ''}`}
          onClick={toggleLoop}
          aria-label="Repeat this track"
          aria-pressed={loop}
        >
          <Icon d={ICON.repeat} />
          {loop && <span className={styles.loopBadge}>1</span>}
        </button>

        <div className={styles.volume}>
          <span className={styles.volIcon} aria-hidden="true">
            <Icon d={ICON.volume} />
          </span>
          <input
            className={styles.volRange}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>

        <button
          type="button"
          className={styles.opt}
          onClick={() => current.href && router.push(current.href)}
          disabled={!current.href}
          aria-label="Open the album page"
        >
          <Icon d={ICON.fullscreen} />
        </button>
      </div>
    </div>
  );
}
