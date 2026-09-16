'use client';

/**
 * CROSS-SITE LINKS THAT ARRIVE SIGNED IN (2026-09-15) — for links outside the
 * rail, such as the header's Bible Chat button. Same contract as the rail's own
 * goSignedIn (components/InspireRail.tsx): a signed-in reader's click asks the API
 * for the address with a one-time Jubilee ID ticket on it (POST
 * /api/auth/sso/go-url) and navigates there; the site at the other end signs them
 * in, creating their account if they have none. Signed out, or on any failure,
 * the link is the plain link.
 */
import type { MouseEvent } from 'react';
import { api } from '@/lib/api';
import { getAccessToken, getRefreshToken } from '@/lib/auth';

const FAMILY_HOSTS = [
  'jubileeinspire.com', 'bornagaindna.com', 'kjubilee.com', 'jubileebibletalks.com',
  'jubileeverse.com', 'inspiremanna.com',
];

export function isFamilyHref(href: string): boolean {
  try {
    return FAMILY_HOSTS.includes(new URL(href).hostname.toLowerCase().replace(/^www\./, ''));
  } catch {
    return false;
  }
}

export async function goSignedIn(e: MouseEvent<HTMLAnchorElement>, href: string, newTab = false): Promise<void> {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!isFamilyHref(href) || !(getAccessToken() || getRefreshToken())) return;
  e.preventDefault();
  // Opened inside the click, or a popup blocker eats it.
  const tab = newTab ? window.open('about:blank', '_blank') : null;
  if (tab) tab.opener = null;
  let dest = href;
  try {
    const r = await api.post<{ url?: string | null }>('/api/auth/sso/go-url', { to: href });
    if (r && r.url) dest = r.url;
  } catch {
    /* the plain link */
  }
  if (tab) tab.location.href = dest;
  else if (newTab) window.open(dest, '_blank', 'noopener');
  else window.location.href = dest;
}
