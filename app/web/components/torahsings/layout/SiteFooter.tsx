import Link from 'next/link';
import styles from './SiteFooter.module.css';

/** A single centered copyright line, JubileePraise-style. */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        Copyright © {year} <strong className={styles.brand}>TorahSings.com</strong> ·{' '}
        The stars sang. The angels sang. Now you can hear it. ·{' '}
        <Link href="/terms" className={styles.link}>
          Terms of Use
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className={styles.link}>
          Privacy Policy
        </Link>
      </div>
    </footer>
  );
}
