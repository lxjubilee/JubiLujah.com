'use client';

import type { Block } from '@/lib/torahsings/types';
import { useReadAloud } from './useReadAloud';
import styles from './ReadAloudButton.module.css';

interface ReadAloudButtonProps {
  id: string;
  blocks: Block[];
  presenter: string;
  audioUrl: string | null;
  /** Reading length, in minutes. */
  minutes: number;
}

/** "Read aloud" plus the voice/length meta the design system calls for. */
export function ReadAloudButton({ id, blocks, presenter, audioUrl, minutes }: ReadAloudButtonProps) {
  const { state, voice, toggle } = useReadAloud({ id, blocks, presenter, audioUrl });

  const speaking = state === 'speaking';
  const unsupported = state === 'unsupported';

  return (
    <div className={styles.row}>
      <button
        type="button"
        className={[styles.btn, speaking ? styles.active : ''].filter(Boolean).join(' ')}
        onClick={toggle}
        disabled={unsupported}
        aria-pressed={speaking}
      >
        <span className={styles.bars} aria-hidden="true">
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
        {unsupported ? 'Read aloud unavailable' : speaking ? 'Stop reading' : 'Read aloud'}
      </button>

      <span className={styles.meta}>
        {voice === 'inspire' ? presenter : 'Browser voice'} · {minutes} min
      </span>
    </div>
  );
}
