import type { CSSProperties, ReactNode } from 'react';
import { starsFor } from '@/lib/torahsings/seed';
import styles from './CelestialArt.module.css';

interface CelestialArtProps {
  /** Seeds the star scatter. Use the album/article slug so it never shifts. */
  seed: string;
  /** 0–360. Vary per album. */
  hue: number;
  /** Rendered as "celestial art · [topic]" in a faint mono caption. */
  topic: string;
  /** A single Hebrew letter, faint, bottom-right. */
  glyph?: string;
  /** CSS aspect-ratio, e.g. '1 / 1' or '16 / 10'. */
  ratio?: string;
  /** Adds the thin elliptical ring — for the featured hero orb. */
  ring?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * The celestial art placeholder. Deterministic: the same seed always scatters
 * the same stars, on the server and on the client alike.
 */
export function CelestialArt({
  seed,
  hue,
  topic,
  glyph,
  ratio = '16 / 10',
  ring = false,
  className,
  children,
}: CelestialArtProps) {
  // (b) 3–5 tiny star dots, composed into layered radial-gradients.
  const starLayers = starsFor(seed)
    .map(
      (s) =>
        `radial-gradient(${s.size}px ${s.size}px at ${s.x}% ${s.y}%, rgba(232,217,168,${s.opacity}), transparent 62%)`,
    )
    .join(', ');

  return (
    <div
      className={[styles.art, className].filter(Boolean).join(' ')}
      style={{ '--hue': hue, aspectRatio: ratio } as CSSProperties}
    >
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.stars} style={{ backgroundImage: starLayers }} aria-hidden="true" />
      {ring && <div className={styles.ring} aria-hidden="true" />}
      <div className={styles.orb} aria-hidden="true" />
      {glyph && (
        <span className={`glyph ${styles.watermark}`} aria-hidden="true">
          {glyph}
        </span>
      )}
      <span className={styles.caption} aria-hidden="true">
        celestial art · {topic.toLowerCase()}
      </span>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
