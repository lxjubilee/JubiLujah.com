'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  adminListReviews, adminReports, adminAnalytics, adminModerate, adminHistory,
  reviewDate, REASON_LABELS,
  type AdminReviewRow, type ModerationAction,
} from '@/lib/reviews';

// ============================================================================
// Admin review-moderation dashboard (§11) + analytics (§19). Tabs: Reported
// queue, all reviews (searchable/filterable), and the analytics overview.
// Every action calls /api/admin/reviews/:id/moderate (admin-only, audited).
// ============================================================================

type Tab = 'reports' | 'all' | 'analytics';
const ACTIONS: ModerationAction[] = ['approve', 'hide', 'reject', 'restore', 'delete'];

function ReviewRow({ row, onAction }: { row: AdminReviewRow; onAction: (id: string, action: ModerationAction) => void }) {
  const [history, setHistory] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);

  const toggleHistory = async () => {
    if (!open && history === null) {
      try { const r = await adminHistory(row.id); setHistory(r.items); } catch { setHistory([]); }
    }
    setOpen((o) => !o);
  };

  return (
    <div className="mod-row">
      <div className="mod-row-main">
        <div className="mod-row-top">
          <span className={`rv-status rv-status-${row.status}`}>{row.status}</span>
          {row.deleted_at && <span className="rv-status rv-status-deleted">deleted</span>}
          {row.open_reports > 0 && <span className="mod-flag">⚑ {row.open_reports} report{row.open_reports === 1 ? '' : 's'}</span>}
          <span className="mod-stars">{'★'.repeat(row.stars)}{'☆'.repeat(5 - row.stars)}</span>
          <span className="mod-target">{row.target_type}: {row.target_title || row.target_id}</span>
        </div>
        {row.title && <div className="mod-title">{row.title}</div>}
        {row.body && <div className="mod-body">{row.body}</div>}
        <div className="mod-meta">
          by <strong>{row.author_name}</strong> <span className="rv-muted">({row.author_email})</span>
          <span className="rv-dot">·</span> {reviewDate(row.created_at)}
          <span className="rv-dot">·</span> 👍 {row.helpful_count}
          <button className="rv-textbtn" onClick={toggleHistory} type="button">{open ? 'Hide history' : 'History'}</button>
        </div>
        {open && (
          <div className="mod-history">
            {history && history.length === 0 && <div className="rv-muted">No moderation history.</div>}
            {history && history.map((h) => (
              <div key={h.id} className="mod-history-row">
                <strong>{h.action}</strong>
                {h.prev_status && <> {h.prev_status} → {h.new_status}</>}
                {h.reason && <> — “{h.reason}”</>}
                <span className="rv-muted"> · {h.moderator_name || 'system'} · {new Date(h.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="mod-row-actions">
        {ACTIONS.map((a) => (
          <button key={a} className={`rv-btn rv-btn-sm mod-act mod-act-${a}`} type="button" onClick={() => onAction(row.id, a)}>{a}</button>
        ))}
      </div>
    </div>
  );
}

export default function ModerationDashboard() {
  const { loading, authenticated, hasRole } = useAuth();
  const [tab, setTab] = useState<Tab>('reports');
  const [rows, setRows] = useState<AdminReviewRow[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const isAdmin = authenticated && hasRole('admin');

  const loadAll = useCallback(() => {
    setBusy(true);
    adminListReviews({ q, status: statusFilter, include_deleted: true, limit: 50 })
      .then((r) => setRows(r.items)).catch(() => setRows([])).finally(() => setBusy(false));
  }, [q, statusFilter]);

  const loadReports = useCallback(() => {
    setBusy(true);
    adminReports().then((r) => setReports(r.items)).catch(() => setReports([])).finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === 'all') loadAll();
    else if (tab === 'reports') loadReports();
    else adminAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
  }, [tab, isAdmin, loadAll, loadReports]);

  const act = async (id: string, action: ModerationAction) => {
    const reason = action === 'reject' || action === 'hide' || action === 'delete'
      ? (window.prompt(`Reason for "${action}" (optional):`) || undefined) : undefined;
    try {
      await adminModerate(id, { action, reason });
      if (tab === 'all') loadAll(); else if (tab === 'reports') loadReports();
    } catch { /* surfaced by row state staying */ }
  };

  if (loading) return <div className="rv-empty">Loading…</div>;
  if (!isAdmin) return <div className="rv-empty">You need administrator access to view the moderation dashboard.</div>;

  return (
    <div className="mod-dash">
      <h1 className="mod-h1">Review Moderation</h1>
      <div className="mod-tabs">
        <button className={`mod-tab${tab === 'reports' ? ' active' : ''}`} onClick={() => setTab('reports')} type="button">Reported</button>
        <button className={`mod-tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')} type="button">All Reviews</button>
        <button className={`mod-tab${tab === 'analytics' ? ' active' : ''}`} onClick={() => setTab('analytics')} type="button">Analytics</button>
      </div>

      {tab === 'reports' && (
        <div className="mod-list">
          {busy && reports.length === 0 && <div className="rv-empty">Loading…</div>}
          {!busy && reports.length === 0 && <div className="rv-empty">No open reports. 🎉</div>}
          {reports.map((rp) => (
            <div className="mod-report" key={rp.id}>
              <div className="mod-report-head">
                <span className="mod-flag">⚑ {REASON_LABELS[rp.reason as keyof typeof REASON_LABELS] || rp.reason}</span>
                <span className="rv-muted">reported by {rp.reporter_name} · {new Date(rp.created_at).toLocaleString()}</span>
              </div>
              {rp.detail && <div className="mod-report-detail">“{rp.detail}”</div>}
              <div className="mod-report-review">
                <span className="mod-stars">{'★'.repeat(rp.stars)}{'☆'.repeat(5 - rp.stars)}</span>
                {rp.title && <strong> {rp.title}</strong>}
                {rp.body && <div className="mod-body">{rp.body}</div>}
                <div className="mod-meta">by {rp.author_name} · {rp.target_type} · status: {rp.review_status}</div>
              </div>
              <div className="mod-row-actions">
                {ACTIONS.map((a) => (
                  <button key={a} className={`rv-btn rv-btn-sm mod-act mod-act-${a}`} type="button" onClick={() => act(rp.review_id, a)}>{a}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'all' && (
        <>
          <div className="mod-filters">
            <input className="rv-input" placeholder="Search title, body, or author…" value={q}
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadAll()} />
            <select className="rv-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
              <option value="rejected">Rejected</option>
              <option value="pending">Pending</option>
            </select>
            <button className="rv-btn rv-btn-primary rv-btn-sm" type="button" onClick={loadAll}>Search</button>
          </div>
          <div className="mod-list">
            {busy && rows.length === 0 && <div className="rv-empty">Loading…</div>}
            {!busy && rows.length === 0 && <div className="rv-empty">No reviews match.</div>}
            {rows.map((row) => <ReviewRow key={row.id} row={row} onAction={act} />)}
          </div>
        </>
      )}

      {tab === 'analytics' && analytics && (
        <div className="mod-analytics">
          <div className="mod-stat-grid">
            <div className="rv-contrib-card"><div className="rv-contrib-num">{analytics.platform.average ?? '—'}</div><div className="rv-contrib-lbl">Avg platform rating</div></div>
            <div className="rv-contrib-card"><div className="rv-contrib-num">{(analytics.platform.total_ratings || 0).toLocaleString()}</div><div className="rv-contrib-lbl">Total ratings</div></div>
            <div className="rv-contrib-card"><div className="rv-contrib-num">{(analytics.platform.total_reviews || 0).toLocaleString()}</div><div className="rv-contrib-lbl">Total reviews</div></div>
          </div>
          <div className="mod-analytics-cols">
            <AnalyticsList title="Highest-rated albums" rows={analytics.highest_rated_albums} render={(r: any) => `${r.title || r.target_id} — ★${r.avg_stars} (${r.rating_count})`} />
            <AnalyticsList title="Highest-rated songs" rows={analytics.highest_rated_songs} render={(r: any) => `${r.title || r.target_id} — ★${r.avg_stars} (${r.rating_count})`} />
            <AnalyticsList title="Most-reviewed albums" rows={analytics.most_reviewed_albums} render={(r: any) => `${r.title || r.target_id} — ${r.review_count} reviews`} />
            <AnalyticsList title="Most-reviewed songs" rows={analytics.most_reviewed_songs} render={(r: any) => `${r.title || r.target_id} — ${r.review_count} reviews`} />
            <AnalyticsList title="Most active reviewers" rows={analytics.most_active_reviewers} render={(r: any) => `${r.display_name} — ${r.contributions} (${r.reviews} reviews)`} />
            <AnalyticsList title="Most helpful reviews" rows={analytics.most_helpful_reviews} render={(r: any) => `👍 ${r.helpful_count} — ${r.title || r.target_title || r.target_id} by ${r.author_name}`} />
          </div>
          <div className="mod-trend">
            <h3>Ratings &amp; reviews over time (90 days)</h3>
            <div className="mod-trend-bars">
              {(analytics.over_time || []).map((d: any) => (
                <div key={d.day} className="mod-trend-bar" title={`${d.day}: ${d.ratings} ratings, ${d.reviews} reviews`}>
                  <span style={{ height: `${Math.min(100, d.ratings * 6)}px` }} />
                </div>
              ))}
              {(!analytics.over_time || analytics.over_time.length === 0) && <span className="rv-muted">No activity in the last 90 days.</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsList({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => string }) {
  return (
    <div className="mod-alist">
      <h3>{title}</h3>
      {(!rows || rows.length === 0) && <div className="rv-muted">No data yet.</div>}
      <ol>{(rows || []).map((r, i) => <li key={i}>{render(r)}</li>)}</ol>
    </div>
  );
}
