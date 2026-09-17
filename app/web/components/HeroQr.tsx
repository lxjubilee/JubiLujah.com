'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useHeroPositions } from '@/stores/heroPositions';

// ============================================================================
// THE QR CODE ON A HERO, the share row it opens, and the admin's red arrows
// under them (owner, 2026-09-16 and 2026-09-17, "like kJubilee": public/css/
// pages/home.css there, .hero-qr and .img-nudge; the share buttons are its
// station page's share card, .share-btn).
//
//   the code     top right, on a white plate. A phone that scans it opens the
//                album on JubileePraise and starts it (the album's redirector
//                token points at /album?c=<code>&t=1, which AlbumApp plays on
//                arrival). Hovering says "Scan to listen".
//   the share    CLICKING THE CODE OPENS A ROW OF SHARE BUTTONS DIRECTLY UNDER
//   row          IT — Facebook, X, LinkedIn, copy the link — and clicking it
//                again closes them (owner, 2026-09-17). So does Escape, a click
//                anywhere else, or the carousel moving to another album. What
//                is shared is the album's own address, /album?c=<code>, on this
//                site's origin — the QR's redirector link is for phones, the
//                share link is for people.
//   the arrows   admins only: move the hero picture up or down in its frame,
//                for everyone (stores/heroPositions.ts).
//
// ONE COLUMN, NOT THREE ABSOLUTE BOXES. The plate, the share row and the arrows
// stack in a single flex column pinned to the corner (.jp-hero-corner), so the
// arrows sit 10px under whatever is above them: when the share row mounts they
// move down by exactly its height, and when it unmounts they are back where
// they were — the layout does it, nothing is measured or animated by hand.
//
// Not on phones: a QR code is for the screen you are NOT holding (the same rule
// kJubilee follows). The whole column is hidden there.
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

// The album's shareable address. Read at click time so the origin is whatever
// serves the page (localhost in dev, www.jubileepraise.com live).
function albumUrl(code: string): string {
  return `${window.location.origin}/album?c=${encodeURIComponent(code)}`;
}

// Clipboard write with the legacy execCommand fallback (as BackstageShare.tsx).
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// A named popup, not a tab: every network's chooser closes itself again, and a
// tab would leave the reader on a spent page (kJubilee's reasoning, kept).
function openShare(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer,width=600,height=520');
}

export default function HeroQr({ code, title }: { code: string; title: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const cornerRef = useRef<HTMLDivElement | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const nudge = useHeroPositions((s) => s.nudge);
  const y = useHeroPositions((s) => s.map[`hero-${code.toLowerCase()}`] ?? 0);

  useEffect(() => {
    let live = true;
    setToken(null);
    setOpen(false);            // a new album closes the row opened for the last one
    albumToken(code).then((t) => { if (live) setToken(t); });
    return () => { live = false; };
  }, [code]);

  // Escape or a click outside the corner closes the row.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => {
      if (cornerRef.current && !cornerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const shareFacebook = useCallback(() => {
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(albumUrl(code))}`);
  }, [code]);
  const shareX = useCallback(() => {
    openShare(`https://twitter.com/intent/tweet?url=${encodeURIComponent(albumUrl(code))}&text=${encodeURIComponent(title)}`);
  }, [code, title]);
  const shareLinkedIn = useCallback(() => {
    openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(albumUrl(code))}`);
  }, [code]);
  const copyLink = useCallback(async () => {
    const ok = await copyText(albumUrl(code));
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Every handler stops propagation: the corner sits over the hero's own
  // click-through link (home) and the banner's controls (album page).
  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

  return (
    <div className="jp-hero-corner" ref={cornerRef}>
      {/* No title attribute on the button: the .jp-hero-qr-tip span IS the
          label, and a title on top of it drew the browser's own tooltip a second
          later — "Scan to listen" twice (owner, 2026-09-17). kJubilee's
          kj-qr-tip.js replaced its title for the same reason. The aria-label
          carries the accessible name. */}
      {token && (
        <button
          type="button"
          className={`jp-hero-qr${open ? ' is-open' : ''}`}
          onClick={(e) => { stop(e); setOpen((o) => !o); }}
          aria-expanded={open}
          aria-controls={`jp-hero-share-${code}`}
          aria-label={`Share ${title}, or scan the code to listen on your phone`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/qr/${token}.svg?qz=2`} alt="" width={53} height={53} />
          <span className="jp-hero-qr-tip" aria-hidden="true">Scan to listen</span>
        </button>
      )}

      {token && open && (
        <div className="jp-hero-share" id={`jp-hero-share-${code}`} role="group" aria-label={`Share ${title}`}>
          <button type="button" className="jp-hero-share-btn share-facebook" onClick={(e) => { stop(e); shareFacebook(); }} aria-label="Share on Facebook">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z" /></svg>
          </button>
          <button type="button" className="jp-hero-share-btn share-twitter" onClick={(e) => { stop(e); shareX(); }} aria-label="Share on X">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23 4.98a9.06 9.06 0 0 1-2.6.72 4.53 4.53 0 0 0 1.99-2.5 9.06 9.06 0 0 1-2.87 1.1 4.52 4.52 0 0 0-7.7 4.12A12.83 12.83 0 0 1 2.5 3.75a4.52 4.52 0 0 0 1.4 6.03 4.5 4.5 0 0 1-2.05-.57v.06a4.52 4.52 0 0 0 3.63 4.43 4.53 4.53 0 0 1-2.04.08 4.52 4.52 0 0 0 4.22 3.14A9.07 9.07 0 0 1 1 19.54a12.8 12.8 0 0 0 6.92 2.03c8.3 0 12.85-6.88 12.85-12.85 0-.2 0-.39-.01-.58A9.18 9.18 0 0 0 23 4.98z" /></svg>
          </button>
          <button type="button" className="jp-hero-share-btn share-linkedin" onClick={(e) => { stop(e); shareLinkedIn(); }} aria-label="Share on LinkedIn">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" /></svg>
          </button>
          <button type="button" className={`jp-hero-share-btn share-copy${copied ? ' copied' : ''}`} onClick={(e) => { stop(e); void copyLink(); }} aria-label={copied ? 'Link copied' : 'Copy link'}>
            {copied ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            )}
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="jp-hero-nudge" role="group" aria-label="Move the hero picture">
          {/* The arrows are kJubilee's exactly (owner, 2026-09-17): its NUDGE_UP /
              NUDGE_DOWN in public/js/pages/home.js — a shaft with a head, 15px,
              stroke 2.4, round caps and joins — not the bare chevrons these were. */}
          <button type="button" className="jp-hero-nudge-btn" onClick={(e) => { stop(e); nudge(code, 5); }} title={`Move picture up (${Math.round(y)}%)`} aria-label="Move picture up">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
          <button type="button" className="jp-hero-nudge-btn" onClick={(e) => { stop(e); nudge(code, -5); }} title={`Move picture down (${Math.round(y)}%)`} aria-label="Move picture down">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
