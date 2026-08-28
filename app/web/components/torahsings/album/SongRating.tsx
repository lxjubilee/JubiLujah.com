'use client';

import { StarRating } from '@/components/torahsings/system/StarRating';
import type { ReviewSummary } from '@/lib/reviews';
import styles from './SongRating.module.css';

/**
 * Per-song rating shown in the album track list, ported from JubileePraise's
 * SongRatingControl. Compact: star picker + rating count, plus a "Rate"
 * affordance. It renders inside a clickable track row, so the container stops
 * click propagation — otherwise rating a song would start playing it.
 *
 * The stars are the same interactive StarRating the album box and the dialog
 * use: hovering previews the star under the cursor, and clicking one carries
 * that value into the composer rather than making you pick it twice.
 *
 * The summary comes straight from production.review_summaries via
 * POST /api/reviews/summaries, batched for the whole album by the caller.
 */
interface Props {
  summary: ReviewSummary | null;
  /** Song title, for the picker's accessible name. */
  label: string;
  /** A star click passes the chosen value; the "Rate" pill passes nothing. */
  onRate: (stars?: number) => void;
}

export function SongRating({ summary, label, onRate }: Props) {
  const avg = summary?.average ?? 0;
  const count = summary?.rating_count ?? 0;
  const mine = summary?.mine?.stars ?? 0;
  const rated = !!summary?.mine;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <span className={styles.song} onClick={(e) => e.stopPropagation()}>
      {/* Resting state shows YOUR stars once you have rated, else the crowd
          average — the same precedence the album box uses. */}
      <StarRating
        value={mine || avg}
        selected={mine}
        onChange={(n) => onRate(n)}
        size="sm"
        ariaLabel={`Rate ${label}`}
      />
      <span className={styles.count}>({count.toLocaleString()})</span>
      <button
        type="button"
        className={`${styles.rate} ${rated ? styles.rated : ''}`}
        onClick={() => onRate()}
        title={rated ? 'Edit your rating' : 'Rate this song'}
      >
        {rated ? '★ Your rating' : 'Rate'}
      </button>
    </span>
  );
}
