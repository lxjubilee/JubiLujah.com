import type { Metadata } from 'next';
import { languageStats } from '@/lib/languageStats';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Languages — JubiLujah',
  robots: { index: false, follow: false },
};

const fmt = (n: number) => n.toLocaleString();

export default function LanguagesPage() {
  const s = languageStats();
  return (
    <>
      <h2 className="section-title">Languages</h2>
      <p className="section-sub">
        Languages JubiLujah supports and how much live catalog each one has. An album&apos;s language comes from its code suffix (…EN = English, …ES = Spanish, …). The catalog is currently English; other languages fill in as localized albums are published.
      </p>

      <div className="kpi-row">
        <div className="kpi"><div className="n">{s.supported}</div><div className="l">Languages Supported</div></div>
        <div className="kpi"><div className="n">{s.withContent}</div><div className="l">With Content</div></div>
        <div className="kpi"><div className="n">{fmt(s.totalAlbums)}</div><div className="l">Total Live Albums</div></div>
        <div className="kpi"><div className="n">{fmt(s.totalSongs)}</div><div className="l">Total Live Songs</div></div>
      </div>

      <table className="admin-table" style={{ marginTop: 20 }}>
        <thead>
          <tr><th>Language</th><th>Code</th><th style={{ textAlign: 'right' }}>Albums</th><th style={{ textAlign: 'right' }}>Songs</th><th>Coverage</th></tr>
        </thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.code} style={r.albums === 0 ? { opacity: 0.6 } : undefined}>
              <td><span style={{ fontSize: 18, marginRight: 8 }}>{r.flag}</span><strong>{r.name}</strong></td>
              <td className="muted">{r.code}</td>
              <td style={{ textAlign: 'right' }}>{fmt(r.albums)}</td>
              <td style={{ textAlign: 'right' }}>{fmt(r.songs)}</td>
              <td>
                {r.albums > 0 ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 120, height: 8, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden', display: 'inline-block' }}>
                      <span style={{ display: 'block', height: '100%', width: `${s.totalAlbums ? Math.round((r.albums / s.totalAlbums) * 100) : 0}%`, background: 'var(--accent-gold)' }} />
                    </span>
                    <span className="muted" style={{ fontSize: 11 }}>{s.totalAlbums ? Math.round((r.albums / s.totalAlbums) * 100) : 0}%</span>
                  </span>
                ) : <span className="muted" style={{ fontSize: 11 }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
