import type { CSSProperties } from 'react';
import styles from './Particles.module.css';

/**
 * The JubileePraise drifting-embers layer: a faint scatter of gold, coral, and rose
 * motes rising behind everything. Positions are fixed (not random) so the server
 * and client render the same markup — no hydration mismatch. Hidden on small
 * screens and stilled under `prefers-reduced-motion` (see globals.css).
 */
const TONES = ['gold', 'peach', 'rose'] as const;

// left %, size px, duration s, delay s
const SPECS: Array<[number, number, number, number]> = [
  [4, 5, 17, 0],
  [11, 3, 22, 6],
  [18, 6, 15, 2],
  [26, 4, 19, 9],
  [33, 3, 24, 4],
  [41, 5, 16, 11],
  [48, 4, 21, 1],
  [55, 6, 18, 7],
  [62, 3, 23, 3],
  [69, 5, 15, 13],
  [76, 4, 20, 5],
  [83, 6, 17, 10],
  [89, 3, 25, 2],
  [95, 5, 19, 8],
  [8, 4, 21, 14],
  [37, 6, 16, 15],
  [58, 3, 24, 12],
  [72, 4, 18, 16],
];

export function Particles() {
  return (
    <div className={styles.particles} aria-hidden="true">
      {SPECS.map(([left, size, dur, delay], i) => (
        <span
          key={i}
          className={`${styles.particle} ${styles[TONES[i % TONES.length]]}`}
          style={
            {
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
