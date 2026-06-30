'use client';
import { useAuth } from './AuthProvider';
import { useCoverEdit } from '@/stores/coverEdit';

// Small red "replace cover" badge shown in the upper-right of an album cover —
// ADMIN ONLY. Sits over a clickable cover (Link), so it stops the click from
// navigating and opens the cover-upload modal instead.
export default function CoverEditBadge({ code, title }: { code: string; title: string }) {
  const { hasRole } = useAuth();
  const show = useCoverEdit((s) => s.show);
  if (!hasRole('admin')) return null;
  return (
    <button
      type="button"
      className="cover-edit-badge"
      title="Replace album cover"
      aria-label="Replace album cover"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); show(code, title); }}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    </button>
  );
}
