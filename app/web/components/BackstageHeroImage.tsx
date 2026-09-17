'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// The article hero image, plus an admin-only vertical reposition control.
//
// Admins see up/down arrows on the hero; each click nudges the image's
// object-position Y (framing) by STEP%, live, and auto-saves after a short
// pause via /api/backstage/hero-position. The saved value is read back into
// piece.heroY, so the chosen framing shows for every visitor on reload.
//
// "Move up" reveals more of the LOWER part of the image (object-position Y →
// higher %); "Move down" reveals more of the TOP.

const STEP = 5; // % per click
const SAVE_DELAY = 700;

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export default function BackstageHeroImage({
  slug,
  src,
  song,
  initialY,
}: {
  slug: string;
  src: string;
  song: string;
  initialY: number;
}) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [y, setY] = useState(clamp(initialY));
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest nudged value that has NOT yet been confirmed saved (null when nothing
  // is pending). Lets us flush it on unmount so a quick reload/navigation right
  // after nudging still persists the framing.
  const pendingRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const pending = pendingRef.current;
      if (pending == null) return; // nothing unsaved
      // Flush with keepalive so the request survives the page unload; keepalive
      // supports the Bearer header (unlike navigator.sendBeacon).
      const token = getAccessToken();
      try {
        fetch('/backstage/hero-position', {
          method: 'POST',
          keepalive: true,
          credentials: 'omit',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ slug, y: pending }),
        });
      } catch {
        /* best-effort on teardown */
      }
    },
    [slug],
  );

  const scheduleSave = useCallback(
    (val: number) => {
      setStatus('saving');
      pendingRef.current = val;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await api.post('/backstage/hero-position', { slug, y: val });
          if (pendingRef.current === val) pendingRef.current = null; // confirmed saved
          setStatus('ok');
          setTimeout(() => setStatus('idle'), 1500);
        } catch {
          setStatus('err');
        }
      }, SAVE_DELAY);
    },
    [slug],
  );

  const nudge = useCallback(
    (delta: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setY((prev) => {
        const next = clamp(prev + delta);
        if (next !== prev) scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  // The framing and the save state ride in the buttons' tooltips, as on the
  // banner's arrows (HeroQr.tsx), where the discs carry no visible readout.
  const state =
    status === 'saving' ? ' · saving' : status === 'ok' ? ' · saved' : status === 'err' ? ' · SAVE FAILED' : '';
  const framing = `${Math.round(y)}%${state}`;

  return (
    <>
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="bsa-hero-image" src={src} alt="" style={{ objectPosition: `50% ${y}%` }} />
      ) : (
        <div className="bsa-hero-image bsa-hero-fallback">
          <span>{song}</span>
        </div>
      )}

      {/* THE SAME ARROWS AS THE BANNER'S (owner, 2026-09-17: "keep the same
          design of banner adjustment arrow on backstage pages"): kJubilee's flat
          red discs with its shaft-and-head icons, in the hero's corner column
          (.jp-hero-corner / .jp-hero-nudge, globals.css) — there is no QR code
          on an article, so the discs take the corner. Replaces the glass panel
          with chevrons and a "%" readout this control used to be. */}
      {isAdmin && src && (
        <div className="jp-hero-corner">
          <div className="jp-hero-nudge" role="group" aria-label="Reposition hero image">
            <button type="button" className="jp-hero-nudge-btn" onClick={nudge(STEP)} title={`Move image up (${framing})`} aria-label="Move image up">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
            <button type="button" className="jp-hero-nudge-btn" onClick={nudge(-STEP)} title={`Move image down (${framing})`} aria-label="Move image down">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
