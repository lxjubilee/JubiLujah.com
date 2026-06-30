'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import {
  getOverview, getTrends, getRatingAnalytics, getReviewAnalytics,
  getAlbumAnalytics, getSongAnalytics, getUserAnalytics, exportReport,
} from '@/lib/analytics';
import { api } from '@/lib/api';

// ============================================================================
// Media Analytics Dashboard (admin only). Tabs across the four analytics levels
// plus ratings/reviews/trends. Charts are dependency-free inline SVG.
// ============================================================================

type Tab = 'overview' | 'trends' | 'albums' | 'songs' | 'users' | 'ratings' | 'reviews';

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());
const money = (cents: number | null | undefined, currency = 'usd') =>
  (cents == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100));
const fmtHrs = (h: number | null | undefined) => (h == null ? '—' : `${h.toLocaleString()} h`);
// Traditional studio-production equivalent of the live catalog, by track count:
// 12 tracks = 8 months & $35,000, so per track = 8/12 month & 35000/12 dollars.
// Time is shown as "YEARS.MM" (integer years + 2-digit months, not decimal years).
function tradProductionLine(songs: number | null | undefined): string {
  const n = songs || 0;
  const totalMonths = Math.round((n * 8) / 12);
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const cost = Math.round((n * 35000) / 12);
  return `Traditional Studio Production: ~${years}.${String(months).padStart(2, '0')} years worth (~$${cost.toLocaleString('en-US')} costs)`;
}
function fmtDur(sec: number | null | undefined) {
  if (!sec) return '0:00';
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const dateStr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

// ---- Inline charts ---------------------------------------------------------
function LineChart({ points, color = 'var(--accent-gold)', height = 120 }: { points: { label: string; value: number }[]; color?: string; height?: number }) {
  if (!points.length) return <div className="an-empty">No data in range.</div>;
  const w = Math.max(points.length * 6, 320); const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * (w - 8) + 4;
  const y = (v: number) => height - 6 - (v / max) * (height - 16);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;
  return (
    <svg className="an-line" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img">
      <path d={area} fill={color} opacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" />
      {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.value)} r="2" fill={color}><title>{`${p.label}: ${p.value}`}</title></circle>)}
    </svg>
  );
}
function Bars({ points, color = 'var(--accent)' }: { points: { label: string; value: number }[]; color?: string }) {
  if (!points.length) return <div className="an-empty">No data.</div>;
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className="an-bars">
      {points.map((p, i) => (
        <div className="an-bar-col" key={i} title={`${p.label}: ${p.value}`}>
          <span className="an-bar" style={{ height: `${(p.value / max) * 100}%`, background: color }} />
          <span className="an-bar-lbl">{p.label}</span>
        </div>
      ))}
    </div>
  );
}
function TopList({ rows, render }: { rows: any[]; render: (r: any) => React.ReactNode }) {
  if (!rows?.length) return <div className="an-empty">No data yet.</div>;
  const max = Math.max(1, ...rows.map((r) => r.__v || 0));
  return (
    <ol className="an-toplist">
      {rows.map((r, i) => (
        <li key={i}><span className="an-toplist-bar" style={{ width: `${((r.__v || 0) / max) * 100}%` }} /><span className="an-toplist-tx">{render(r)}</span></li>
      ))}
    </ol>
  );
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---- Icons (inline, no dependency) -----------------------------------------
const ICN: Record<string, string> = {
  overview: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  trends: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  albums: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z',
  songs: 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z',
  users: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  star: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  reviews: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  dollar: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  play: 'M8 5v14l11-7z',
  pulse: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z',
  card: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z',
  disc: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm0-5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z',
};
const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);

