'use client';
// Send a playlist — spec §14.2. Hands a themed set to someone else with a short
// note. Transfers a REFERENCE (theme + note + artist selection), never audio
// files. The recipient page resolves it inside the ecosystem and can play
// without an account.
import { useState } from 'react';
import { createSend, type Arc } from '@/lib/themePlaylist';

export default function SendModal({
  themeId, language, personas, arc, onClose,
}: {
  themeId: string; language: string; personas: string[]; arc: Arc; onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  async function send() {
    setState('sending');
    try {
      const r = await createSend({ themeId, language, personas, arc, note: note.trim() || undefined });
      const abs = typeof window !== 'undefined' ? new URL(r.url, window.location.origin).toString() : r.url;
      setUrl(abs);
      setState('done');
    } catch {
      setState('error');
    }
  }
  function copy() {
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  }

  return (
    <div className="tpl-send-scrim" role="dialog" aria-label="Send this playlist" onClick={onClose}>
      <div className="tpl-send" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tpl-mood-x" aria-label="Close" onClick={onClose}>×</button>
        {state !== 'done' ? (
          <>
            <h3 className="tpl-send-title">Send this playlist</h3>
            <p className="tpl-send-sub">They’ll get the theme, your note, and your chosen artist mix. No account needed to listen.</p>
            <textarea
              className="tpl-send-note" maxLength={280} placeholder="Add a short note (optional)…"
              value={note} onChange={(e) => setNote(e.target.value)}
            />
            <button type="button" className="tpl-btn tpl-btn-primary" disabled={state === 'sending'} onClick={send}>
              {state === 'sending' ? 'Creating link…' : 'Create share link'}
            </button>
            {state === 'error' && <p className="tpl-send-err">Couldn’t create the link. Please try again.</p>}
          </>
        ) : (
          <>
            <h3 className="tpl-send-title">Ready to send</h3>
            <p className="tpl-send-sub">Share this link:</p>
            <div className="tpl-send-linkrow">
              <input className="tpl-send-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="tpl-btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
