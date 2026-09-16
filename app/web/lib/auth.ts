'use client';
// ============================================================================
// Bearer-token auth store. The session token lives in localStorage under
// `jubileeInspireAuth`; lib/api.ts sends it as `Authorization: Bearer <token>`.
//
// Trade-off vs. an HttpOnly session cookie: localStorage is readable by any
// script running on the page, so a successful XSS can exfiltrate the token. The
// upside is no cookie/CSRF handling — the server authenticates purely on the
// Bearer JWT and has no CSRF layer. Keep the app XSS-clean.
//
// CROSS-SITE SIGN-IN adds two small cookies around that store (middleware.ts):
//   ji_bootstrap  one-shot, 60s — the session a family ticket just produced,
//                 left by the middleware because a server cannot write
//                 localStorage. Adopted on the first read below, then cleared.
//   ji_signed_in  "1" while a session exists here. The middleware cannot see
//                 localStorage either, and this is how it knows not to ask the
//                 SSO. Written and erased WITH the session, so it cannot drift.
// ============================================================================
const STORAGE_KEY = 'jubileeInspireAuth';
const BOOTSTRAP_COOKIE = 'ji_bootstrap';
const SIGNED_IN_COOKIE = 'ji_signed_in';
// "Signed out HERE, on purpose" — the middleware stops asking the SSO. Ported from
// JubileeInspire (src/lib/auth.ts setSignedOutMarker). See markSignedOut below.
const SIGNED_OUT_COOKIE = 'ji_signed_out';

export interface AuthTokens {
  accessToken: string;
  // Long-lived token redeemed at /api/auth/refresh for a fresh access token.
  refreshToken?: string;
  // ISO-8601 timestamp from the API (the ACCESS token's expiry).
  expiresAt: string;
}

// Split, not a regex: a regex built from a string literal silently loses its
// backslashes, and then only the FIRST cookie in document.cookie is ever found.
function readCookie(name: string): string | null {
  try {
    const hit = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

function dropCookie(name: string): void {
  try { document.cookie = `${name}=; Max-Age=0; Path=/`; } catch { /* ignore */ }
}

// THE SERVER-SIDE HANDOVER, adopted on the READ path rather than in an effect:
// by the time a component effect ran, AuthProvider would already have asked /me
// without a token and decided the reader is a guest. Cleared first, so a
// malformed payload cannot be retried on every read.
function adoptBootstrapCookie(): void {
  if (typeof document === 'undefined') return;
  const raw = readCookie(BOOTSTRAP_COOKIE);
  if (!raw) return;
  dropCookie(BOOTSTRAP_COOKIE);
  try {
    const t = JSON.parse(raw) as AuthTokens;
    if (t && typeof t.accessToken === 'string' && t.accessToken) {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken, expiresAt: t.expiresAt }),
      );
    }
  } catch { /* ignore a malformed payload */ }
}

/**
 * True when this page load found ji_signed_in=1 with no session behind it.
 *
 * That happens after signing out on ANOTHER family site: this origin's session
 * is revoked, but no page can clear another origin's cookie. The middleware read
 * the stale "1" before any of this ran and skipped the SSO, so AuthProvider uses
 * this to ask once, directly, instead of leaving the reader signed out with a
 * live family session one redirect away.
 */
let staleMarker = false;
export function staleMarkerCleared(): boolean {
  return staleMarker;
}

function setSignedInMarker(): void {
  if (typeof document === 'undefined') return;
  try {
    // Any sign-in here — the form, a sibling's link, the silent check — lifts a
    // deliberate sign-out. BEFORE the early return below: a stale "1" must not
    // leave the signed-out marker standing under a live session.
    if (readCookie(SIGNED_OUT_COOKIE)) dropCookie(SIGNED_OUT_COOKIE);
    if (readCookie(SIGNED_IN_COOKIE) === '1') return;
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SIGNED_IN_COOKIE}=1; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

function clearSignedInMarker(): void {
  if (typeof document === 'undefined') return;
  try {
    if (readCookie(SIGNED_IN_COOKIE) === '1') {
      staleMarker = true;
      dropCookie(SIGNED_IN_COOKIE);
    }
  } catch { /* ignore */ }
}

export function getTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  adoptBootstrapCookie();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const t = raw ? (JSON.parse(raw) as AuthTokens) : null;
    const ok = t && typeof t.accessToken === 'string' && t.accessToken ? t : null;
    // The marker mirrors the store on every read, so a stale "1" survives at
    // most until the next one.
    if (ok) setSignedInMarker(); else clearSignedInMarker();
    return ok;
  } catch {
    clearSignedInMarker();
    return null;
  }
}

export function getRefreshToken(): string | null {
  return getTokens()?.refreshToken ?? null;
}

// Returns a usable access token, or null if absent/expired. Does NOT clear on
// expiry — the refresh token must survive so lib/api.ts can mint a new access
// token. A null here simply means "send no Bearer"; a resulting 401 drives the
// refresh flow.
export function getAccessToken(): string | null {
  const t = getTokens();
  if (!t) return null;
  if (t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now()) return null;
  return t.accessToken;
}

export function setTokens(tokens: AuthTokens | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (!tokens?.accessToken) {
    clearTokens();
    return;
  }
  // PERSIST the refreshToken — without it, once the 1h access token expires there
  // is nothing to mint a new one from, and the user is silently logged out (and
  // "keep me signed in" never works). The server returns the same long-lived
  // refresh token on /refresh; if a response omits it (e.g. a refresh reply that
  // echoes nothing), keep the one we already hold rather than dropping the session.
  const prev = getTokens();
  const refreshToken = tokens.refreshToken ?? prev?.refreshToken;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ accessToken: tokens.accessToken, refreshToken, expiresAt: tokens.expiresAt }),
  );
  setSignedInMarker();
}

/**
 * The reader SIGNED OUT here on purpose (Sign out, or deleting the account).
 *
 * 🔴 WITHOUT THIS, SINGLE SIGN-ON SIGNS YOU STRAIGHT BACK IN. Signing out revokes
 * the family sessions for the account signing out, but no page can reach the
 * SSO's own cookie, and that cookie may name a DIFFERENT account — planted by
 * signing in as someone else on another family site. The next page load asks the
 * SSO, gets that account, and signs the reader back in: JubileeInspire shipped
 * exactly that on 2026-09-15 ("I logged out and it logged me in again").
 *
 * So a deliberate sign-out stays signed out on this origin until the reader signs
 * in here again (setSignedInMarker clears it). A FORCED sign-out — a refresh the
 * server refused — does not set it, so a session ended elsewhere can still be
 * replaced by the family one. Call it just before clearTokens().
 */
export function markSignedOut(): void {
  if (typeof document === 'undefined') return;
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${SIGNED_OUT_COOKIE}=1; Max-Age=${365 * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
  } catch { /* ignore */ }
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
  dropCookie(SIGNED_IN_COOKIE);
  // The plant/ask markers describe a session, so they die with one — otherwise
  // signing back in within the same tab would skip teaching the SSO this browser.
  try {
    const ss = window.sessionStorage;
    for (let i = ss.length - 1; i >= 0; i -= 1) {
      const k = ss.key(i);
      if (k && (k.startsWith('jubileeSsoPlanted') || k.startsWith('jubileeSsoAsked') || k === 'jubileeStaleRetry')) ss.removeItem(k);
    }
  } catch { /* private mode makes this throw */ }
}
