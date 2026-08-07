'use client';
// Backstage "Story" overlay — spec §6. Opens the song's Backstage piece in an
// overlay WHILE the song keeps playing (playback is global via FooterPlayer, so
// it is never interrupted). The affordance is only ever rendered when a piece
// exists (see the compose route), never in a disabled state.
import { useEffect } from 'react';

export default function BackstageOverlay({ slug, onClose }: { slug: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tpl-bs-scrim" role="dialog" aria-label="Backstage story" onClick={onClose}>
      <div className="tpl-bs" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-bs-bar">
          <span className="tpl-bs-tag">Backstage</span>
          <div className="tpl-bs-bar-actions">
            <a className="tpl-chip" href={`/backstage/${slug}`} target="_blank" rel="noopener noreferrer">Open full page ↗</a>
            <button type="button" className="tpl-chip" onClick={onClose}>Close</button>
          </div>
        </div>
        {/* The song keeps playing underneath; this only shows the story. */}
        <iframe className="tpl-bs-frame" src={`/backstage/${slug}`} title="Backstage story" />
      </div>
    </div>
  );
}
