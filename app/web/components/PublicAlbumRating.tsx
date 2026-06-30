'use client';
import StarRating from './StarRating';
import type { ReviewSummary } from '@/lib/reviews';

// ============================================================================
// Album-page rating summary (§6). Shows ONLY aggregates — average, count, and
// the visual star indicator — never individual reviews. Provides the "Rate
// Album" action and a link to the dedicated Ratings & Reviews page.
// ============================================================================

interface Props {
  summary: ReviewSummary | null;
  code: string;
  onRate: () => void;
}

export default function PublicAlbumRating({ summary, code, onRate }: Props) {
  const avg = summary?.average ?? null;
  const count = summary?.rating_count ?? 0;
  const mine = summary?.mine ?? null;

  return (
    <div className="rv-album-rating">
      <div className="rv-album-rating-main">
        <StarRating value={avg ?? 0} size="md" />
        {avg != null
          ? <span className="rv-avg">{avg.toFixed(1)}</span>
          : <span className="rv-avg rv-avg-none">—</span>}
        <span className="rv-count">
          {count > 0
            ? <>Based on {count.toLocaleString()} rating{count === 1 ? '' : 's'}</>
            : 'No ratings yet — be the first'}
        </span>
      </div>
      <div className="rv-album-rating-actions">
        <button className="rv-btn rv-btn-primary rv-btn-sm" type="button" onClick={onRate}>
          {mine ? 'Edit your rating' : 'Rate this Album'}
        </button>
        <a className="rv-link" href={`/album/reviews?code=${encodeURIComponent(code)}`}>
          Ratings &amp; Reviews{summary && summary.review_count > 0 ? ` (${summary.review_count})` : ''} →
        </a>
      </div>
    </div>
  );
}
