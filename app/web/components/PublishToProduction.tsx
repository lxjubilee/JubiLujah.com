'use client';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';

interface Candidate { code: string; title: string; artist: string; jTracks: number; live: number; path: string }
interface CandResp { available: boolean; count?: number; candidates: Candidate[] }
interface PubResp { ok: boolean; steps: any[]; codes: string[] }

export default function PublishToProduction() {
  const { loading, authenticated, hasRole } = useAuth();
  const isAdmin = authenticated && hasRole('admin');
  const [data, setData] = useState<CandResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // 'all' | a code | null
  const [result, setResult] = useState<PubResp | null>(null);

  const load = useCallback(() => {
    api.get<CandResp>('/api/admin/publish/candidates').then(setData).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const publish = async (codes: string[], tag: string) => {
    if (!codes.length) return;
    setBusy(tag); setErr(null); setResult(null);
    try {
      const r = await api.post<PubResp>('/api/admin/publish', { codes });
      setResult(r);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="an-wrap"><div className="an-empty">Checking access…</div></div>;
  if (!isAdmin) return <div className="an-wrap"><div className="an-403"><h1>403 — Access Denied</h1><p>Publish to Production is admin only.</p></div></div>;

  const cands = data?.candidates || [];
  const allCodes = cands.map((c) => c.code);

  return (
    <>
      <h2 className="section-title">Publish to Production</h2>
      <p className="section-sub">
        Albums whose audio is on the studio drive (J:) but isn&apos;t fully live on the production CDN yet. Publishing uploads the
        tracks to the CDN, marks the album live, and deploys the site.
      </p>

      {data && !data.available && (
        <div className="notice" style={{ borderColor: 'var(--accent-gold)' }}>
          The J: studio drive isn&apos;t reachable from here. Open this page from the <strong>studio machine</strong> (http://localhost:3000/admin/publish-to-production)
          — that&apos;s where the bridge to J: + the CDN runs.
        </div>
      )}
      {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}
      {busy && <div className="notice" style={{ borderColor: 'var(--accent-gold)' }}>Publishing {busy === 'all' ? `all ${allCodes.length} albums` : busy}… uploading to the CDN and deploying — this can take a couple of minutes. Keep this tab open.</div>}

      {result && (
        <div className="notice" style={{ borderColor: result.ok ? 'var(--success)' : 'var(--accent)' }}>
          {result.ok ? '✅ Published + deployed.' : '⚠️ Finished with issues.'}{' '}
          {result.steps.filter((s) => s.step === 'published').length} album(s) published
          {(() => { const f = result.steps.find((s) => s.done); return f?.totals ? ` · site now ${f.totals.playableAlbums} live albums / ${f.totals.playableTracks} songs` : ''; })()}.
          {(() => { const f = result.steps.find((s) => s.done); return f && f.ok === false ? ` Error: ${f.error || 'see logs'}` : ''; })()}
        </div>
      )}

      {data?.available && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '14px 0' }}>
            <strong>{cands.length}</strong><span className="muted">album(s) ready to publish</span>
            <button className="an-btn an-btn-primary" style={{ marginLeft: 'auto' }}
                    disabled={!cands.length || !!busy} onClick={() => publish(allCodes, 'all')}>
              {busy === 'all' ? 'Publishing…' : `⬆ Publish All (${cands.length})`}
            </button>
            <button className="an-btn" disabled={!!busy} onClick={load}>Refresh</button>
          </div>

          <table className="admin-table">
            <thead><tr><th>Artist</th><th>Album</th><th style={{ textAlign: 'center' }}>Tracks (J: / live)</th><th></th></tr></thead>
            <tbody>
              {cands.map((c) => (
                <tr key={c.code}>
                  <td className="muted">{c.artist}</td>
                  <td><strong>{c.title}</strong> <span className="muted" style={{ fontSize: 11 }}>{c.code}</span></td>
                  <td style={{ textAlign: 'center' }}>{c.jTracks} / {c.live}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="an-btn an-btn-primary" disabled={!!busy} onClick={() => publish([c.code], c.code)}>
                      {busy === c.code ? 'Publishing…' : 'PUBLISH'}
                    </button>
                  </td>
                </tr>
              ))}
              {!cands.length && <tr><td colSpan={4} className="an-empty">Everything on J: is already live. 🎉</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
