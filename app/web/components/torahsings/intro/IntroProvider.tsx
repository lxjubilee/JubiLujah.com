'use client';

/**
 * The first-visit intro.
 *
 * Launches automatically the first time a visitor arrives at the home page, and
 * never again — a flag in storage sees to that. The "Replay the intro" link in
 * the hero reopens it any time, which is why the open/close state lives up here
 * rather than inside the modal.
 */

import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const SEEN_KEY = 'torah-sings.intro-seen';

interface IntroContextValue {
  open: boolean;
  openIntro: () => void;
  closeIntro: () => void;
}

const IntroContext = createContext<IntroContextValue | null>(null);

export function IntroProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // First visit, home page only. Runs after mount, so nothing about the
  // server-rendered markup depends on what this visitor has or has not seen.
  useEffect(() => {
    if (pathname !== '/') return;
    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // Storage unavailable. Do not ambush the visitor on every page load.
    }
    if (!seen) setOpen(true);
  }, [pathname]);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* nothing to do */
    }
  }, []);

  const openIntro = useCallback(() => setOpen(true), []);

  const closeIntro = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [markSeen]);

  const value = useMemo<IntroContextValue>(() => ({ open, openIntro, closeIntro }), [open, openIntro, closeIntro]);

  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>;
}

export function useIntro(): IntroContextValue {
  const ctx = useContext(IntroContext);
  if (!ctx) throw new Error('useIntro must be used inside <IntroProvider>');
  return ctx;
}
