'use client';
import { create } from 'zustand';
import { getAccessToken } from '@/lib/auth';

// ============================================================================
// Where each album's hero picture sits in its frame: the vertical
// object-position / background-position, 0 (top, the default) to 100 (bottom).
// Set by an admin with the red arrows (components/HeroNudge.tsx), stored by
// /backstage/hero-position in content/hero-positions.json, and read here for
// every visitor. Keyed "hero-<album code, lowercase>" so the home carousel and
// the album page frame the same picture the same way.
// ============================================================================

export const heroKey = (code: string) => `hero-${code.toLowerCase()}`;

const SAVE_DELAY = 700;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, number>();

interface HeroPositionsState {
  map: Record<string, number>;
  loaded: boolean;
  ensureLoaded: () => void;
  /** Move a picture by `delta` percentage points, live, and save shortly after. */
  nudge: (code: string, delta: number) => void;
  /**
   * Set a picture's framing outright and save it now (the admin Hero Image
   * Preview's "Save"). Resolves true once the server has stored it. Cancels any
   * nudge still waiting to save for the same picture, so the two cannot race.
   */
  save: (code: string, y: number) => Promise<boolean>;
}

function flush(key: string, y: number, keepalive = false) {
  const token = getAccessToken();
  return fetch('/backstage/hero-position', {
    method: 'POST',
    keepalive,
    credentials: 'omit',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ key, y }),
  });
}

// A nudge made just before leaving the page still lands.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    pending.forEach((y, key) => { try { void flush(key, y, true); } catch { /* best effort */ } });
    pending.clear();
  });
}

export const useHeroPositions = create<HeroPositionsState>((set, get) => ({
  map: {},
  loaded: false,

  ensureLoaded: () => {
    if (get().loaded) return;
    set({ loaded: true });
    // Plain fetch, not lib/api: this route is Next's own (not the Express API),
    // and lib/api points at the API host in development.
    fetch('/backstage/hero-position', { cache: 'no-store', credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((m: Record<string, number>) => set({ map: { ...(m || {}), ...get().map } }))
      .catch(() => {});
  },

  nudge: (code, delta) => {
    const key = heroKey(code);
    const prev = get().map[key] ?? 0;
    const y = Math.max(0, Math.min(100, prev + delta));
    if (y === prev) return;
    set({ map: { ...get().map, [key]: y } });
    pending.set(key, y);
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      const val = pending.get(key);
      if (val == null) return;
      flush(key, val).then((r) => { if (r.ok && pending.get(key) === val) pending.delete(key); }).catch(() => {});
    }, SAVE_DELAY));
  },

  save: async (code, y) => {
    const key = heroKey(code);
    const val = Math.round(Math.max(0, Math.min(100, y)) * 10) / 10;
    clearTimeout(timers.get(key));
    pending.delete(key);
    set({ map: { ...get().map, [key]: val } });
    try {
      const r = await flush(key, val);
      return r.ok;
    } catch {
      return false;
    }
  },
}));
