import Link from 'next/link';
import { Eyebrow } from '@/components/torahsings/system/Eyebrow';
import type { DerivationRow } from '@/lib/torahsings/derivation';
import type { Album } from '@/lib/torahsings/types';
import styles from './DerivationTable.module.css';

interface DerivationTableProps {
  album: Album;
  /** Computed by the engine — never hand-typed. */
  rows: DerivationRow[];
  modeLabel: string;
  noteLine: string;
}

/**
 * The Derivation tab. For the "show me how" thinker.
 *
 * Everything in the table is produced by `lib/derivation.ts` from the album's
 * source phrase. Change the phrase or the mode and the table follows. There is
 * nothing to keep in sync by hand, and nothing here that cannot be checked.
 */
export function DerivationTable({ album, rows, modeLabel, noteLine }: DerivationTableProps) {
  const { source, derivation } = album;
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <div>
      <p className="prose">{derivation.intro}</p>

      <div className={styles.source}>
        <span className={`glyph ${styles.hebrew}`}>{source.hebrew}</span>
        <span className={styles.translit}>{source.transliteration}</span>
        <span className={styles.english}>&ldquo;{source.english}&rdquo;</span>
        <span className={styles.ref}>{source.reference}</span>
      </div>

      <ol className={styles.steps}>
        {derivation.steps.map((step, i) => (
          <li key={i} className={styles.step}>
            {step}
          </li>
        ))}
      </ol>

      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption>
            {source.transliteration} · folded by seven · sounded in {modeLabel}
          </caption>
          <thead>
            <tr>
              <th scope="col">Glyph</th>
              <th scope="col">Name-sense</th>
              <th scope="col">Value</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.letter}-${i}`} className={row.isTonic ? styles.tonic : undefined}>
                <td className={`glyph ${styles.glyphCell}`}>{row.letter}</td>
                <td>
                  <span className={styles.sense}>{row.sense}</span>
                  <span className={styles.name}>{row.name}</span>
                </td>
                <td className={styles.value}>
                  {row.value}
                  <span className={styles.fold}> → {row.degree}</span>
                </td>
                <td className={styles.note}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.line}>
          <span className={styles.lineLabel}>The sequence</span>
          <span className={styles.lineValue}>{noteLine}</span>
          <span className={`${styles.lineLabel} ${styles.lineSum}`}>{`Sum ${total}`}</span>
        </div>
      </div>

      <p className="prose">{derivation.closing}</p>

      <div className={styles.withheld}>
        <Eyebrow className={styles.withheldLabel}>What we are not showing you</Eyebrow>
        <p className={styles.withheldBody}>{derivation.withheld}</p>
        <Link href="/membership" className={styles.kit}>
          The resources kit &#8594;
        </Link>
      </div>
    </div>
  );
}
