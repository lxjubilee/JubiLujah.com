'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { api } from '@/lib/api';

// ============================================================================
// Real-time Active Listeners (admin). Polls /api/admin/active-listeners every
// few seconds and shows who is listening right now + a live equalizer bar.
// NOTE: the bar is a visualizer animation — the server can't tap each listener's
// audio stream, so it animates lively rather than literally syncing to the beat.
// ============================================================================
interface Listener {
  session_id: string;
  name: string;
  location: string;
  album: string;
  track: number | null;
  song: string;
  code: string | null;
  cover: string | null;
}

// Album cover thumbnail; falls back to a note glyph when there's no cover art.
function CoverThumb({ src, alt }: { src: string | null; alt: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return <span className="al-thumb al-thumb-empty"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="al-thumb" src={src} alt={alt} onError={() => setBroken(true)} />;
}

// A row of bars that bounce like an equalizer. Seeded per-row so each looks alive
// and distinct. Pure CSS animation (see analytics.css .al-eq).
function Equalizer({ seed }: { seed: number }) {
  const bars = 18;
  return (
    <div className="al-eq" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const dur = 0.55 + ((seed * 7 + i * 13) % 70) / 100; // 0.55–1.25s
        const delay = ((seed * 5 + i * 17) % 90) / 100;       // 0–0.9s
        return <span key={i} style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }} />;
      })}
    </div>
  );
}

export default function ActiveListeners() {
  const { loading, authenticated, hasRole } = useAuth();
  const isAdmin = authenticated && hasRole('admin');
  const [listeners, setListeners] = useState<Listener[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!isAdmin) return;
    const tick = () => api.get<{ listeners: Listener[] }>('/api/admin/active-listeners')
      .then((d) => { setListeners(d.listeners); setErr(null); })
      .catch((e) => setErr(e.message));
    tick();
    timer.current = setInterval(tick, 4000);
    return () => clearInterval(timer.current);
  }, [isAdmin]);

  if (loading) return <div className="an-wrap"><div className="an-empty">Checking access…</div></div>;
  if (!isAdmin) return <div className="an-wrap"><div className="an-403"><h1>403 — Access Denied</h1><p>Active Listeners is restricted to administrators.</p></div></div>;

  return (
    <>
      <h2 className="section-title">
        Active Listeners
        <span className="al-live-dot" /> <span className="al-live-label">LIVE</span>
      </h2>
      <p className="section-sub">
        Who is listening right now, updated every few seconds. {listeners ? `${listeners.length} active` : ''}
      </p>
      {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}

      <table className="admin-table">
        <thead>
          <tr><th>Name</th><th>Location</th><th>Now Playing</th><th style={{ width: 170 }}>Live</th></tr>
        </thead>
        <tbody>
          {listeners?.map((l, i) => (
            <tr key={l.session_id}>
              <td><strong>{l.name}</strong></td>
              <td className="muted">{l.location}</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CoverThumb src={l.cover} alt={l.album} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{l.album}</strong>
                    {l.track != null && <span className="muted" style={{ fontSize: 12 }}> (Track {l.track})</span>}
                    <div style={{ color: 'var(--accent-gold)', fontSize: 13 }}>{l.song}</div>
                  </div>
                </div>
              </td>
              <td><Equalizer seed={i + 1} /></td>
            </tr>
          ))}
          {listeners && listeners.length === 0 && (
            <tr><td colSpan={4} className="an-empty">No one is listening right now.</td></tr>
          )}
          {!listeners && !err && <tr><td colSpan={4} className="an-empty">Loading…</td></tr>}
        </tbody>
      </table>
    </>
  );
}
