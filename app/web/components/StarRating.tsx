'use client';
import { useState } from 'react';

// ============================================================================
// Star rating display + picker.
//   - Display mode (default): renders `value` (0..5, may be fractional) as a
//     filled overlay clipped to the exact percentage, so 4.8 reads as 4.8.
//   - Interactive mode (onChange set): 5 clickable stars with hover preview.
// Visual styling lives in styles/widgets/reviews.css (.rv-stars).
// ============================================================================

interface Props {
  value: number;                 // current rating (display) or selected value (interactive)
  onChange?: (n: number) => void; // when set, the widget is interactive
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export default function StarRating({ value, onChange, size = 'md', ariaLabel = 'Rating' }: Props) {
  const [hover, setHover] = useState(0);
  const interactive = typeof onChange === 'function';

  if (!interactive) {
    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
    return (
      <span className={`rv-stars rv-stars-${size}`} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
        <span className="rv-stars-bg">★★★★★</span>
        <span className="rv-stars-fill" style={{ width: `${pct}%` }}>★★★★★</span>
      </span>
    );
  }

  const shown = hover || value;
  return (
    <span className={`rv-stars rv-stars-${size} rv-stars-interactive`} role="radiogroup" aria-label={ariaLabel}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`rv-star-btn${n <= shown ? ' on' : ''}`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange!(n)}
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >★</button>
      ))}
    </span>
  );
}
