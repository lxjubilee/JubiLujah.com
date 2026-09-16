'use client';
// ============================================================================
// Cross-site sign-in — the browser's half (middleware.ts does the rest).
//
// Ported from JubileeInspire's src/lib/ssoTicket.ts. Only the things a server
// cannot do live here:
//   STRIP   take a spent ticket and the ?sso marker out of the address bar.
//   PLANT   after signing in HERE with a password, teach the SSO this browser so
//           the other family sites can recognise it. Needs the bearer token,
//           which lives in localStorage, so the middleware cannot do it.
//   ASK     once, directly, when lib/auth.ts just cleared a stale "signed in"
//           marker that the middleware had already trusted on this request.
// ============================================================================
import { api } from '@/lib/api';

const SSO_BASE = (process.env.NEXT_PUBLIC_SSO_BASE || 'https://sso.jubileeinspire.com').replace(/\/$/, '');
const TICKET_RE = /^[0-9a-f]{64}$/;
const PLANTED_KEY = 'jubileeSsoPlanted';
const ASKED_KEY = 'jubileeSsoAsked';
const STALE_RETRY_KEY = 'jubileeStaleRetry';

// Hosts the SSO accepts for the silent check — must agree with middleware.ts.
const FAMILY_HOSTS = (process.env.NEXT_PUBLIC_FAMILY_SSO_HOSTS || 'jubileepraise.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

export function familyHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase().replace(/^www\./, '');
  return FAMILY_HOSTS.includes(h) || (process.env.NODE_ENV === 'development' && h === 'localhost');
}

function mark(key: string) { try { window.sessionStorage.setItem(key, '1'); } catch { /* ignore */ } }
function marked(key: string) { try { return window.sessionStorage.getItem(key) === '1'; } catch { return false; } }

/**
 * Remove a spent ticket and the ?sso marker WITHOUT navigating.
 *
 * replaceState, not pushState: the ticket must not survive in history. Only a
 * ticket-shaped `t` is removed — /album?c=<code>&t=<n> uses `t` for the track.
 */
export function stripSsoMarkers(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    if (TICKET_RE.test(url.searchParams.get('t') || '')) { url.searchParams.delete('t'); changed = true; }
    if (url.searchParams.has('sso')) { url.searchParams.delete('sso'); changed = true; }
    if (!changed) return;
    const qs = url.searchParams.toString();
    window.history.replaceState(window.history.state, '', url.pathname + (qs ? `?${qs}` : '') + url.hash);
  } catch { /* cosmetic only */ }
}

/**
 * The middleware settled the plant question on the way in — FOR THIS ACCOUNT.
 * One-shot, and only true when the cookie names the user asking: a different
 * person signing in within its two minutes must still plant, or the SSO keeps
 * vouching for whoever arrived first.
 */
function tookPlanted(userKey: string): boolean {
  try {
    const hit = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith('ji_planted='));
    if (!hit) return false;
    document.cookie = 'ji_planted=; Max-Age=0; Path=/';
    return decodeURIComponent(hit.slice('ji_planted='.length)) === userKey;
  } catch {
    return false;
  }
}

/**
 * Signed in HERE: make sure the SSO's origin knows this browser.
 *
 * KEYED TO THE USER, not just the tab: sign in as one person, out, then in as
 * another in the same tab, and the second must re-plant — otherwise the SSO
 * cookie keeps pointing at the first account and a sibling site would sign the
 * second person in as the first.
 */
export async function plantFamily(userKey: string): Promise<boolean> {
  if (typeof window === 'undefined' || !userKey || !familyHost()) return false;
  const key = `${PLANTED_KEY}:${userKey}`;
  if (marked(key)) return false;
  // Arrived on a ticket: the middleware already planted (or knew it need not).
  // Repeating it here is what boots the application twice.
  if (tookPlanted(userKey)) { mark(key); return false; }
  mark(key);
  try {
    const res = await api.post<{ url?: string | null }>('/api/auth/sso/plant-url', { return: window.location.href });
    if (!res?.url) return false;
    window.location.replace(res.url);
    return true;
  } catch {
    return false; // never block a page over this
  }
}

/**
 * Signed OUT here, and the middleware skipped the SSO because of a stale marker:
 * ask once, directly. Guarded per tab so a genuinely signed-out reader is sent
 * at most once, never in a loop.
 */
export function askFamilyAfterStaleMarker(): boolean {
  if (typeof window === 'undefined' || !familyHost()) return false;
  if (marked(STALE_RETRY_KEY) || marked(ASKED_KEY)) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('sso') === 'none' || TICKET_RE.test(params.get('t') || '')) return false;
  mark(STALE_RETRY_KEY);
  mark(ASKED_KEY);
  try {
    const back = new URL(window.location.href);
    back.searchParams.set('sso', 'asked');
    const ask = new URL(`${SSO_BASE}/api/auth/continue`);
    ask.searchParams.set('return', back.toString());
    window.location.replace(ask.toString());
    return true;
  } catch {
    return false;
  }
}
