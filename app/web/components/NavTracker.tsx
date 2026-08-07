'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { recordPath } from '@/lib/navHistory';

// Records each visited path into the module-level nav history (lib/navHistory).
// Mounted once in the root layout so it observes every client-side navigation.
export default function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordPath(pathname);
  }, [pathname]);
  return null;
}