export default function AnalyticsDashboard({ avgBestseller }: { avgBestseller?: number }) {
  const { loading, authenticated, hasRole } = useAuth();
  const isAdmin = authenticated && hasRole('admin');
  const [tab, setTab] = useState<Tab>('overview');

  const [overview, setOverview] = useState<any>(null);
  const [subs, setSubs] = useState<any>(null);
  const [trends, setTrends] = useState<any>(null);
  const [ratings, setRatings] = useState<any>(null);
  const [reviews, setReviews] = useState<any>(null);
  const [table, setTable] = useState<{ items: any[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Table filters (albums/songs/users)
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('plays');
  const [page, setPage] = useState(1);

  const loadTable = useCallback((which: 'albums' | 'songs' | 'users', p = page) => {
    setBusy(true);
    const params: any = { q: q || undefined, from: from || undefined, to: to || undefined, page: p, limit: 25 };
    if (which !== 'users') params.sort = sort;
    const fn = which === 'albums' ? getAlbumAnalytics : which === 'songs' ? getSongAnalytics : getUserAnalytics;
    fn(params).then((d) => setTable(d)).catch(() => setTable({ items: [], total: 0 })).finally(() => setBusy(false));
  }, [q, from, to, sort, page]);

  // Theme the page's vertical scrollbar while the dashboard is on screen, then
  // revert on unmount so the custom scrollbar stays scoped to /admin/analytics.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('an-scrollbar');
    return () => html.classList.remove('an-scrollbar');
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === 'overview') {
      if (!overview) getOverview().then(setOverview).catch(() => {});
      if (!subs) api.get('/api/admin/subscribers').then(setSubs).catch(() => {});
    } else if (tab === 'trends') getTrends(90).then(setTrends).catch(() => {});
    else if (tab === 'ratings') getRatingAnalytics().then(setRatings).catch(() => {});
    else if (tab === 'reviews') getReviewAnalytics().then(setReviews).catch(() => {});
    else if (tab === 'albums' || tab === 'songs' || tab === 'users') { setTable(null); setPage(1); loadTable(tab, 1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  if (loading) return <div className="an-wrap"><div className="an-empty">Loading…</div></div>;
  if (!isAdmin) {
    return (
      <div className="an-wrap">
        <div className="an-403">
          <h1>403 — Access Denied</h1>
          <p>The Media Analytics Dashboard is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: ICN.overview }, { key: 'trends', label: 'Trends', icon: ICN.trends },
    { key: 'albums', label: 'Albums', icon: ICN.albums }, { key: 'songs', label: 'Songs', icon: ICN.songs },
    { key: 'users', label: 'Users', icon: ICN.users }, { key: 'ratings', label: 'Ratings', icon: ICN.star }, { key: 'reviews', label: 'Reviews', icon: ICN.reviews },
  ];

  return (
    <div className="an-wrap">
      <div className="an-head">
        <div>
          <h1 className="an-h1">Media Analytics</h1>
          <p className="an-sub">Catalog, audience, revenue &amp; engagement — at a glance.</p>
        </div>
        <button className="an-btn" onClick={() => window.print()} type="button">🖨 Print / PDF</button>
      </div>
      <div className="an-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`an-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} type="button"><Icon className="an-tab-ic" d={t.icon} />{t.label}</button>
        ))}
      </div>

      {/* ---- OVERVIEW ---- */}
      {tab === 'overview' && overview && (
        <div className="an-ov">
          {/* Headline: everything currently LIVE (playable) on the production site. */}
          <div className="an-live-banner">
            <span className="an-live-ic"><Icon d={ICN.disc} /></span>
            <div className="an-live-headwrap">
              <div className="an-live-head">Live on the Website</div>
              <div className="an-live-trad">{tradProductionLine(overview.available_songs)}</div>
            </div>
            <div className="an-live-stats">
              <div className="an-live-stat">
                <div className="an-live-n">{fmt(overview.available_albums)}</div>
                <div className="an-live-l">Live Albums</div>
              </div>
              <div className="an-live-sep" />
              <div className="an-live-stat">
                <div className="an-live-n">{fmt(overview.available_songs)}</div>
                <div className="an-live-l">Live Songs</div>
              </div>
              <div className="an-live-sep" />
              <div className="an-live-stat">
                <div className="an-live-n">{avgBestseller ? `${avgBestseller.toFixed(2)}%` : '—'}</div>
                <div className="an-live-l">Avg Bestseller Score</div>
              </div>
            </div>
          </div>

          {/* Hero KPIs — the numbers that matter most, scannable at a glance. */}
          <div className="an-hero">
            <Kpi tone="violet" icon={ICN.users} label="Subscribers" value={subs ? fmt(subs.count) : '—'}
                 hint={subs ? `${fmt(subs.count)} on paid plans` : 'paid plans'} />
            <Kpi tone="green" icon={ICN.dollar} label="Monthly Revenue" value={subs ? money(subs.monthly_total_cents, subs.currency) : '—'}
                 hint="recurring / month" />
            <Kpi tone="gold" icon={ICN.pulse} label="Active Listeners" value={fmt(overview.active_users)}
                 hint={`of ${fmt(overview.total_users)} registered · last 30d`} />
            <Kpi tone="peach" icon={ICN.play} label="Total Plays" value={fmt(overview.total_plays)}
                 hint={`${fmtHrs(overview.total_listening_hours)} listened`} />
          </div>

          {/* Grouped sections — each topic in its own card with mini-visuals. */}
          <div className="an-sections">
            <Section icon={ICN.disc} title="Catalog">
              <div className="an-stats an-stats-2">
                <Stat label="Total Albums" value={fmt(overview.total_albums)} />
                <Stat label="Total Songs" value={fmt(overview.total_songs)} />
              </div>
              <Ratio label="Albums" ok={overview.available_albums} other={overview.studio_albums} />
              <Ratio label="Songs" ok={overview.available_songs} other={overview.studio_songs} />
              <div className="an-legend"><span><i className="an-dot an-dot-ok" />Available</span><span><i className="an-dot an-dot-other" />Studio</span></div>
            </Section>

            <Section icon={ICN.card} title="Subscriptions & Revenue">
              <div className="an-stats an-stats-2">
                <Stat label="Subscribers" value={subs ? fmt(subs.count) : '—'} />
                <Stat label="Monthly Revenue" tone="green" value={subs ? money(subs.monthly_total_cents, subs.currency) : '—'} />
              </div>
              <PlanBars subs={subs} />
            </Section>

            <Section icon={ICN.users} title="Audience">
              <div className="an-stats an-stats-3">
                <Stat label="Registered" value={fmt(overview.total_users)} />
                <Stat label="Active · 30d" value={fmt(overview.active_users)} />
                <Stat label="Listening" value={fmtHrs(overview.total_listening_hours)} />
              </div>
              <Ratio label="Engaged in the last 30 days" ok={overview.active_users}
                     other={Math.max(0, (overview.total_users || 0) - (overview.active_users || 0))}
                     okLabel="active" otherLabel="idle" />
              <div className="an-legend"><span><i className="an-dot an-dot-ok" />Active</span><span><i className="an-dot an-dot-other" />Idle</span></div>
            </Section>

            <Section icon={ICN.star} title="Engagement">
              <div className="an-stats an-stats-2">
                <Stat label="Total Ratings" value={fmt(overview.total_ratings)} />
                <Stat label="Total Reviews" value={fmt(overview.total_reviews)} />
                <Stat label="Avg Album ★" tone="gold" value={overview.avg_album_rating ?? '—'} />
                <Stat label="Avg Song ★" tone="gold" value={overview.avg_song_rating ?? '—'} />
              </div>
            </Section>
          </div>

          {/* Top performers — the standouts, with cover art. */}
          <h2 className="an-sub-h">Top Performers</h2>
          <div className="an-highlights">
            <Highlight title="Most Played Album" item={overview.most_played_album} sub={(x: any) => `${fmt(x.plays)} plays`} />
            <Highlight title="Most Played Song" item={overview.most_played_song} sub={(x: any) => `${fmt(x.plays)} plays`} />
            <Highlight title="Most Active Listener" item={overview.most_active_listener} name={(x: any) => x.name} sub={(x: any) => `${fmt(x.plays)} plays · ${fmtHrs(x.hours)}`} />
            <Highlight title="Most Rated Album" item={overview.most_rated_album} sub={(x: any) => `${fmt(x.rating_count)} ratings`} />
            <Highlight title="Most Reviewed Album" item={overview.most_reviewed_album} sub={(x: any) => `${fmt(x.review_count)} reviews`} />
          </div>
        </div>
      )}
      {tab === 'overview' && !overview && <div className="an-empty">Loading dashboard…</div>}

      {/* ---- TRENDS ---- */}
      {tab === 'trends' && trends && (
        <div className="an-trends">
          <Panel title="Total Plays Over Time (90 days)"><LineChart points={trends.daily.map((d: any) => ({ label: d.day, value: d.plays }))} /></Panel>
          <Panel title="Daily Active Users"><LineChart points={trends.dau.map((d: any) => ({ label: d.day, value: d.users }))} color="var(--accent)" /></Panel>
          <div className="an-2col">
            <Panel title="Monthly Listening Hours"><Bars points={trends.monthly.map((m: any) => ({ label: m.month.slice(2), value: m.hours }))} color="var(--accent-gold)" /></Panel>
            <Panel title="Peak Listening Hours"><Bars points={HOURS.map((h) => ({ label: String(h), value: (trends.peak_hours.find((x: any) => x.hour === h)?.plays) || 0 }))} /></Panel>
          </div>
          <Panel title="Peak Listening Days"><Bars points={DOW.map((d, i) => ({ label: d, value: (trends.peak_days.find((x: any) => x.dow === i)?.plays) || 0 }))} color="var(--accent-peach)" /></Panel>
        </div>
      )}

      {/* ---- TABLES: albums / songs / users ---- */}
      {(tab === 'albums' || tab === 'songs' || tab === 'users') && (
        <>
          <div className="an-filters">
            <input className="an-input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (setPage(1), loadTable(tab, 1))} />
            <label>From <input className="an-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To <input className="an-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            {tab !== 'users' && (
              <select className="an-input" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="plays">Most Plays</option>
                <option value="listening">Listening Time</option>
                <option value="unique">Unique Listeners</option>
                <option value="rating">Highest Rated</option>
                <option value="reviews">Most Reviewed</option>
              </select>
            )}
            <button className="an-btn an-btn-primary" type="button" onClick={() => { setPage(1); loadTable(tab, 1); }}>Apply</button>
            <button className="an-btn" type="button" onClick={() => exportReport(tab, { q, from, to })}>⬇ CSV</button>
            <button className="an-btn" type="button" onClick={() => exportReport(tab, { q, from, to }, 'xls')}>⬇ Excel</button>
          </div>

          <div className="an-table-wrap">
            {busy && !table && <div className="an-empty">Loading…</div>}
            {table && (tab === 'albums' ? <AlbumTable items={table.items} /> : tab === 'songs' ? <SongTable items={table.items} /> : <UserTable items={table.items} />)}
          </div>

          {table && table.total > 25 && (
            <div className="an-pager">
              <button className="an-btn" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); loadTable(tab, p); }}>← Prev</button>
              <span>Page {page} of {Math.ceil(table.total / 25)} · {fmt(table.total)} total</span>
              <button className="an-btn" disabled={page >= Math.ceil(table.total / 25)} onClick={() => { const p = page + 1; setPage(p); loadTable(tab, p); }}>Next →</button>
            </div>
          )}
        </>
      )}

      {/* ---- RATINGS ---- */}
      {tab === 'ratings' && ratings && (
        <div className="an-trends">
          <div className="an-cards">
            <div className="an-card"><div className="an-card-v">{fmt(ratings.total_album_ratings)}</div><div className="an-card-l">Album Ratings</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(ratings.total_song_ratings)}</div><div className="an-card-l">Song Ratings</div></div>
            <div className="an-card"><div className="an-card-v">{ratings.average_rating ?? '—'}</div><div className="an-card-l">Average Rating</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(ratings.raters)}</div><div className="an-card-l">Users Who Rated</div></div>
          </div>
          <Panel title="Rating Distribution">
            <div className="an-dist">
              {[5, 4, 3, 2, 1].map((s) => {
                const total = Object.values(ratings.distribution).reduce((a: number, b: any) => a + b, 0) as number;
                const n = ratings.distribution[s] || 0; const pct = total ? Math.round((n / total) * 100) : 0;
                return <div className="an-dist-row" key={s}><span>{s}★</span><span className="an-dist-bar"><span style={{ width: `${pct}%` }} /></span><span>{pct}% ({n})</span></div>;
              })}
            </div>
          </Panel>
          <div className="an-2col">
            <Panel title="Highest Rated Albums"><TopList rows={ratings.highest_rated_albums.map((r: any) => ({ ...r, __v: r.avg_rating }))} render={(r) => `${r.title || r.target_id} — ★${r.avg_rating} (${r.rating_count})`} /></Panel>
            <Panel title="Lowest Rated Albums"><TopList rows={ratings.lowest_rated_albums.map((r: any) => ({ ...r, __v: 5 - r.avg_rating }))} render={(r) => `${r.title || r.target_id} — ★${r.avg_rating} (${r.rating_count})`} /></Panel>
            <Panel title="Most Rated Albums"><TopList rows={ratings.most_rated_albums.map((r: any) => ({ ...r, __v: r.rating_count }))} render={(r) => `${r.title || r.target_id} — ${r.rating_count} ratings`} /></Panel>
            <Panel title="Highest Rated Songs"><TopList rows={ratings.highest_rated_songs.map((r: any) => ({ ...r, __v: r.avg_rating }))} render={(r) => `${r.title || r.target_id} — ★${r.avg_rating} (${r.rating_count})`} /></Panel>
          </div>
        </div>
      )}

      {/* ---- REVIEWS ---- */}
      {tab === 'reviews' && reviews && (
        <div className="an-trends">
          <div className="an-cards">
            <div className="an-card"><div className="an-card-v">{fmt(reviews.total_album_reviews)}</div><div className="an-card-l">Album Reviews</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(reviews.total_song_reviews)}</div><div className="an-card-l">Song Reviews</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(reviews.reviewers)}</div><div className="an-card-l">Reviewers</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(reviews.avg_review_length)}</div><div className="an-card-l">Avg Review Length</div></div>
            <div className="an-card"><div className="an-card-v">{fmt(reviews.pending_moderation)}</div><div className="an-card-l">Pending Moderation</div></div>
          </div>
          <div className="an-2col">
            <Highlight title="Most Reviewed Album" item={reviews.most_reviewed_album} sub={(x: any) => `${fmt(x.review_count)} reviews`} />
            <Highlight title="Most Reviewed Song" item={reviews.most_reviewed_song} sub={(x: any) => `${fmt(x.review_count)} reviews`} />
          </div>
          <Panel title="Latest Reviews">
            <div className="an-reviews">
              {reviews.latest.map((r: any, i: number) => (
                <div className="an-review" key={i}>
                  <div className="an-review-head"><span className="an-stars">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span> <strong>{r.title || '(no title)'}</strong> <span className="an-muted">on {r.title2 || r.album || r.target_title || r.code || r.target_id}</span></div>
                  {r.body && <div className="an-review-body">{r.body}</div>}
                  <div className="an-muted">by {r.by} · {dateStr(r.created_at)}</div>
                </div>
              ))}
              {reviews.latest.length === 0 && <div className="an-empty">No reviews yet.</div>}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="an-panel"><h3 className="an-panel-h">{title}</h3>{children}</div>;
}

