'use client';
import { useAuth } from './AuthProvider';
import { useTrackManager } from '@/stores/trackManager';

// Red music-note badge under the cover-edit badge in the large hover preview —
// ADMIN ONLY. Opens the track manager (J: drive .mp3 files) for the album.
export default function TrackEditBadge({ code, title }: { code: string; title: string }) {
  const { hasRole } = useAuth();
  const show = useTrackManager((s) => s.show);
  if (!hasRole('admin')) return null;
  return (
    <button
      type="button"
      className="track-edit-badge"
      title="Manage tracks (J: drive)"
      aria-label="Manage tracks"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); show(code, title); }}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
        <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
      </svg>
    </button>
  );
}
