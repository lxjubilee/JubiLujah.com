'use client';

import { useEffect } from 'react';

// Keeps CSS smooth-scrolling for user-initiated anchor jumps while making the
// browser/router's scroll RESTORATION instant on back/forward.
//
// `html { scroll-behavior: smooth }` also animates the `window.scrollTo(...)`
// that Next's App Router uses to restore position on a popstate navigation, so
// returning to the Backstage grid visibly glides from the top down to the card
// instead of landing on it. On each popstate we flag <html data-nav-restoring>
// (CSS switches that one restore to `scroll-behavior: auto`), then clear it once
// the restore has settled so normal smooth scrolling resumes.
export default function ScrollRestoreGuard() {
  useEffect(() => {
    const el = document.documentElement;
    let timer: ReturnType<typeof setTimeout>;
    const onPopState = () => {
      el.setAttribute('data-nav-restoring', '');
      clearTimeout(timer);
      // Hold through the router's render + restore scrollTo, then re-enable smooth.
      timer = setTimeout(() => el.removeAttribute('data-nav-restoring'), 500);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
