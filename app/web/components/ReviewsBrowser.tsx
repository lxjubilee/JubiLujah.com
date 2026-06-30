'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import StarRating from './StarRating';
import ReviewItem from './ReviewItem';
import ReviewComposer from './ReviewComposer';
import { useAuth } from './AuthProvider';
import {
  getSummary, listReviews, distPct,
  SORT_LABELS,
  type ReviewSummary, type ReviewItem as TReviewItem, type ReviewSort, type Target, type MyReview,
} from '@/lib/reviews';

// ============================================================================
// The dedicated Ratings & Reviews page body (§7, §8). Renders the album
// summary (overall rating, totals, distribution), a review list filterable by
// All / Album / a specific song, sortable four ways, with helpful votes,
// reporting, and the caller's own write/edit flow.
// ============================================================================

export interface SongRef { id: string; n: number; title: string }
export interface AlbumRef {
  id: string; code: string; title: string; artistName: string; artistSlug: string; cover: string;
}

const PAGE_SIZE = 10;

export default function ReviewsBrowser({ album, songs }: { album: AlbumRef; songs: SongRef[] }) {
  const { authenticated } = useAuth();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [filter, setFilter] = useState<string>('all');     // 'all' | 'album' | songId
  const [sort, setSort] = useState<ReviewSort>('recent');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<TReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [songSummaries, setSongSummaries] = useState<Record<string, ReviewSummary>>({});

  // Compose modal state
  const [compose, setCompose] = useState<{ type: Target['type']; id: string; label: string; initial: MyReview | null } | null>(null);

  const songById = useMemo(() => Object.fromEntries(songs.map((s) => [s.id, s])), [songs]);

  // Targets for the current filter.
  const targets: Target[] = useMemo(() => {
    if (filter === 'all') return [{ type: 'album', id: album.id }, ...songs.map((s) => ({ type: 'song' as const, id: s.id }))];
    if (filter === 'album') return [{ type: 'album', id: album.id }];
    return [{ type: 'song', id: filter }];
  }, [filter, album.id, songs]);

  const loadSummary = useCallback(() => {
    getSummary('album', album.id).then(setSummary).catch(() => {});
  }, [album.id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Load the review list whenever filter / sort / page change.
  useEffect(() => {
    let live = true;
    setLoading(true);
    listReviews(targets, { sort, page, limit: PAGE_SIZE })
      .then((res) => { if (!live) return; setItems(res.items); setTotal(res.total); setHasMore(res.has_more); })
      .catch(() => { if (live) { setItems([]); setTotal(0); setHasMore(false); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [targets, sort, page]);

  // Fetch a song's summary lazily (for the compose button's pre-fill / "mine").
  const ensureSongSummary = useCallback(async (songId: string): Promise<ReviewSummary | null> => {
    if (songSummaries[songId]) return songSummaries[songId];
    try {
      const s = await getSummary('song', songId);
      setSongSummaries((m) => ({ ...m, [songId]: s }));
      return s;
    } catch { return null; }
  }, [songSummaries]);

  // Open the composer for whatever is currently in focus (album, or selected song).
  const openComposer = useCallback(async () => {
    if (!authenticated) { window.location.href = '/signin'; return; }
    if (filter !== 'all' && filter !== 'album') {
      const s = await ensureSongSummary(filter);
      setCompose({ type: 'song', id: filter, label: songById[filter]?.title || 'this song', initial: s?.mine || null });
    } else {
      setCompose({ type: 'album', id: album.id, label: album.title, initial: summary?.mine || null });
    }
  }, [authenticated, filter, ensureSongSummary, songById, album.id, album.title, summary]);

  const onSaved = () => {
    loadSummary();
    setPage(1);
    // re-run list by nudging sort dependency
    setSort((s) => s);
    // force list refresh
    listReviews(targets, { sort, page: 1, limit: PAGE_SIZE })
      .then((res) => { setItems(res.items); setTotal(res.total); setHasMore(res.has_more); })
      .catch(() => {});
  };

  const total5 = summary?.rating_count || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rv-page">
      {/* ---- Album summary header (§7) ---- */}
      <section className="rv-summary">
        <div className="rv-summary-cover" style={{ backgroundImage: `url(${album.cover})` }} />
        <div className="rv-summary-info">
          <div className="rv-summary-eyebrow">Ratings &amp; Reviews</div>
          <h1 className="rv-summary-title">{album.title}</h1>
          <a className="rv-summary-artist" href={`/artist/${album.artistSlug}`}>{album.artistName}</a>

          <div className="rv-summary-score">
            <div className="rv-summary-big">{summary?.average != null ? summary.average.toFixed(1) : '—'}</div>
            <div className="rv-summary-stars">
              <StarRating value={summary?.average ?? 0} size="md" />
              <div className="rv-summary-counts">
                {(summary?.rating_count || 0).toLocaleString()} rating{summary?.rating_count === 1 ? '' : 's'}
                <span className="rv-dot">·</span>
                {(summary?.review_count || 0).toLocaleString()} review{summary?.review_count === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Distribution (§7) */}
          <div className="rv-dist">
            {([5, 4, 3, 2, 1] as const).map((star) => {
              const pct = summary ? distPct(summary.distribution, star, total5) : 0;
              return (
                <div className="rv-dist-row" key={star}>
                  <span className="rv-dist-label">{star} star</span>
                  <span className="rv-dist-bar"><span className="rv-dist-fill" style={{ width: `${pct}%` }} /></span>
                  <span className="rv-dist-pct">{pct}%</span>
                </div>
              );
            })}
          </div>

          <div className="rv-summary-actions">
            <button className="rv-btn rv-btn-primary" type="button" onClick={openComposer}>
              {summary?.mine ? 'Edit your review' : 'Write a review'}
            </button>
            <a className="rv-link" href={`/album?c=${encodeURIComponent(album.code)}`}>← Back to album</a>
          </div>
        </div>
      </section>

      {/* ---- Controls: filter (§7) + sort (§8) ---- */}
      <section className="rv-controls">
        <div className="rv-filter">
          <label htmlFor="rv-filter-sel">Show</label>
          <select id="rv-filter-sel" className="rv-input" value={filter} onChange={(e) => { setPage(1); setFilter(e.target.value); }}>
            <option value="all">All Reviews</option>
            <option value="album">Album Reviews</option>
            {songs.length > 0 && (
              <optgroup label="Song Reviews">
                {songs.map((s) => <option key={s.id} value={s.id}>{s.n}. {s.title}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        <div className="rv-sort">
          <label htmlFor="rv-sort-sel">Sort by</label>
          <select id="rv-sort-sel" className="rv-input" value={sort} onChange={(e) => { setPage(1); setSort(e.target.value as ReviewSort); }}>
            {(Object.keys(SORT_LABELS) as ReviewSort[]).map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select>
        </div>
      </section>

      {/* ---- Review list (§7) ---- */}
      <section className="rv-list">
        {loading && items.length === 0 && <div className="rv-empty">Loading reviews…</div>}
        {!loading && items.length === 0 && (
          <div className="rv-empty">No reviews yet for this selection. {authenticated ? 'Be the first to write one.' : <a href="/signin">Sign in</a>} </div>
        )}
        {items.map((r) => (
          <ReviewItem
            key={r.id}
            review={r}
            onEdit={r.mine ? (rev) => setCompose({
              type: rev.target_type, id: rev.target_id,
              label: rev.target_type === 'album' ? album.title : (songById[rev.target_id]?.title || 'this song'),
              initial: { id: rev.id, stars: rev.stars, title: rev.title, body: rev.body, status: 'published', helpful_count: rev.helpful_count, created_at: rev.created_at, edited: rev.edited },
            }) : undefined}
          />
        ))}

        {pageCount > 1 && (
          <div className="rv-pager">
            <button className="rv-btn rv-btn-ghost rv-btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} type="button">← Prev</button>
            <span className="rv-pager-info">Page {page} of {pageCount}</span>
            <button className="rv-btn rv-btn-ghost rv-btn-sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)} type="button">Next →</button>
          </div>
        )}
      </section>

      {compose && (
        <ReviewComposer
          type={compose.type}
          id={compose.id}
          targetLabel={compose.label}
          initial={compose.initial}
          onClose={() => setCompose(null)}
          onSaved={() => onSaved()}
          onDeleted={() => onSaved()}
        />
      )}
    </div>
  );
}
