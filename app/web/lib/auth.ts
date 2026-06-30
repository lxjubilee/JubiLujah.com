'use client';
// ============================================================================
// Bearer-token auth store. The session token lives in localStorage under
// `jubileeInspireAuth`; lib/api.ts sends it as `Authorization: Bearer <token>`.
//
// Trade-off vs. an HttpOnly session cookie: localStorage is readable by any
// script running on the page, so a successful XSS can exfiltrate the token. The
// upside is no cookie/CSRF handling — the server authenticates purely on the
// Bearer JWT and has no CSRF layer. Keep the app XSS-clean.
// ============================================================================
const STORAGE_KEY = 'jubileeInspireAuth';

export interface AuthTokens {
  accessToken: string;
  // Long-lived token redeemed at /api/auth/refresh for a fresh access token.
  refreshToken?: string;
  // ISO-8601 timestamp from the API (the ACCESS token's expiry).
  expiresAt: string;
}

export function getTokens(): AuthTokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as AuthTokens;
    return t && typeof t.accessToken === 'string' && t.accessToken ? t : null;
  } catch {
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
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }),
  );
}

export function clearTokens(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}
