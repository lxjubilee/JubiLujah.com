'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';

// The image slot of a Backstage card, plus an admin-only "regenerate" control.
//
// Admins see a small icon at the top-right of the image. Clicking it asks the
// desktop Article Image Studio (via /api/backstage/regenerate) to produce a NEW
// image for this piece from the same logged-in ChatGPT session, then swaps the
// card art in place (cache-busted) once the Studio reports done. The button
// lives inside the card's <Link>, so its click is stopped from navigating.
//
// Generation happens in the Studio, which must be running and logged in; the
// request is queued regardless, so if the Studio is closed the image updates
// whenever it next drains the queue.

type Phase = 'idle' | 'queued' | 'working' | 'offline' | 'done' | 'error';

const POLL_MS = 4000;
const TIMEOUT_MS = 8 * 60 * 1000; // Studio allows ~6 min per image; give headroom.

export default function BackstageCardImage({
  slug,
  src,
  song,
}: {
  slug: string;
  src: string;
  song: string;
}) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [imgSrc, setImgSrc] = useState(src);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const poll = useCallback(async () => {
    try {
      const res = await api.get<{
        status: 'pending' | 'idle' | 'done' | 'error';
        image?: string;
        version?: number;
        message?: string;
        studioOnline?: boolean;
      }>(`/api/backstage/regenerate?slug=${encodeURIComponent(slug)}`);
      if (res.status === 'done') {
        stopPolling();
        // Served via the dynamic route (public/ isn't served for post-build
        // files); ?v busts the browser cache to the freshly-generated image.
        setImgSrc(`/backstage/img/${slug}?v=${res.version || Date.now()}`);
        setPhase('done');
        setTimeout(() => setPhase('idle'), 2500);
        return;
      }
      if (res.status === 'error') {
        stopPolling();
        setPhase('error');
        setMessage(res.message || 'Generation failed');
        return;
      }
      // Still queued (pending/idle). If the Studio isn't running, say so plainly
      // and keep waiting (no timeout) — it'll generate once opened + logged in.
      if (res.studioOnline === false) {
        setPhase('offline');
        setMessage('Image Studio is offline — open it and sign into ChatGPT.');
        startedRef.current = Date.now(); // don't time out while waiting on the Studio
        return;
      }
      // Studio is up and working the queue.
      setPhase('working');
      if (Date.now() - startedRef.current > TIMEOUT_MS) {
        stopPolling();
        setPhase('error');
        setMessage('Timed out — the Studio is running but did not produce an image.');
      }
    } catch {
      /* transient — keep polling */
    }
  }, [slug, stopPolling]);

  const onRegenerate = useCallback(
    async (e: React.MouseEvent) => {
      // The card is a <Link>; don't navigate when the icon is clicked.
      e.preventDefault();
      e.stopPropagation();
      if (phase === 'queued' || phase === 'working') return;
      setPhase('queued');
      setMessage('');
      startedRef.current = Date.now();
      try {
        const res = await api.post<{ queued?: boolean; studioOnline?: boolean }>(
          '/api/backstage/regenerate',
          { slug },
        );
        // Immediate, actionable feedback instead of a silent spinner.
        if (res.studioOnline === false) {
          setPhase('offline');
          setMessage('Image Studio is offline — open it and sign into ChatGPT.');
        } else {
          setPhase('working');
        }
        stopPolling();
        pollRef.current = setInterval(poll, POLL_MS);
      } catch (err) {
        setPhase('error');
        setMessage(err instanceof Error ? err.message : 'Could not queue');
      }
    },
    [slug, phase, poll, stopPolling],
  );

  const busy = phase === 'queued' || phase === 'working';

  return (
    <div className="bs-card-image">
      {imgSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={imgSrc} alt="" loading="lazy" />
      ) : (
        <span className="bs-card-image-fallback">{song}</span>
      )}

      {isAdmin && (
        <button
          type="button"
          className={`bs-card-regen${busy ? ' is-busy' : ''}${phase === 'offline' ? ' is-offline' : ''}${phase === 'error' ? ' is-error' : ''}${phase === 'done' ? ' is-done' : ''}`}
          onClick={onRegenerate}
          disabled={busy}
          title={
            phase === 'offline'
              ? message || 'Image Studio is offline — open it and sign into ChatGPT.'
              : phase === 'error'
                ? message || 'Generation failed — click to retry'
                : busy
                  ? 'Generating a new image in the Studio…'
                  : 'Regenerate this image'
          }
          aria-label="Regenerate image"
        >
          {phase === 'done' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : phase === 'offline' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={busy ? 'bs-spin' : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <polyline points="21 3 21 9 15 9" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
