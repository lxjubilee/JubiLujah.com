'use client';

import Link from 'next/link';
import { YEARLY_PRICE_LABEL } from '@/lib/torahsings/format';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import styles from './Plans.module.css';

interface PlansProps {
  /** Free-tier copy is derived from the data, never asserted independently. */
  freeAlbumCount: string;
  freeSongsPerAlbum: string;
  freeArticleCount: string;
  freeLessonLevel: string;
  /** Short form of the free lesson reach, for the compare table. */
  freeLessonShort: string;
}

const TREASURY: readonly string[] = [
  'The full Torah Sings library — every album now, and every album to come',
  'Every Hebraic Christianity article, read aloud in the Inspire voice',
  'The complete Learn Hebrew curriculum, with Zev and Zariah',
  'The book explaining the discovery, included',
  'Early access to new topic albums as they release',
  'Behind-the-scenes and exclusive content',
  'The downloadable resources kit — the methodology, at the disclosed level',
  'One Jubilee Account, good across the whole ecosystem',
];

/** Sentence case — the derived counts arrive lowercase ("two full albums"). */
const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A cell is either a yes/no mark or a highlighted text value. */
type Cell = boolean | string;
interface CompareRow {
  label: string;
  taste: Cell;
  treasury: Cell;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M8.2 14.3 4.4 10.5l1.4-1.4 2.4 2.4 5.6-5.6 1.4 1.4z" />
    </svg>
  );
}

function CrossIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M14.3 6.7 11 10l3.3 3.3-1.4 1.4L9.6 11.4 6.3 14.7 4.9 13.3 8.2 10 4.9 6.7l1.4-1.4L9.6 8.6l3.3-3.3z" />
    </svg>
  );
}

function CompareCell({ value, featured }: { value: Cell; featured?: boolean }) {
  const cls = featured ? styles.featuredCol : undefined;
  if (value === true) {
    return (
      <td className={cls}>
        <CheckIcon className={styles.ok} />
        <span className="sr-only">Included</span>
      </td>
    );
  }
  if (value === false) {
    return (
      <td className={cls}>
        <CrossIcon className={styles.no} />
        <span className="sr-only">Not included</span>
      </td>
    );
  }
  return (
    <td className={cls}>
      <span className={styles.val}>{sentenceCase(value)}</span>
    </td>
  );
}

