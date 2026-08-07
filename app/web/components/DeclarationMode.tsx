'use client';
// Declaration mode — spec §13. A full-screen, lyric-forward view for speaking
// the word aloud, synchronized to playback, with declaration-flagged lines held
// larger/longer. Lyrics come from a per-track lyrics record (lyrics_record_id
// with declaration flags) in the listener's language — never machine-translated
// at playback time. The catalog has no lyrics records yet, so this ships as a
// correct, graceful shell: it keeps the screen awake and follows playback, and
// shows synchronized lyrics the moment a lyrics record exists for the track.
import { useEffect } from 'react';
import type { TrackEntry } from '@/lib/themePlaylist';

export default function DeclarationMode({ track, onClose }: { track: TrackEntry | null; onClose: () => void }) {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (nav.wakeLock) nav.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => {});
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); lock?.release().catch(() => {}); };
  }, [onClose]);

  if (!track) return null;
  return (
    <div className="tpl-decl" role="dialog" aria-label="Declaration mode">
      <button type="button" className="tpl-decl-x" aria-label="Exit declaration mode" onClick={onClose}>Done</button>
      <div className="tpl-decl-body">
        <p className="tpl-decl-song">{track.title}</p>
        <p className="tpl-decl-artist">{track.personaName}</p>
        {/* Lyrics render here when a lyrics record (with declaration flags) exists
            for this track in the active language. */}
        <p className="tpl-decl-empty">Synchronized lyrics aren’t published for this song yet — declaration mode will
          light up the words to speak the moment they are. For now, the screen stays awake and the song keeps playing.</p>
      </div>
    </div>
  );
}