// Hero metric: big number with an accent icon chip + a context hint.
function Kpi({ icon, tone, label, value, hint }: { icon: string; tone: string; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={`an-kpi tone-${tone}`}>
      <span className="an-kpi-ic"><Icon d={icon} /></span>
      <div className="an-kpi-v">{value}</div>
      <div className="an-kpi-l">{label}</div>
      {hint && <div className="an-kpi-h">{hint}</div>}
    </div>
  );
}
// Titled group card.
function Section({ icon, title, children }: { icon: string; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="an-section">
      <div className="an-section-h"><span className="an-section-ic"><Icon d={icon} /></span><h3>{title}</h3></div>
      {children}
    </section>
  );
}
// Compact stat tile inside a Section.
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return <div className={`an-stat${tone ? ` tone-${tone}` : ''}`}><div className="an-stat-v">{value}</div><div className="an-stat-l">{label}</div></div>;
}
// Two-segment proportion bar (e.g. Available vs Studio, Active vs Idle).
function Ratio({ label, ok, other, okLabel = 'available', otherLabel = 'studio' }: { label: string; ok: number; other: number; okLabel?: string; otherLabel?: string }) {
  const a = Math.max(0, ok || 0); const b = Math.max(0, other || 0); const total = a + b || 1;
  const pct = Math.round((a / total) * 100);
  return (
    <div className="an-ratio">
      <div className="an-ratio-top"><span>{label}</span><span><b>{pct}%</b> {okLabel}</span></div>
      <div className="an-ratio-bar">
        <span className="an-ratio-ok" style={{ width: `${(a / total) * 100}%` }} title={`${fmt(a)} ${okLabel}`} />
        <span className="an-ratio-other" style={{ width: `${(b / total) * 100}%` }} title={`${fmt(b)} ${otherLabel}`} />
      </div>
    </div>
  );
}
// Per-plan revenue breakdown: each plan's share of MRR as a labelled bar.
function PlanBars({ subs }: { subs: any }) {
  if (!subs) return <div className="an-empty">Loading…</div>;
  const plans = subs.by_plan || [];
  if (!plans.length) return <div className="an-empty">No paying subscribers yet.</div>;
  const max = Math.max(1, ...plans.map((p: any) => p.subtotal_cents || 0));
  return (
    <div className="an-planbars">
      {plans.map((p: any) => (
        <div className="an-planbar" key={p.plan}>
          <span className="an-planbar-tx"><b>{p.plan}</b> · {fmt(p.count)} {p.count === 1 ? 'subscriber' : 'subscribers'} · {money(p.monthly_cents_each, subs.currency)}/mo</span>
          <span className="an-planbar-amt">{money(p.subtotal_cents, subs.currency)}</span>
          <span className="an-planbar-track"><span className="an-planbar-fill" style={{ width: `${((p.subtotal_cents || 0) / max) * 100}%` }} /></span>
        </div>
      ))}
    </div>
  );
}
function Highlight({ title, item, sub, name }: { title: string; item: any; sub: (x: any) => string; name?: (x: any) => string }) {
  return (
    <div className="an-hl">
      <div className="an-hl-t">{title}</div>
      {item ? (
        <>
          {item.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img className="an-hl-cover" src={item.cover} alt="" />}
          <div className="an-hl-name">{name ? name(item) : (item.title || '—')}</div>
          {item.artist && <div className="an-muted">{item.artist}</div>}
          <div className="an-hl-sub">{sub(item)}</div>
        </>
      ) : <div className="an-empty">No data yet.</div>}
    </div>
  );
}

