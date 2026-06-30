'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';

interface Aggregate {
  count: number;
  average: number | null;
  distribution: Record<string, number>;
  mine: { stars: number; note: string | null } | null;
}

// Ratings widget (§9). Always renders the average as a percentage of 5 stars —
// honoring the "% never /100" display rule from the ops doc.
export default function Ratings({ type, id }: { type: string; id: string }) {
  const { authenticated, hasRole } = useAuth();
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [hover, setHover] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.get<Aggregate>(`/api/ratings/${type}/${id}`).then(setAgg).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type, id]);

  const rate = async (stars: number) => {
    setErr(null);
    try {
      const next = await api.put<Aggregate>(`/api/ratings/${type}/${id}`, { stars });
      setAgg(next);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save rating');
    }
  };

  const mine = agg?.mine?.stars || 0;
  const canRate = authenticated && hasRole('content_editor');
  const pct = agg?.average != null ? ((agg.average / 5) * 100).toFixed(1).replace(/\.0$/, '') : null;

  return (
    <div className="jv-ratings" data-ratings-target={`${type}:${id}`}>
      <div className="jv-stars" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`jv-star${(hover ? n <= hover : n <= mine) ? ' on' : ''}`}
            onMouseEnter={() => canRate && setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => canRate && rate(n)}
            disabled={!canRate}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
          >★</button>
        ))}
      </div>
      <div className="jv-ratings-summary">
        {pct != null
          ? <>★ {pct}% <span className="muted">({agg?.count} rating{agg?.count === 1 ? '' : 's'})</span></>
          : <span className="muted">No ratings yet</span>}
      </div>
      {!canRate && <div className="jv-ratings-hint muted">Sign in as a content editor to rate.</div>}
      {err && <div className="jv-ratings-err" style={{ color: 'var(--accent-peach)' }}>{err}</div>}
    </div>
  );
}
