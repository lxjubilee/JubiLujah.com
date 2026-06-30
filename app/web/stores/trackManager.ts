'use client';
import { create } from 'zustand';

// Drives the admin "manage tracks (J:)" modal — the music-note badge in the
// hover preview calls show(code,title); TrackManagerModal renders when open.
interface TrackManagerState {
  open: boolean;
  code: string | null;
  title: string;
  show: (code: string, title: string) => void;
  hide: () => void;
}

export const useTrackManager = create<TrackManagerState>((set) => ({
  open: false,
  code: null,
  title: '',
  show: (code, title) => set({ open: true, code, title }),
  hide: () => set({ open: false, code: null, title: '' }),
}));
