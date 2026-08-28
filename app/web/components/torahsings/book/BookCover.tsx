import styles from './BookCover.module.css';

/** The book-cover placeholder. Swap for the real jacket when it is designed. */
export function BookCover({ className }: { className?: string }) {
  return (
    <div className={[styles.cover, className].filter(Boolean).join(' ')} role="img" aria-label="Book cover">
      <div className={styles.glow} aria-hidden="true" />
      <span className={`glyph ${styles.glyph}`} aria-hidden="true">
        א
      </span>

      <span className={styles.mark}>Torah Sings</span>

      <div>
        <p className={styles.title}>Fragments of a Song</p>
        <p className={styles.sub}>
          Scattered through the Scriptures — and what it took to hear them.
        </p>
      </div>

      <span className={styles.foot}>The full transmission</span>
    </div>
  );
}
