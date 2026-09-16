'use client';
// ============================================================================
// Redirector admin console — software/redirector.md §12.
//
// Dashboard-first: an "at a glance" overview (accent-bar stat cards, Content Mix,
// Top Codes) over the redirector /stats endpoint, then the working tools —
// Browse codes (the Music/Articles/Books catalog + per-asset QR), Reports (§17),
// Audit (§12.2) and Health (§16).
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import {
  redirector, type AuditEvent, type HealthAsset, type RdrStats,
  type ReportOverview, type TopToken, type BreakdownRow, type ProbeReport,
} from '@/lib/redirector';
import RedirectorCatalog from '@/components/RedirectorCatalog';

type View = 'dashboard' | 'browse' | 'reports' | 'audit' | 'health';

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--success)', unreachable: '#c0392b', checksum_mismatch: '#c0392b', unchecked: 'var(--ink-muted)',
};
const ACCENT = {
  violet: '#7c6cf6', pink: '#e0629a', green: '#3fb98f', blue: '#4a9de0',
  teal: '#3fb9b9', indigo: '#6c7cf6', gold: '#e6ac00', coral: '#e07a5a',
};

const panel: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: 18, background: 'var(--surface)', minWidth: 0 };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-muted)' };
const pill = (active: boolean): React.CSSProperties => ({
  padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--line)'}`, background: active ? 'var(--accent-gold)' : 'transparent', color: active ? 'var(--bg)' : 'var(--ink-soft)',
});

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      letterSpacing: 0.3, color: color || 'var(--ink-soft)', border: `1px solid ${color || 'var(--line)'}`, whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: string; color: string }) {
  return (
    <div style={{ ...panel, padding: 16, borderLeft: `3px solid ${color}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={eyebrow}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--ink)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{sub}</div>}
    </div>
  );
}

function ContentMix({ tokens }: { tokens: RdrStats['tokens'] }) {
  const items = [
    { label: 'Albums', n: tokens.album, color: ACCENT.violet },
    { label: 'Songs', n: tokens.track, color: ACCENT.indigo },
    { label: 'Articles', n: tokens.article, color: ACCENT.pink },
    { label: 'Books', n: tokens.book, color: ACCENT.teal },
  ].filter((i) => i.n > 0 || i.label === 'Albums' || i.label === 'Songs');
  const max = Math.max(1, ...items.map((i) => i.n));
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', height: 150, padding: '0 8px 8px', justifyContent: 'center' }}>
        {items.map((i) => (
          <div key={i.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
            <div style={{ width: 40, height: Math.max(6, Math.round((i.n / max) * 128)), borderRadius: '8px 8px 0 0', background: `linear-gradient(180deg, ${i.color}, ${i.color}44)` }} />
            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{i.label.toLowerCase()}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        {items.map((i) => (
          <div key={i.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 2px', fontSize: 13, borderBottom: '1px solid var(--line)' }}>
            <span>{i.label}</span><span style={{ fontWeight: 700 }}>{i.n.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RedirectorConsole() {
  const [view, setView] = useState<View>('dashboard');
  const [stats, setStats] = useState<RdrStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [health, setHealth] = useState<HealthAsset[]>([]);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [topTokens, setTopTokens] = useState<TopToken[]>([]);
  const [devices, setDevices] = useState<BreakdownRow[]>([]);
  const [countries, setCountries] = useState<BreakdownRow[]>([]);
  const [referrers, setReferrers] = useState<BreakdownRow[]>([]);
  const [probes, setProbes] = useState<ProbeReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try { setStats(await redirector.stats()); } catch (e) { fail(e); } finally { setLoadingStats(false); }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const go = (v: View) => { setView(v); setErr(null); };
  async function loadAudit() { go('audit'); try { setAudit((await redirector.audit()).events); } catch (e) { fail(e); } }
  async function loadHealth() { go('health'); try { setHealth((await redirector.health()).assets); } catch (e) { fail(e); } }
  async function loadReports() {
    go('reports');
    try {
      const [ov, tt, dev, ctry, ref, pr] = await Promise.all([
        redirector.reports.overview(), redirector.reports.topTokens(),
        redirector.reports.breakdown('device'), redirector.reports.breakdown('country'),
        redirector.reports.breakdown('referrer'), redirector.reports.probes(),
      ]);
      setOverview(ov); setTopTokens(tt.tokens); setDevices(dev.rows); setCountries(ctry.rows); setReferrers(ref.rows); setProbes(pr);
    } catch (e) { fail(e); }
  }
  const refresh = () => { loadStats(); if (view === 'reports') loadReports(); if (view === 'audit') loadAudit(); if (view === 'health') loadHealth(); };

  const t = stats?.tokens; const sc = stats?.scans;
  const cards = t && sc ? [
    { label: 'Total codes', value: t.total.toLocaleString(), sub: `${t.album} albums · ${t.track} songs · ${t.article} articles`, color: ACCENT.violet },
    { label: 'Album QR', value: t.album.toLocaleString(), sub: 'one code per album', color: ACCENT.pink },
    { label: 'Song QR', value: t.track.toLocaleString(), sub: 'per-track codes', color: ACCENT.green },
    { label: 'Article QR', value: t.article.toLocaleString(), sub: 'web-only · opens article page', color: ACCENT.coral },
    { label: 'Scans (90d)', value: sc.total.toLocaleString(), sub: 'total resolutions', color: ACCENT.blue },
    { label: 'Scans (24h)', value: sc.last24h.toLocaleString(), sub: 'last 24 hours', color: ACCENT.teal },
    { label: 'Scans (7d)', value: sc.last7d.toLocaleString(), sub: 'last 7 days', color: ACCENT.indigo },
    { label: 'Aliases', value: t.alias.toLocaleString(), sub: 'vanity short links', color: ACCENT.gold },
    { label: 'Landings', value: sc.landings.toLocaleString(), sub: 'arrival pages shown', color: ACCENT.coral },
  ] : [];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Redirector &amp; QR</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-muted)', fontSize: 13 }}>Short links, QR codes &amp; scan analytics: Music · Articles · Books</p>
        </div>
        <button onClick={refresh} style={{ ...pill(false), fontWeight: 600 }} title="Reload">↻ Refresh</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button style={pill(view === 'dashboard')} onClick={() => go('dashboard')}>Dashboard</button>
        <button style={pill(view === 'browse')} onClick={() => go('browse')}>Browse codes</button>
        <button style={pill(view === 'reports')} onClick={loadReports}>Reports</button>
        <button style={pill(view === 'audit')} onClick={loadAudit}>Audit</button>
        <button style={pill(view === 'health')} onClick={loadHealth}>Health</button>
      </div>

      {err && <p className="notice" style={{ color: '#c0392b' }}>{err}</p>}

      {/* ---- Dashboard ---- */}
      {view === 'dashboard' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14 }}>
            {(!stats && loadingStats)
              ? Array.from({ length: 9 }).map((_, i) => <div key={i} style={{ ...panel, height: 98, opacity: 0.35 }} />)
              : cards.map((c) => <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} color={c.color} />)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, alignItems: 'start' }}>
            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Content Mix</div>
                <button style={pill(false)} onClick={() => go('browse')}>Browse codes →</button>
              </div>
              {stats ? <ContentMix tokens={stats.tokens} /> : <p className="notice">Loading…</p>}
            </div>

            <div style={panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Top Codes <span style={{ fontWeight: 500, color: 'var(--ink-muted)', fontSize: 12 }}>· by scans</span></div>
                <button style={pill(false)} onClick={loadReports}>Reports →</button>
              </div>
              {stats && stats.topCodes.length ? stats.topCodes.map((c) => (
                <div key={c.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '9px 2px', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <code style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{c.token}</code>
                    <Badge text={c.kind || '-'} />
                  </span>
                  <span style={{ fontWeight: 800 }}>{c.resolve_count.toLocaleString()}</span>
                </div>
              )) : <p className="notice">No scans recorded yet. Codes resolve here once they’re scanned.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ---- Browse codes ---- */}
      {view === 'browse' && <RedirectorCatalog />}

      {/* ---- Reports ---- */}
      {view === 'reports' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {overview && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {([
                ['Resolutions', overview.resolutions, ACCENT.blue],
                ['Tokens hit', overview.tokens, ACCENT.violet],
                ['Bot hits', overview.bot_hits, ACCENT.coral],
                ['Landings shown', overview.landings_shown, ACCENT.teal],
                ['Landing actions', overview.landing_actions, ACCENT.green],
              ] as [string, number, string][]).map(([label, val, color]) => (
                <StatCard key={label} label={label} value={val} color={color} />
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, alignItems: 'start' }}>
            <div style={panel}>
              <div style={{ ...eyebrow, marginBottom: 10 }}>Top tokens (90 days)</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Token', 'Kind', 'Placement', 'Resolves'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {topTokens.map((tk) => (
                    <tr key={tk.token}>
                      <td style={{ padding: 6 }}><code>{tk.token}</code></td>
                      <td style={{ padding: 6 }}>{tk.kind || '-'}</td>
                      <td style={{ padding: 6 }}>{tk.placement || '-'}</td>
                      <td style={{ padding: 6, fontWeight: 700 }}>{tk.resolutions}</td>
                    </tr>
                  ))}
                  {!topTokens.length && <tr><td colSpan={4} className="notice" style={{ padding: 10 }}>No resolutions yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {([['Device', devices], ['Country', countries], ['Referrer', referrers]] as [string, BreakdownRow[]][]).map(([title, rows]) => (
                <div key={title} style={panel}>
                  <div style={{ ...eyebrow, marginBottom: 8 }}>{title} breakdown</div>
                  {rows.length ? rows.map((r) => (
                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                      <span>{r.key}</span><span style={{ fontWeight: 700 }}>{r.n}</span>
                    </div>
                  )) : <p className="notice">No data.</p>}
                </div>
              ))}
              <div style={{ ...panel, borderLeft: `3px solid ${probes && probes.total > 0 ? '#c0392b' : ACCENT.green}` }}>
                <div style={{ ...eyebrow, marginBottom: 6 }}>Probe attempts (security)</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: probes && probes.total > 0 ? '#c0392b' : 'var(--success)' }}>{probes?.total ?? 0}</div>
                <p className="notice">Unknown-token lookups in the last 90 days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Audit ---- */}
      {view === 'audit' && (
        <div style={panel}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Audit trail: last 200 changes</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['When', 'Actor', 'Action', 'Entity'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.audit_id}>
                  <td style={{ padding: 6 }}>{new Date(a.occurred_at).toLocaleString()}</td>
                  <td style={{ padding: 6 }}>{a.actor}</td>
                  <td style={{ padding: 6 }}><code>{a.action}</code></td>
                  <td style={{ padding: 6 }}>{a.entity_type} {a.entity_id ? <code>{a.entity_id}</code> : null}</td>
                </tr>
              ))}
              {!audit.length && <tr><td colSpan={4} className="notice" style={{ padding: 10 }}>No audit events.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ---- Health ---- */}
      {view === 'health' && (
        <div style={panel}>
          <div style={{ ...eyebrow, marginBottom: 10 }}>Asset health: flagged assets</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Title', 'Kind', 'Status', 'Checked'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {health.map((a) => (
                <tr key={a.asset_id}>
                  <td style={{ padding: 6 }}>{a.title}</td>
                  <td style={{ padding: 6 }}>{a.content_kind}</td>
                  <td style={{ padding: 6 }}><Badge text={a.health_status} color={HEALTH_COLOR[a.health_status]} /></td>
                  <td style={{ padding: 6 }}>{a.health_checked_at ? new Date(a.health_checked_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
              {!health.length && <tr><td colSpan={4} className="notice" style={{ padding: 10 }}>No flagged assets. All healthy.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
