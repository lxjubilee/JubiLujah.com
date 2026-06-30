'use client';
import { useEffect, useState } from 'react';
import StarRating from './StarRating';
import { useAuth } from './AuthProvider';
import {
  getContributions, getMyReviews, reviewDate,
  type Contributions, type MyReview, type TargetType,
} from '@/lib/reviews';

// ============================================================================
// "My Contributions" profile section (§13). Shows the signed-in user's rating
// and review activity plus a list of their own reviews. Rendered on the
// account page.
// ============================================================================

type MyReviewRow = MyReview & { target_type: TargetType; target_id: string };

export default function MyContributions() {
  const { authenticated, loading } = useAuth();
  const [stats, setStats] = useState<Contributions | null>(null);
  const [reviews, setReviews] = useState<MyReviewRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    Promise.all([getContributions(), getMyReviews()])
      .then(([c, r]) => { setStats(c); setReviews(r); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, [authenticated]);

  if (loading || !authenticated) return null;

  const cards: Array<{ label: string; value: number }> = stats ? [
    { label: 'Albums rated', value: stats.albums_rated },
    { label: 'Songs rated', value: stats.songs_rated },
    { label: 'Reviews written', value: stats.reviews_written },
    { label: 'Helpful votes received', value: stats.helpful_received },
    { label: 'Total contributions', value: stats.total_contributions },
  ] : [];

  return (
    <section className="rv-contrib">
      <h2 className="rv-contrib-h">My Contributions</h2>
      <div className="rv-contrib-cards">
        {cards.map((c) => (
          <div className="rv-contrib-card" key={c.label}>
            <div className="rv-contrib-num">{c.value.toLocaleString()}</div>
            <div className="rv-contrib-lbl">{c.label}</div>
          </div>
        ))}
      </div>

      <h3 className="rv-contrib-sub">Your reviews</h3>
      {ready && reviews.length === 0 && <p className="rv-muted">You haven&apos;t written any reviews yet.</p>}
      <div className="rv-contrib-list">
        {reviews.map((r) => (
          <div className="rv-contrib-review" key={r.id}>
            <div className="rv-contrib-review-head">
              <StarRating value={r.stars} size="sm" />
              {r.title && <span className="rv-item-title">{r.title}</span>}
              <span className={`rv-status rv-status-${r.status}`}>{r.status}</span>
            </div>
            {r.body && <p className="rv-item-text">{r.body}</p>}
            <div className="rv-item-meta">
              <span className="rv-pill">{r.target_type}</span>
              <span className="rv-dot">·</span>
              <span>{reviewDate(r.created_at)}</span>
              {r.helpful_count > 0 && <><span className="rv-dot">·</span><span>👍 {r.helpful_count}</span></>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
