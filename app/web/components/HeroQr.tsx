'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useHeroPositions } from '@/stores/heroPositions';

// ============================================================================
// THE QR CODE ON A HERO, and the admin's red arrows under it (owner, 2026-09-16,
// "like kJubilee": public/css/pages/home.css there, .hero-qr and .img-nudge).
//
//   the code     top right, on a white plate. A phone that scans it opens the
//                album on JubileePraise and starts it (the album's redirector
//                token points at /album?c=<code>&t=1, which AlbumApp plays on
//                arrival). Hovering says "Scan to listen"; clicking it plays the
//                album right here, since the visitor is already on the site.
//   the arrows   admins only: move the hero picture up or down in its frame,
//                for everyone (stores/heroPositions.ts).
//
// Not on phones: a QR code is for the screen you are NOT holding (the same rule
// kJubilee follows). The arrows are hidden there too.
// ============================================================================

const tokenCache = new Map<string, Promise<string | null>>();
function albumToken(code: string): Promise<string | null> {
  let p = tokenCache.get(code);
  if (!p) {
    p = fetch(`/api/redirector/codes/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { album?: { token: string } | null } | null) => d?.album?.token || null)
      .catch(() => null);
    tokenCache.set(code, p);
  }
  return p;
}

export default function HeroQr({ code, title, onPlay }: { code: string; title: string; onPlay: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const nudge = useHeroPositions((s) => s.nudge);
  const y = useHeroPositions((s) => s.map[`hero-${code.toLowerCase()}`] ?? 0);

  useEffect(() => {
    let live = true;
    setToken(null);
    albumToken(code).then((t) => { if (live) setToken(t); });
    return () => { live = false; };
  }, [code]);

  return (
    <>
      {token && (
        <button
          type="button"
          className="jp-hero-qr"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPlay(); }}
          title="Scan to listen"
          aria-label={`Play ${title}. Or scan the code to listen on your phone`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/qr/${token}.svg?qz=2`} alt="" width={53} height={53} />
          <span className="jp-hero-qr-tip" aria-hidden="true">Scan to listen</span>
        </button>
      )}
      {isAdmin && (
        <div className={`jp-hero-nudge${token ? '' : ' no-qr'}`} role="group" aria-label="Move the hero picture">
          <button type="button" className="jp-hero-nudge-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); nudge(code, 5); }} title={`Move picture up (${Math.round(y)}%)`} aria-label="Move picture up">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>
          </button>
          <button type="button" className="jp-hero-nudge-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); nudge(code, -5); }} title={`Move picture down (${Math.round(y)}%)`} aria-label="Move picture down">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
