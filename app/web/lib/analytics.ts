'use client';
// ============================================================================
// Media analytics client. recordPlay() fires a playback event (keepalive so it
// survives navigation/unload). The admin getters back the dashboard.
// ============================================================================
import { getAccessToken } from '@/lib/auth';
import { api } from '@/lib/api';

export interface PlayPayload {
  song_id: string;
  session_id?: string;
  source?: string;
  started_at?: string;
  ended_at?: string;
  listening_seconds: number;
  duration_seconds?: number;
  completed?: boolean;
  skipped?: boolean;
}

// Stable per-tab session id for grouping plays into listening sessions.
export function getSessionId(): string {
  try {
    const existing = sessionStorage.getItem('jvAnalyticsSession');
    if (existing) return existing;
    const gen: string = (typeof crypto !== 'undefined' && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `s-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    sessionStorage.setItem('jvAnalyticsSession', gen);
    return gen;
  } catch { return 'anon'; }
}

// Fire-and-forget playback record. Requires auth (playback is gated to members),
// uses keepalive so it lands even when the page is unloading.
export function recordPlay(p: PlayPayload): void {
  const token = getAccessToken();
  if (!token || !p.song_id || p.listening_seconds < 1) return;
  try {
    fetch('/api/analytics/play', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(p),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* ignore */ }
}

// ---- Real-time now-playing heartbeat (drives the admin Active Listeners page) -
// Fire-and-forget; called by the player on play + every ~25s, and stopped on
// pause/stop. Safe no-op when signed out.
export function pingNowPlaying(songId: string): void {
  const token = getAccessToken();
  if (!token || !songId) return;
  try {
    fetch('/api/analytics/now-playing', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ song_id: songId, session_id: getSessionId() }),
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* ignore */ }
}
export function stopNowPlaying(): void {
  const token = getAccessToken();
  if (!token) return;
  try {
    fetch('/api/analytics/now-playing/stop', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ session_id: getSessionId() }),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {});
  } catch { /* ignore */ }
}

// ---- Admin dashboard reads (admin-only on the server) ----------------------
const qs = (params: Record<string, string | number | undefined> = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, String(v)]),
  ).toString();
  return s ? `?${s}` : '';
};

export const getOverview = () => api.get<any>('/api/analytics/overview');
export const getTrends = (days = 90) => api.get<any>(`/api/analytics/trends?days=${days}`);
export const getRatingAnalytics = () => api.get<any>('/api/analytics/ratings');
export const getReviewAnalytics = () => api.get<any>('/api/analytics/reviews');
export const getAlbumAnalytics = (params?: Record<string, string | number | undefined>) => api.get<any>(`/api/analytics/albums${qs(params)}`);
export const getSongAnalytics = (params?: Record<string, string | number | undefined>) => api.get<any>(`/api/analytics/songs${qs(params)}`);
export const getUserAnalytics = (params?: Record<string, string | number | undefined>) => api.get<any>(`/api/analytics/users${qs(params)}`);
export const getAlbumDetail = (id: string) => api.get<any>(`/api/analytics/albums/${id}`);
export const getSongDetail = (id: string) => api.get<any>(`/api/analytics/songs/${id}`);
export const getUserDetail = (id: string) => api.get<any>(`/api/analytics/users/${id}`);

// CSV/Excel export — downloads via an authorized fetch + blob (Bearer auth can't
// ride a plain <a download>). Excel opens CSV natively.
export async function exportReport(kind: 'albums' | 'songs' | 'users', params?: Record<string, string | undefined>, ext: 'csv' | 'xls' = 'csv') {
  const token = getAccessToken();
  const res = await fetch(`/api/analytics/export${qs({ kind, ...params })}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jubilujah-analytics-${kind}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
