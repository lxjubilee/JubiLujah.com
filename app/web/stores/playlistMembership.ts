'use client';
import { create } from 'zustand';
import { listPlaylistSongIds } from '@/lib/playlists';

// ============================================================================
// Tracks which songs are in at least one of the signed-in user's playlists, so
// track lists can show a "✓ already added" indicator instead of the "+". Holds
// a per-song count (a song can be in several playlists) so removing it from one
// playlist doesn't wrongly clear the check while it's still in another.
// ============================================================================
interface MembershipState {
  counts: Record<string, number>;
  loaded: boolean;
  loading: boolean;
  ensureLoaded: () => void;
  reload: () => Promise<void>;
  reset: () => void;
  has: (songId: string) => boolean;
  markAdded: (songId: string) => void;
  markRemoved: (songId: string) => void;
}

export const usePlaylistMembership = create<MembershipState>((set, get) => ({
  counts: {},
  loaded: false,
  loading: false,

  ensureLoaded: () => {
    if (get().loaded || get().loading) return;
    get().reload();
  },

  reload: async () => {
    set({ loading: true });
    try {
      const { counts } = await listPlaylistSongIds();
      set({ counts: counts || {}, loaded: true });
    } catch {
      set({ loaded: true });
    } finally {
      set({ loading: false });
    }
  },

  reset: () => set({ counts: {}, loaded: false, loading: false }),

  has: (songId) => (get().counts[songId] ?? 0) > 0,

  markAdded: (songId) =>
    set((s) => ({ counts: { ...s.counts, [songId]: (s.counts[songId] ?? 0) + 1 } })),

  markRemoved: (songId) =>
    set((s) => {
      const next = Math.max(0, (s.counts[songId] ?? 0) - 1);
      const counts = { ...s.counts };
      if (next === 0) delete counts[songId]; else counts[songId] = next;
      return { counts };
    }),
}));
