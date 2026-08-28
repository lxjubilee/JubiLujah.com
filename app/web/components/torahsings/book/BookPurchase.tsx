'use client';

import Link from 'next/link';
import { BOOK_PRICE_LABEL, YEARLY_PRICE_LABEL } from '@/lib/torahsings/format';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import styles from '@/app/book/page.module.css';

/**
 * The funnel. Membership is the better deal and the copy says so plainly —
 * the book is inside it. The standalone purchase stays available for anyone who
 * only wants the book.
 */
export function BookPurchase() {
  const { entitlement, purchaseBook } = useJubileeAccount();

  if (entitlement === 'member') {
    return (
      <>
        <div className={styles.priceRow}>
          <span className={styles.price}>Included</span>
          <span className={styles.priceNote}>With your membership</span>
        </div>
        <div className={styles.actions}>
          <Link href="/account" className="pill">
            Download from your account
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.priceRow}>
        <span className={styles.price}>{BOOK_PRICE_LABEL}</span>
        <span className={styles.priceNote}>Or free with membership</span>
      </div>

      <div className={styles.actions}>
        {purchaseBook ? (
          <button type="button" className="pill" onClick={purchaseBook}>
            Get the book — {BOOK_PRICE_LABEL}
          </button>
        ) : (
          <button type="button" className="pill" disabled aria-disabled="true">
            Get the book — {BOOK_PRICE_LABEL}
          </button>
        )}

        <Link href="/membership" className="pill pill--ghost">
          Membership — {YEARLY_PRICE_LABEL}/yr
        </Link>
      </div>

      {!purchaseBook && (
        <p className={styles.pending}>
          Standalone checkout activates when Jubilee billing is connected.
          <br />
          Membership already includes the book.
        </p>
      )}
    </>
  );
}
