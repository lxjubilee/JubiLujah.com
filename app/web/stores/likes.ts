'use client';
import { create } from 'zustand';
import { listLikeIds, likeTarget, unlikeTarget, type LikeKind, type LikeType } from '@/lib/likes';

// ============================================================================
// Account-backed likes membership. Loads the signed-in user's liked and favorited
// targets once and exposes has()/toggle(). toggle() is optimistic and reverts on
// error. The key matches /api/me/likes/ids: "type:id" for a like (unchanged) and
// "type:id:favorite" for a favorite.
// ============================================================================
const key = (t: string, id: string, kind: LikeKind = 'like') =>
  kind === 'favorite' ? `${t}:${id}:favorite` : `${t}:${id}`;

interface LikesState {
  ids: Set<string>;
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  reset: () => void;
  has: (t: LikeType, id: string, kind?: LikeKind) => boolean;
  /** Resolves to the new state (true = now liked / favorited). */
  toggle: (t: LikeType, id: string, kind?: LikeKind) => Promise<boolean>;
}

export const useLikes = create<LikesState>((set, get) => ({
  ids: new Set(),
  loaded: false,
  loading: false,

  ensureLoaded: () => { if (!get().loaded && !get().loading) get().reload(); },

  reload: async () => {
    set({ loading: true });
    try {
      const { ids } = await listLikeIds();
      set({ ids: new Set(ids), loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ ids: new Set(), loaded: false, loading: false }),

  has: (t, id, kind = 'like') => get().ids.has(key(t, id, kind)),

  toggle: async (t, id, kind = 'like') => {
    const k = key(t, id, kind);
    const wasOn = get().ids.has(k);
    // Optimistic update.
    const next = new Set(get().ids);
    if (wasOn) next.delete(k); else next.add(k);
    set({ ids: next });
    try {
      if (wasOn) await unlikeTarget(t, id, kind); else await likeTarget(t, id, kind);
      return !wasOn;
    } catch {
      // Revert on failure.
      const rb = new Set(get().ids);
      if (wasOn) rb.add(k); else rb.delete(k);
      set({ ids: rb });
      return wasOn;
    }
  },
}));
