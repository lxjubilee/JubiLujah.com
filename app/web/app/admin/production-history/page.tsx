import type { Metadata } from 'next';
import { productionHistory, ALBUM_QUOTA, SONG_QUOTA } from '@/lib/productionHistory';

export const revalidate = 600;
export const metadata: Metadata = {
  title: 'Production History — JubiLujah',
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString();
const scoreColor = (pct: number) => (pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--accent-gold)' : 'var(--accent)');

export default function ProductionHistoryPage() {
  const { weeks, totalLiveAlbums, totalLiveSongs } = productionHistory();
  const current = weeks.find((w) => w.isCurrent) || weeks[0];

  return (
    <>
      <h2 className="section-title">Production History</h2>
      <p className="section-sub">
        Music albums &amp; songs made live on production, bucketed by the workweek (Sun–Sat, PST) they were completed (uploaded to the studio drive).
        Weekly quota: <strong>{ALBUM_QUOTA} albums</strong> / <strong>{SONG_QUOTA} songs</strong> = 100%. Past weeks are locked once the week closes (YYWW = 2-digit year + workweek).
      </p>

      <div className="kpi-row">
        <div className="kpi"><div className="n">{fmt(totalLiveAlbums)}</div><div className="l">Total Live Albums</div></div>
        <div className="kpi"><div className="n">{fmt(totalLiveSongs)}</div><div className="l">Total Live Songs</div></div>
        {current && (
          <>
            <div className="kpi">
              <div className="n" style={{ color: scoreColor(current.quotaScore) }}>{current.quotaScore}%</div>
              <div className="l">This Week — In Progress ({current.yyww})</div>
            </div>
            <div className="kpi"><div className="n">{fmt(current.albums)} / {fmt(current.songs)}</div><div className="l">Albums / Songs this week</div></div>
          </>
        )}
      </div>

      <table className="admin-table" style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>YYWW</th><th>Workweek (PST)</th>
            <th style={{ textAlign: 'right' }}>Albums</th>
            <th style={{ textAlign: 'right' }}>Songs</th>
            <th style={{ minWidth: 180 }}>Quota Score</th>
            <th style={{ textAlign: 'right' }}>Cumulative Live</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w.yyww} style={w.isCurrent ? { background: 'var(--surface-2)' } : undefined}>
              <td>
                <strong style={{ color: 'var(--accent-gold)' }}>{w.yyww}</strong>
                {w.isCurrent && <span style={{ fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: 'var(--surface-3)', color: 'var(--accent-gold)' }}>IN PROGRESS</span>}
              </td>
              <td className="muted">{w.rangeLabel}</td>
              <td style={{ textAlign: 'right' }}>{fmt(w.albums)}<span className="muted" style={{ fontSize: 11 }}> /{ALBUM_QUOTA}</span></td>
              <td style={{ textAlign: 'right' }}>{fmt(w.songs)}<span className="muted" style={{ fontSize: 11 }}> /{SONG_QUOTA}</span></td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, height: 9, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', display: 'block' }}>
                    <span style={{ display: 'block', height: '100%', width: `${Math.min(100, w.quotaScore)}%`, background: scoreColor(w.quotaScore), borderRadius: 999 }} />
                  </span>
                  <strong style={{ color: scoreColor(w.quotaScore), minWidth: 44, textAlign: 'right' }}>{w.quotaScore}%</strong>
                </div>
                <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>albums {w.albumPct}% · songs {w.songPct}%</div>
              </td>
              <td style={{ textAlign: 'right' }} className="muted">{fmt(w.cumAlbums)} alb · {fmt(w.cumSongs)} sng</td>
            </tr>
          ))}
          {weeks.length === 0 && <tr><td colSpan={6} className="muted">No completed albums recorded yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
