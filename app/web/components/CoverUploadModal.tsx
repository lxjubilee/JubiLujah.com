'use client';
import { useEffect, useRef, useState } from 'react';
import { useCoverEdit } from '@/stores/coverEdit';
import { getAccessToken } from '@/lib/auth';

// Global admin modal to replace an album cover. Picks an image, previews it, and
// PUTs the raw bytes to /api/admin/covers/:code (which writes to R2 + flags a J:
// sync). On success it reloads so the cache-busted (?v) cover shows everywhere.
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export default function CoverUploadModal() {
  const { open, code, title, hide } = useCoverEdit();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setFile(null); setPreview(null); setMsg(null); setErr(null); setBusy(false); }
  }, [open]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (!open || !code) return null;

  const pick = (f: File | null) => {
    setErr(null); setMsg(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) { setErr('Please choose a PNG, JPG, or WebP image.'); return; }
    if (f.size > MAX_BYTES) { setErr('Image is larger than 10 MB.'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/covers/${encodeURIComponent(code)}`, {
        method: 'POST',
        headers: { 'content-type': file.type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: file,
        credentials: 'omit',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || `Upload failed (${res.status})`);
      setMsg('Cover updated! Refreshing…');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
      setBusy(false);
    }
  };

  return (
    <div className="cover-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) hide(); }}>
      <div className="cover-modal" role="dialog" aria-modal="true" aria-label="Replace album cover">
        <div className="cover-modal-head">
          <div>
            <h3>Replace album cover</h3>
            <div className="muted" style={{ fontSize: 12 }}>{title} · {code}</div>
          </div>
          <button className="cover-modal-x" onClick={() => !busy && hide()} aria-label="Close">×</button>
        </div>

        <div className="cover-modal-body">
          <div className="cover-modal-drop" onClick={() => inputRef.current?.click()}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] || null); }}>
            {preview
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={preview} alt="preview" />
              : <span className="muted">Click to choose an image, or drag &amp; drop<br /><small>PNG / JPG / WebP · up to 10 MB · square works best</small></span>}
          </div>
          <input ref={inputRef} type="file" accept={ACCEPT.join(',')} style={{ display: 'none' }}
                 onChange={(e) => pick(e.target.files?.[0] || null)} />

          {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}
          {msg && <div className="notice" style={{ borderColor: 'var(--success)' }}>{msg}</div>}
          <p className="muted" style={{ fontSize: 11 }}>
            Uploads to the CDN immediately and is flagged to sync back to the studio drive.
          </p>
        </div>

        <div className="cover-modal-actions">
          <button className="an-btn" onClick={() => !busy && hide()} disabled={busy}>Cancel</button>
          <button className="an-btn an-btn-primary" onClick={upload} disabled={!file || busy}>
            {busy ? 'Uploading…' : 'Upload & Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
