'use client';
import { create } from 'zustand';
import { listLikeIds, likeTarget, unlikeTarget, type LikeType } from '@/lib/likes';

// ============================================================================
// Account-backed likes membership. Loads the signed-in user's liked targets
// once and exposes has()/toggle(). toggle() is optimistic and reverts on error.
// ============================================================================
const key = (t: string, id: string) => `${t}:${id}`;

interface LikesState {
  ids: Set<string>;
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  reset: () => void;
  has: (t: LikeType, id: string) => boolean;
  toggle: (t: LikeType, id: string) => Promise<void>;
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

  has: (t, id) => get().ids.has(key(t, id)),

  toggle: async (t, id) => {
    const k = key(t, id);
    const wasLiked = get().ids.has(k);
    // Optimistic update.
    const next = new Set(get().ids);
    if (wasLiked) next.delete(k); else next.add(k);
    set({ ids: next });
    try {
      if (wasLiked) await unlikeTarget(t, id); else await likeTarget(t, id);
    } catch {
      // Revert on failure.
      const rb = new Set(get().ids);
      if (wasLiked) rb.add(k); else rb.delete(k);
      set({ ids: rb });
    }
  },
}));
