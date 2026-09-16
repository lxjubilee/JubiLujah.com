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

  // No empty counts: a song nobody has rated shows only its Rate button — not
  // five grey stars and "(0)", which reads as unpopular rather than new.
  const hasRatings = count > 0 && avg != null;

  return (
    <span className="rv-song" onClick={(e) => e.stopPropagation()}>
      {hasRatings && (
        <>
          <StarRating value={avg} size="sm" />
          <span className="rv-song-count">({count.toLocaleString()})</span>
        </>
      )}
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
