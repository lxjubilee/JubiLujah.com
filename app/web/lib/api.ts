'use client';
// ============================================================================
// Browser-side API client. Authenticates with a Bearer access token (JWT) read
// from localStorage (see lib/auth.ts) — NOT cookies. We send `credentials: 'omit'`
// so no cookie rides along. The server has no CSRF/cookie layer at all; auth is
// purely the `Authorization: Bearer` header.
//
// The access token is refreshed transparently so the user stays signed in until
// they explicitly log out (or the refresh token is revoked/idles past its TTL):
//   - PROACTIVELY, before a request, when the access token is missing/expired but
//     a refresh token exists. This matters because /api/auth/me returns 200 (not
//     401) when unauthenticated, so a reactive-only refresh would never fire on
//     app load after the access token expires.
//   - REACTIVELY, on a 401, then the original request is replayed once.
// Tokens are cleared ONLY when the refresh token is definitively rejected — never
// on a transient/network error, so a blip doesn't sign the user out.
// ============================================================================
import { getAccessToken, getRefreshToken, setTokens, clearTokens, type AuthTokens } from '@/lib/auth';

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const REFRESH_PATH = '/api/auth/refresh';

type RefreshResult = 'ok' | 'invalid' | 'error';

// Single-flight refresh: concurrent callers share one /refresh round-trip.
let refreshing: Promise<RefreshResult> | null = null;

async function tryRefresh(): Promise<RefreshResult> {
  if (!refreshing) {
    refreshing = (async (): Promise<RefreshResult> => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return 'invalid';
      try {
        const res = await fetch(REFRESH_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'omit',
          body: JSON.stringify({ refreshToken }),
        });
        if (res.status === 401) return 'invalid';   // refresh token rejected -> real logout
        if (!res.ok) return 'error';                // 5xx/etc -> transient, keep tokens
        const data = await res.json().catch(() => null);
        if (!data?.tokens?.accessToken) return 'error';
        setTokens(data.tokens as AuthTokens);
        return 'ok';
      } catch {
        return 'error';                             // network -> transient, keep tokens
      }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function doFetch(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const token = getAccessToken();
  if (token) headers['authorization'] = `Bearer ${token}`;
  return fetch(path, {
    method,
    headers,
    credentials: 'omit',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // Proactive: no usable access token but we hold a refresh token -> refresh first.
  if (path !== REFRESH_PATH && !getAccessToken() && getRefreshToken()) {
    const r = await tryRefresh();
    if (r === 'invalid') clearTokens();
  }

  let res = await doFetch(method, path, body);

  // Reactive: access token rejected mid-flight -> refresh once and replay.
  if (res.status === 401 && path !== REFRESH_PATH) {
    const r = await tryRefresh();
    if (r === 'ok') res = await doFetch(method, path, body);
    else if (r === 'invalid') clearTokens();
    // 'error' (transient): keep tokens; the 401 below surfaces as an ApiError.
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