export function Plans({
  freeAlbumCount,
  freeSongsPerAlbum,
  freeArticleCount,
  freeLessonLevel,
  freeLessonShort,
}: PlansProps) {
  const { session, entitlement, signIn, subscribe } = useJubileeAccount();

  const isMember = entitlement === 'member';
  const signedIn = session !== null;

  const taste: readonly string[] = [
    `${freeAlbumCount}, streaming in full`,
    `The first ${freeSongsPerAlbum} of every other album`,
    `${freeArticleCount} from the Hebraic Christianity library`,
    freeLessonLevel,
    'The Article and Derivation tabs on every album — always open',
  ];

  // The compare rows read straight off the same derived copy, so the table can
  // never promise a taste the gating does not actually serve.
  const compareRows: readonly CompareRow[] = [
    { label: 'Full-streaming albums', taste: freeAlbumCount, treasury: 'Every album' },
    { label: 'Songs on every other album', taste: `First ${freeSongsPerAlbum}`, treasury: 'All songs' },
    { label: 'Hebraic Christianity articles', taste: freeArticleCount, treasury: 'Full library, narrated' },
    { label: 'Learn Hebrew curriculum', taste: freeLessonShort, treasury: 'Complete, all levels' },
    { label: 'Article & Derivation tabs', taste: true, treasury: true },
    { label: 'The book explaining the discovery', taste: false, treasury: true },
    { label: 'Early access to new albums', taste: false, treasury: true },
    { label: 'Behind-the-scenes & exclusive content', taste: false, treasury: true },
    { label: 'Downloadable resources kit', taste: false, treasury: true },
    { label: 'One Jubilee Account, ecosystem-wide', taste: true, treasury: true },
    { label: 'Price', taste: '$0', treasury: `${YEARLY_PRICE_LABEL}/yr` },
  ];

  return (
    <div className={styles.plans}>
      <div className={styles.cardGrid}>
        {/* ---- Free ---- */}
        <div className={styles.card}>
          {signedIn && !isMember && <span className={`${styles.badge} ${styles.current}`}>Current plan</span>}

          <h2 className={styles.name}>The taste</h2>
          <p className={styles.tagline}>Enough to know whether this is real.</p>

          <div className={styles.priceRow}>
            <span className={styles.price}>$0</span>
            <span className={styles.period}>Free, always</span>
          </div>
          <p className={styles.desc}>The doorway in — real albums, real articles, the first level of Hebrew.</p>

          <ul className={styles.features}>
            {taste.map((item) => (
              <li key={item} className={styles.feature}>
                <CheckIcon className={styles.check} />
                <span>{sentenceCase(item)}</span>
              </li>
            ))}
          </ul>

          {signedIn ? (
            <Link href="/" className={`pill pill--ghost ${styles.cta}`}>
              Start listening
            </Link>
          ) : (
            <button type="button" className={`pill pill--ghost ${styles.cta}`} onClick={signIn}>
              Start free
            </button>
          )}
        </div>

        {/* ---- Yearly ---- */}
        <div className={`${styles.card} ${styles.featured}`}>
          {isMember ? (
            <span className={`${styles.badge} ${styles.current}`}>Current plan</span>
          ) : (
            <span className={styles.badge}>Recommended</span>
          )}

          <h2 className={styles.name}>The full treasury</h2>
          <p className={styles.tagline}>Partners in ongoing revelation.</p>

          <div className={styles.priceRow}>
            <span className={styles.price}>{YEARLY_PRICE_LABEL}</span>
            <span className={styles.period}>Per year</span>
          </div>
          <p className={styles.desc}>
            Everything uncovered so far — and everything uncovered while your membership is active.
          </p>

          <ul className={styles.features}>
            {TREASURY.map((item) => (
              <li key={item} className={styles.feature}>
                <CheckIcon className={styles.check} />
                <span>{sentenceCase(item)}</span>
              </li>
            ))}
          </ul>

          {isMember ? (
            <div className={styles.memberState}>
              <span className={styles.memberLabel}>You are a partner</span>
              <p className={styles.memberBody}>
                Renews {session?.subscription.renewsAt ?? 'annually'}. Everything above is already open to you.
              </p>
            </div>
          ) : (
            <>
              <button type="button" className={`pill ${styles.cta}`} onClick={subscribe}>
                Become a partner — {YEARLY_PRICE_LABEL}/yr
              </button>
              <p className={styles.ssoNote}>
                Checkout runs through your Jubilee Account.
                <br />
                One sign-in across the ecosystem.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ---- Compare plans ---- */}
      <section className={styles.compare} aria-labelledby="compare-heading">
        <div className={styles.compareHead}>
          <span className="eyebrow eyebrow--dot">Side by side</span>
          <h2 id="compare-heading" className={styles.compareTitle}>
            Compare the two pathways
          </h2>
        </div>

        <div className={styles.cmpScroll}>
          <table className={styles.cmpTable}>
            <thead>
              <tr>
                <th className={styles.feat} scope="col">
                  Feature
                </th>
                <th scope="col">The taste</th>
                <th className={styles.featuredCol} scope="col">
                  The full treasury
                </th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.label}>
                  <td className={styles.feat}>{row.label}</td>
                  <CompareCell value={row.taste} />
                  <CompareCell value={row.treasury} featured />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.fineprint}>
          The full treasury is one yearly commitment. It covers everything above, and everything uncovered while
          your membership is active.
        </p>
      </section>
    </div>
  );
}
