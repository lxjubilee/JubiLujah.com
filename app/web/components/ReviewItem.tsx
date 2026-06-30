'use client';
import { useState } from 'react';
import StarRating from './StarRating';
import ReportDialog from './ReportDialog';
import { useAuth } from './AuthProvider';
import { toggleHelpful, reviewDate, type ReviewItem as TReviewItem } from '@/lib/reviews';

// ============================================================================
// One review card (§7). Shows author, rating, title, comment, date, a helpful
// vote (§9), and a report action (§10). The author's own card offers Edit.
// ============================================================================

interface Props {
  review: TReviewItem;
  onEdit?: (r: TReviewItem) => void;   // present only for the caller's own review
}

export default function ReviewItem({ review, onEdit }: Props) {
  const { authenticated } = useAuth();
  const [helpful, setHelpful] = useState(review.helpful_count);
  const [voted, setVoted] = useState(review.voted);
  const [voting, setVoting] = useState(false);
  const [reporting, setReporting] = useState(false);

  const vote = async () => {
    if (!authenticated || voting) return;
    setVoting(true);
    try {
      const res = await toggleHelpful(review.id);
      setHelpful(res.helpful_count);
      setVoted(res.voted);
    } catch { /* ignore transient */ } finally {
      setVoting(false);
    }
  };

  const initials = (review.author.display_name || '?').trim().charAt(0).toUpperCase();

  return (
    <article className="rv-item">
      <div className="rv-item-avatar" aria-hidden="true">
        {review.author.avatar_url
          ? <img src={review.author.avatar_url} alt="" />
          : <span>{initials}</span>}
      </div>
      <div className="rv-item-body">
        <div className="rv-item-head">
          <StarRating value={review.stars} size="sm" />
          {review.title && <span className="rv-item-title">{review.title}</span>}
        </div>
        {review.body && <p className="rv-item-text">{review.body}</p>}
        <div className="rv-item-meta">
          <span className="rv-item-author">— {review.author.display_name}</span>
          <span className="rv-dot">·</span>
          <span className="rv-item-date">{reviewDate(review.created_at)}</span>
          {review.edited && <span className="rv-item-edited">(edited)</span>}
        </div>
        <div className="rv-item-actions">
          <button
            type="button"
            className={`rv-helpful${voted ? ' voted' : ''}`}
            onClick={vote}
            disabled={!authenticated || voting}
            title={authenticated ? 'Mark as helpful' : 'Sign in to vote'}
          >
            👍 Helpful{helpful > 0 ? ` (${helpful})` : ''}
          </button>
          {review.mine && onEdit && (
            <button type="button" className="rv-textbtn" onClick={() => onEdit(review)}>Edit</button>
          )}
          {authenticated && !review.mine && (
            <button type="button" className="rv-textbtn rv-report" onClick={() => setReporting(true)}>Report</button>
          )}
        </div>
      </div>
      {reporting && <ReportDialog reviewId={review.id} onClose={() => setReporting(false)} />}
    </article>
  );
}
