'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { previousPath } from '@/lib/navHistory';

// The article hero's "← Backstage" button.
//
// If the reader came from the Backstage grid, this goes history.back() so the
// browser restores the grid's exact scroll position (the card they clicked) —
// made instant by ScrollRestoreGuard. Otherwise (direct entry, or arrived via
// "More from Backstage"), it falls back to a normal push to the grid top.
export default function BackstageBackButton() {
  const router = useRouter();

  const onClick = (e: React.MouseEvent) => {
    if (previousPath() === '/backstage' && typeof window !== 'undefined' && window.history.length > 1) {
      e.preventDefault();
      router.back();
    }
    // else: let the <Link> perform its normal navigation to /backstage.
  };

  return (
    <Link href="/backstage" className="bsa-back" onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span>Backstage</span>
    </Link>
  );
}
