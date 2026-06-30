'use client';
import StarRating from './StarRating';
import type { ReviewSummary } from '@/lib/reviews';

// ============================================================================
// Per-song rating shown in the album track list (§3, §6). Compact: star
// indicator + rating count, plus a "Rate Song" affordance. Rendered inside a
// clickable track row, so its container must stop click propagation.
// ============================================================================

interface Props {
  summary: ReviewSummary | null;
  onRate: () => void;
}

export default function SongRatingControl({ summary, onRate }: Props) {
  const avg = summary?.average ?? null;
  const count = summary?.rating_count ?? 0;
  const rated = !!summary?.mine;

  return (
    <span className="rv-song" onClick={(e) => e.stopPropagation()}>
      <StarRating value={avg ?? 0} size="sm" />
      <span className="rv-song-count">
        {count > 0 ? `(${count.toLocaleString()})` : '(0)'}
      </span>
      <button
        type="button"
        className={`rv-song-rate${rated ? ' rated' : ''}`}
        onClick={onRate}
        title={rated ? 'Edit your rating' : 'Rate this song'}
      >
        {rated ? '★ Your rating' : 'Rate'}
      </button>
    </span>
  );
}
