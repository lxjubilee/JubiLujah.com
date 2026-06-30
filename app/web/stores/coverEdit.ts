'use client';
import { create } from 'zustand';

// Drives the admin "replace album cover" modal. The red badge on a cover calls
// show(code,title); the global CoverUploadModal renders when open.
interface CoverEditState {
  open: boolean;
  code: string | null;
  title: string;
  show: (code: string, title: string) => void;
  hide: () => void;
}

export const useCoverEdit = create<CoverEditState>((set) => ({
  open: false,
  code: null,
  title: '',
  show: (code, title) => set({ open: true, code, title }),
  hide: () => set({ open: false, code: null, title: '' }),
}));
