'use client';
import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { usePlayer } from '@/stores/player';
import { useAuthGate } from '@/stores/authGate';

// ============================================================================
// Gates music playback behind sign-in. Guests can browse the whole site, but
// pressing play opens this prompt instead of starting audio. Two jobs:
//   1) keep the player store's `blockPlayback` flag in sync with auth state;
//   2) render the "sign in to play" modal when a guest triggers playback.
// ============================================================================
export default function PlaybackGate() {
  const { authenticated, loading } = useAuth();
  const setGate = usePlayer((s) => s.setGate);
  const open = useAuthGate((s) => s.open);
  const hide = useAuthGate((s) => s.hide);
  const title = useAuthGate((s) => s.title);

  // Block only once auth has resolved to a guest — never during the initial
  // load, so a returning signed-in user is not blocked on first click.
  useEffect(() => { setGate(!authenticated && !loading); }, [authenticated, loading, setGate]);

  if (!open) return null;

  const returnTo = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
  const signinHref = `/signin?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="rv-modal-backdrop" onClick={hide}>
      <div className="rv-modal rv-modal-sm gate-modal" role="dialog" aria-modal="true" aria-label="Sign in to play music" onClick={(e) => e.stopPropagation()}>
        <div className="gate-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg>
        </div>
        <h3 className="gate-title">{title}</h3>
        <p className="gate-text">
          Browsing is open to everyone — but you’ll need a free account to play tracks,
          build playlists, and save your favorites.
        </p>
        <div className="gate-actions">
          <a className="rv-btn rv-btn-primary" href={signinHref}>Sign in</a>
          <a className="rv-btn rv-btn-ghost" href="/signup">Create account</a>
        </div>
        <button className="gate-dismiss" type="button" onClick={hide}>Maybe later</button>
      </div>
    </div>
  );
}
