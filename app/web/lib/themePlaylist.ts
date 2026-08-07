'use client';
// ============================================================================
// Client-side data layer for theme playlists.
//   • composePlaylist() → POST /api/playlist (Next route; works signed-out too).
//   • prefs / rotation / send → the authed Express API via lib/api.ts (Bearer).
// Types mirror app/api/playlist/route.ts and the /api/me/playlist-* contract.
// ============================================================================
import { api } from '@/lib/api';

export type Arc = 'steady' | 'build' | 'worship_set';

export interface ComposeRequest {
  themeId: string;
  lang?: string;
  personas?: string[];
  arc?: Arc;
  durationSeconds?: number | null;
  mood?: string | null;
  testimonyOn?: boolean;
  served?: string[];
  seed?: string;
}

export interface TrackEntry {
  type: 'track';
  songId: string;
  n: number;
  title: string;
  personaSlug: string;
  personaName: string;
  albumCode: string;
  albumTitle: string;
  url: string;
  cover: string;
  energy: number;
  tempo: number;
  moods: string[];
  dur: number;
  backstage: { slug: string } | null;
}
export interface InterludeEntry {
  type: 'interlude';
  id: string;
  kind: 'testimony';
  category: string;
  title: string;
  url: string;
  durationSeconds: number;
  image?: string | null;
}
export type Entry = TrackEntry | InterludeEntry;

export interface EligiblePersona { slug: string; count: number; image: string | null }

export interface ComposeResponse {
  theme: {
    id: string; name: string; statement: string; accent: string | null; heroImage: string | null;
    supportedArcs: Arc[]; defaultArc: Arc; testimonyCategories: string[];
    targetTrackCount: number; minDistinctAlbums: number;
  };
  lang: string;
  arc: Arc;
  personas: string[];
  availableLanguages: string[];
  eligiblePersonas: EligiblePersona[];
  entries: Entry[];
  trackCount: number;
  distinctAlbums: number;
  runtimeSeconds: number;
  poolSize: number;
  warnings: string[];
  underfilled: boolean;
  rotationReset: boolean;
}

export async function composePlaylist(req: ComposeRequest): Promise<ComposeResponse> {
  const res = await fetch('/api/playlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'omit',
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`compose failed: HTTP ${res.status}`);
  return res.json();
}

// ── per-user preferences (§3.3, §7, §10, §11 persistence; AC §18.5) ──────────
export interface Prefs {
  personas: string[] | null;
  language: string | null;
  arc: Arc | null;
  durationSeconds: number | null;
  testimonyOn: boolean;
  introsOn: boolean;
  mood: string | null;
  moodAt: string | null;
}

export const getPrefs = (themeId: string) =>
  api.get<Prefs & { themeId: string }>(`/api/me/playlist-prefs/${encodeURIComponent(themeId)}`);

export const putPrefs = (themeId: string, prefs: Partial<Prefs>) =>
  api.put<Prefs & { themeId: string }>(`/api/me/playlist-prefs/${encodeURIComponent(themeId)}`, prefs);

// ── full-rotation memory (§14.1) ─────────────────────────────────────────────
export const getRotation = (themeId: string, lang: string) =>
  api.get<{ themeId: string; language: string; served: string[] }>(
    `/api/me/playlist-rotation/${encodeURIComponent(themeId)}?lang=${encodeURIComponent(lang)}`,
  );

export const recordServed = (themeId: string, lang: string, songIds: string[]) =>
  api.post<{ ok: boolean; served: number }>(
    `/api/me/playlist-rotation/${encodeURIComponent(themeId)}`,
    { language: lang, songIds },
  );

export const resetRotation = (themeId: string, lang: string) =>
  api.del<{ ok: boolean; cleared: number }>(
    `/api/me/playlist-rotation/${encodeURIComponent(themeId)}?lang=${encodeURIComponent(lang)}`,
  );

// ── send a playlist (§14.2) ──────────────────────────────────────────────────
export interface SendPayload { themeId: string; language?: string; personas?: string[]; arc?: Arc; note?: string }
export const createSend = (payload: SendPayload) =>
  api.post<{ id: string; token: string; url: string }>('/api/me/playlist-sends', payload);

export interface SharedPlaylist {
  themeId: string; language: string | null; personas: string[] | null; arc: Arc | null;
  note: string | null; senderName: string | null; createdAt: string;
}
export async function getShare(token: string): Promise<SharedPlaylist> {
  const res = await fetch(`/api/playlist-share/${encodeURIComponent(token)}`, { credentials: 'omit' });
  if (!res.ok) throw new Error(`share not found: HTTP ${res.status}`);
  return res.json();
}