function AlbumTable({ items }: { items: any[] }) {
  if (!items.length) return <div className="an-empty">No album activity yet.</div>;
  return (
    <table className="an-table">
      <thead><tr><th>Album</th><th>Artist</th><th>Plays</th><th>Listeners</th><th>Listening</th><th>Avg ★</th><th>Ratings</th><th>Reviews</th><th>Last Played</th></tr></thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.album_id}>
            <td className="an-td-name">{a.cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.cover} alt="" />}{a.title}</td>
            <td>{a.artist || '—'}</td><td>{fmt(a.plays)}</td><td>{fmt(a.listeners)}</td><td>{fmtDur(a.listening_seconds)}</td>
            <td>{a.avg_rating ?? '—'}</td><td>{fmt(a.rating_count)}</td><td>{fmt(a.review_count)}</td><td>{dateStr(a.last_played)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function SongTable({ items }: { items: any[] }) {
  if (!items.length) return <div className="an-empty">No song activity yet.</div>;
  return (
    <table className="an-table">
      <thead><tr><th>Song</th><th>Album</th><th>Plays</th><th>Listeners</th><th>Complete</th><th>Skips</th><th>Avg %</th><th>Avg ★</th></tr></thead>
      <tbody>
        {items.map((s) => (
          <tr key={s.song_id}>
            <td className="an-td-name">{s.title}</td><td>{s.album || '—'}</td><td>{fmt(s.plays)}</td><td>{fmt(s.listeners)}</td>
            <td>{fmt(s.complete_plays)}</td><td>{fmt(s.skips)}</td><td>{s.avg_completion}%</td><td>{s.avg_rating ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function UserTable({ items }: { items: any[] }) {
  if (!items.length) return <div className="an-empty">No listening activity yet.</div>;
  return (
    <table className="an-table">
      <thead><tr><th>User</th><th>Plays</th><th>Songs</th><th>Albums</th><th>Sessions</th><th>Listening</th><th>First</th><th>Last</th></tr></thead>
      <tbody>
        {items.map((u) => (
          <tr key={u.user_id}>
            <td className="an-td-name">{u.name}</td><td>{fmt(u.plays)}</td><td>{fmt(u.songs)}</td><td>{fmt(u.albums)}</td>
            <td>{fmt(u.sessions)}</td><td>{fmtDur(u.listening_seconds)}</td><td>{dateStr(u.first_listen)}</td><td>{dateStr(u.last_listen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
