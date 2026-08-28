'use client';

import { useState } from 'react';
import styles from './StarRating.module.css';

/**
 * Star rating display + picker, ported from JubileePraise's StarRating.
 *
 *  - Display mode (default): renders `value` (0..5, may be fractional) as a
 *    filled overlay clipped to the exact percentage, so 4.8 reads as 4.8.
 *  - Interactive mode (onChange set): five clickable stars with hover preview.
 */
interface Props {
  /** Current rating (display) or the resting value the stars fill to (interactive). */
  value: number;
  /** When set, the widget becomes interactive. */
  onChange?: (n: number) => void;
  /**
   * This user's OWN rating, for the inline pickers whose resting `value` is the
   * crowd average rather than a choice. Only `aria-checked` reads it: filling to
   * 4 because the album averages 4.2 must not announce "4 stars, selected" to a
   * visitor who has never rated it. Defaults to `value` (the dialog, where the
   * resting value IS the choice).
   */
  selected?: number;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export function StarRating({ value, onChange, selected, size = 'md', ariaLabel = 'Rating' }: Props) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';

  if (!interactive) {
    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
    return (
      <span
        className={`${styles.stars} ${styles[size]}`}
        role="img"
        aria-label={`${value.toFixed(1)} out of 5 stars`}
      >
        <span className={styles.bg}>★★★★★</span>
        <span className={styles.fill} style={{ width: `${pct}%` }}>
          ★★★★★
        </span>
      </span>
    );
  }

  const shown = hover || value;
  const checked = selected ?? value;
  return (
    <span
      className={`${styles.stars} ${styles[size]} ${styles.interactive}`}
      role="radiogroup"
      aria-label={ariaLabel}
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`${styles.starBtn} ${n <= shown ? styles.on : ''}`}
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          role="radio"
          aria-checked={n === checked}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
