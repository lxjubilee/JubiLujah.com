import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';
import styles from './PageHero.module.css';

/**
 * A consistent hero band for the interior pages — a gold-washed backdrop under
 * an eyebrow, a title, and an optional lede. Gives every page the same
 * cinematic top the home Hero and album pages already have.
 */
export function PageHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.inner}`}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className={styles.title}>{title}</h1>
        {children && <div className={styles.lede}>{children}</div>}
      </div>
    </section>
  );
}
