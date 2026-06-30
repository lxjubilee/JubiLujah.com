'use client';
import { create } from 'zustand';

// Global "sign in required" prompt. Playback and likes call show() when a guest
// triggers a members-only action; <PlaybackGate /> renders the modal. An
// optional title lets each caller tailor the heading.
const DEFAULT_TITLE = 'Free sign in to play music';

interface AuthGateState {
  open: boolean;
  title: string;
  show: (title?: string) => void;
  hide: () => void;
}

export const useAuthGate = create<AuthGateState>((set) => ({
  open: false,
  title: DEFAULT_TITLE,
  show: (title) => set({ open: true, title: title || DEFAULT_TITLE }),
  hide: () => set({ open: false }),
}));
