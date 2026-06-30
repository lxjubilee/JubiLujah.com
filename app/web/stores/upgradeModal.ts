'use client';
import { create } from 'zustand';
import type { PlayIntent } from '@/lib/subscription';

// ============================================================================
// "Daily free limit reached" upgrade prompt. The player arms it with the play
// intent when a track is capped, and shows it the instant playback is paused at
// the preview limit (BRD §Upgrade Popup).
// ============================================================================
interface UpgradeModalState {
  open: boolean;
  info: PlayIntent | null;
  arm: (info: PlayIntent) => void;   // stash context before the cap is hit
  show: () => void;
  hide: () => void;
}

export const useUpgradeModal = create<UpgradeModalState>((set) => ({
  open: false,
  info: null,
  arm: (info) => set({ info }),
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
