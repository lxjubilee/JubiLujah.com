'use client';
// ============================================================================
// Redirector admin console — software/redirector.md §12.
//
// Browse (default) presents the QR asset arrangement — Music (personas → albums
// → songs), Articles, and Books — each leaf carrying its own individual QR code
// (see components/RedirectorCatalog.tsx). Reports (§17), Audit (§12.2) and Health
// (§16) remain as data views over the redirector API.
//
// Step 1 is the front-end arrangement + per-asset QR preview; minting real tokens
// and downloadable QRs against the redirector API is the next step.
// ============================================================================
import { useState } from 'react';
import {
  redirector, type AuditEvent, type HealthAsset,
  type ReportOverview, type TopToken, type BreakdownRow, type ProbeReport,
} from '@/lib/redirector';
import RedirectorCatalog from '@/components/RedirectorCatalog';

type View = 'browse' | 'audit' | 'health' | 'reports';

const HEALTH_COLOR: Record<string, string> = {
  ok: 'var(--success)', unreachable: '#c0392b', checksum_mismatch: '#c0392b', unchecked: 'var(--ink-muted)',
};

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      letterSpacing: 0.3, color: color || 'var(--ink-soft)', border: `1px solid ${color || 'var(--line)'}`,
      whiteSpace: 'nowrap',
    }}>{text}</span>
  );
}

export default function RedirectorConsole() {
  const [view, setView] = useState<View>('browse');
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [health, setHealth] = useState<HealthAsset[]>([]);
  const [overview, setOverview] = useState<ReportOverview | null>(null);
  const [topTokens, setTopTokens] = useState<TopToken[]>([]);
  const [devices, setDevices] = useState<BreakdownRow[]>([]);
  const [countries, setCountries] = useState<BreakdownRow[]>([]);
  const [referrers, setReferrers] = useState<BreakdownRow[]>([]);
  const [probes, setProbes] = useState<ProbeReport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fail = (e: unknown) => setErr(e instanceof Error ? e.message : String(e));

  async function loadAudit() { setView('audit'); setErr(null); try { setAudit((await redirector.audit()).events); } catch (e) { fail(e); } }
  async function loadHealth() { setView('health'); setErr(null); try { setHealth((await redirector.health()).assets); } catch (e) { fail(e); } }
  async function loadReports() {
    setView('reports'); setErr(null);
    try {
      const [ov, tt, dev, ctry, ref, pr] = await Promise.all([
        redirector.reports.overview(), redirector.reports.topTokens(),
        redirector.reports.breakdown('device'), redirector.reports.breakdown('country'),
        redirector.reports.breakdown('referrer'), redirector.reports.probes(),
      ]);
      setOverview(ov); setTopTokens(tt.tokens); setDevices(dev.rows); setCountries(ctry.rows); setReferrers(ref.rows); setProbes(pr);
    } catch (e) { fail(e); }
  }

  const btn = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid var(--line)`, background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--ink-soft)',
  });
  const pane: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: 'var(--surface)', minWidth: 0 };

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Redirector</h1>
        <span className="eyebrow" style={{ color: 'var(--accent)' }}>Music · Articles · Books</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={btn(view === 'browse')} onClick={() => { setView('browse'); setErr(null); }}>Browse</button>
          <button style={btn(view === 'reports')} onClick={loadReports}>Reports</button>
          <button style={btn(view === 'audit')} onClick={loadAudit}>Audit</button>
          <button style={btn(view === 'health')} onClick={loadHealth}>Health</button>
        </div>
      </div>

      {msg && <p className="notice" style={{ color: 'var(--success)' }}>{msg}</p>}
      {err && <p className="notice" style={{ color: '#c0392b' }}>{err}</p>}

      {view === 'browse' && <RedirectorCatalog />}

      {view === 'reports' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {overview && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}>
              {[
                ['Resolutions', overview.resolutions],
                ['Tokens hit', overview.tokens],
                ['Bot hits', overview.bot_hits],
                ['Landings shown', overview.landings_shown],
                ['Landing actions', overview.landing_actions],
              ].map(([label, val]) => (
                <div key={label as string} style={{ ...pane, textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--accent-gold)' }}>{val as number}</div>
                  <div className="eyebrow" style={{ marginTop: 4 }}>{label as string}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
            <div style={pane}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Top tokens (90 days) — §17.1</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Token', 'Kind', 'Placement', 'Resolves'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {topTokens.map((t) => (
                    <tr key={t.token}>
                      <td style={{ padding: 6 }}><code>{t.token}</code></td>
                      <td style={{ padding: 6 }}>{t.kind || '—'}</td>
                      <td style={{ padding: 6 }}>{t.placement || '—'}</td>
                      <td style={{ padding: 6, fontWeight: 700 }}>{t.resolutions}</td>
                    </tr>
                  ))}
                  {!topTokens.length && <tr><td colSpan={4} className="notice" style={{ padding: 10 }}>No resolutions yet.</td></tr>}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'grid', gap: 14 }}>
              {([['Device', devices], ['Country', countries], ['Referrer', referrers]] as [string, BreakdownRow[]][]).map(([title, rows]) => (
                <div key={title} style={pane}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>{title} breakdown</div>
                  {rows.length ? rows.map((r) => (
                    <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                      <span>{r.key}</span><span style={{ fontWeight: 700 }}>{r.n}</span>
                    </div>
                  )) : <p className="notice">No data.</p>}
                </div>
              ))}
              <div style={pane}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Probe attempts (security) — §17.1</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: probes && probes.total > 0 ? '#c0392b' : 'var(--success)' }}>{probes?.total ?? 0}</div>
                <p className="notice">Unknown-token lookups in the last 90 days.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {view === 'audit' && (
        <div style={pane}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Audit trail — last 200 changes (§12.2)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['When', 'Actor', 'Action', 'Entity'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
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

      {view === 'health' && (
        <div style={pane}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Asset health — flagged assets (§16)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Title', 'Kind', 'Status', 'Checked'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 6, borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
            <tbody>
              {health.map((a) => (
                <tr key={a.asset_id}>
                  <td style={{ padding: 6 }}>{a.title}</td>
                  <td style={{ padding: 6 }}>{a.content_kind}</td>
                  <td style={{ padding: 6 }}><Badge text={a.health_status} color={HEALTH_COLOR[a.health_status]} /></td>
                  <td style={{ padding: 6 }}>{a.health_checked_at ? new Date(a.health_checked_at).toLocaleString() : '—'}</td>
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
