import type { ReactNode } from 'react';
import { Eyebrow } from './Eyebrow';
import styles from './SectionHeader.module.css';

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  /** Right-aligned mono meta, e.g. a count. */
  aside?: ReactNode;
}

export function SectionHeader({ eyebrow, title, aside }: SectionHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className={styles.title}>{title}</h2>
      </div>
      {aside && <span className={styles.aside}>{aside}</span>}
    </div>
  );
}
