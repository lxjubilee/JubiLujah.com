'use client';

import type { CSSProperties } from 'react';
import styles from './PlayButton.module.css';

/** Per the design system: 40px in lists, 52px in the player, 76px in the modal. */
export type PlaySize = 40 | 52 | 76;

interface PlayButtonProps {
  size?: PlaySize;
  playing?: boolean;
  /** Renders a hairline ring instead of a gold disc. */
  ghost?: boolean;
  /** Locked tracks show a keyhole and do not fire onClick. */
  locked?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  className?: string;
}

/**
 * The same disc, but presentational — for use inside a link, where nesting a
 * real button would be invalid and would swallow the navigation.
 */
export function PlayDisc({
  size = 40,
  locked = false,
  className,
}: {
  size?: PlaySize;
  locked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={[styles.btn, locked ? styles.ghost : '', className].filter(Boolean).join(' ')}
      style={{ '--play-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {locked ? <span className={styles.lock}>&#9679;</span> : <span className={styles.tri} />}
    </span>
  );
}

export function PlayButton({
  size = 52,
  playing = false,
  ghost = false,
  locked = false,
  disabled = false,
  label,
  onClick,
  className,
}: PlayButtonProps) {
  const isDisabled = disabled || locked;

  return (
    <button
      type="button"
      className={[styles.btn, ghost || locked ? styles.ghost : '', className].filter(Boolean).join(' ')}
      style={{ '--play-size': `${size}px` } as CSSProperties}
      aria-label={label}
      aria-pressed={locked ? undefined : playing}
      disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
    >
      {locked ? (
        <span className={styles.lock} aria-hidden="true">
          &#9679;
        </span>
      ) : playing ? (
        <span className={styles.pause} aria-hidden="true">
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      ) : (
        <span className={styles.tri} aria-hidden="true" />
      )}
    </button>
  );
}
