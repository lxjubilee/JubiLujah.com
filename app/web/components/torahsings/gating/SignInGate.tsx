'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import styles from './SignInGate.module.css';

/**
 * The "sign in to save your favorites" gate, in JubileePraise's style: shown when a
 * signed-out visitor tries an account-only action (liking an album, for now).
 * Browsing stays open; this only guards the personal actions.
 *
 * `signIn()` routes to /signin with a returnTo back to the current page, so the
 * visitor lands back where they were after authenticating.
 */
export function SignInGate({ onClose }: { onClose: () => void }) {
  const { signIn } = useJubileeAccount();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to save your favorites"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
          </svg>
        </div>

        <h2 className={styles.title}>Sign in to save your favorites</h2>
        <p className={styles.body}>
          Browsing is open to everyone — but you&rsquo;ll need a free account to play tracks, build playlists, and
          save your favorites.
        </p>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={signIn}>
            Sign in
          </button>
          <Link href="/signup" className={styles.ghost}>
            Create account
          </Link>
        </div>

        <button type="button" className={styles.later} onClick={onClose}>
          Maybe later
        </button>
      </div>
    </div>
  );
}
