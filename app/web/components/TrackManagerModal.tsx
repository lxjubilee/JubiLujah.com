'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrackManager } from '@/stores/trackManager';
import { api } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

// Admin track manager: list / delete / upload an album's .mp3 files on the J:
// studio drive. Uploads land on J: (push live later via Publish to Production).
interface Track { file: string; n: number | null; title: string; sizeKB: number }
interface ListResp { available: boolean; code?: string; count?: number; tracks: Track[] }

export default function TrackManagerModal() {
  const { open, code, title, hide } = useTrackManager();
  const [data, setData] = useState<ListResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // 'upload' | 'del:<file>' | null
  const [prog, setProg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    if (!code) return;
    api.get<ListResp>(`/api/admin/tracks/${encodeURIComponent(code)}`).then(setData).catch((e) => setErr(e.message));
  }, [code]);

  useEffect(() => {
    if (open) { setData(null); setErr(null); setQueue([]); setBusy(null); setProg(null); load(); }
  }, [open, load]);

  if (!open || !code) return null;

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const mp3s = Array.from(files).filter((f) => /\.mp3$/i.test(f.name));
    if (mp3s.length) setQueue((q) => [...q, ...mp3s.filter((f) => !q.some((x) => x.name === f.name))]);
    setErr(null);
  };

  const del = async (file: string) => {
    if (!window.confirm(`Delete "${file}" from the J: drive? This cannot be undone.`)) return;
    setBusy(`del:${file}`); setErr(null);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/tracks/${encodeURIComponent(code)}?file=${encodeURIComponent(file)}`, {
        method: 'DELETE', headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'omit',
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Delete failed (${res.status})`);
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setBusy(null); }
  };

  const upload = async () => {
    if (!queue.length) return;
    setBusy('upload'); setErr(null);
    const token = getAccessToken();
    let done = 0;
    for (const f of queue) {
      setProg(`Uploading ${f.name} (${done + 1}/${queue.length})…`);
      try {
        const res = await fetch(`/api/admin/tracks/${encodeURIComponent(code)}?name=${encodeURIComponent(f.name)}`, {
          method: 'POST', headers: { 'content-type': 'audio/mpeg', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: f, credentials: 'omit',
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Upload failed (${res.status})`);
        done++;
      } catch (e) { setErr(`${f.name}: ${e instanceof Error ? e.message : 'upload failed'}`); break; }
    }
    setProg(`${done} of ${queue.length} uploaded to J:.`);
    setQueue([]); setBusy(null); load();
  };

  const unavailable = data && !data.available;

  return (
    <div className="cover-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) hide(); }}>
      <div className="cover-modal" role="dialog" aria-modal="true" aria-label="Manage tracks" style={{ width: 'min(560px, 96vw)' }}>
        <div className="cover-modal-head">
          <div>
            <h3>Manage tracks · J: drive</h3>
            <div className="muted" style={{ fontSize: 12 }}>{title} · {code}</div>
          </div>
          <button className="cover-modal-x" onClick={() => !busy && hide()} aria-label="Close">×</button>
        </div>

        <div className="cover-modal-body">
          {unavailable && (
            <div className="notice" style={{ borderColor: 'var(--accent-gold)' }}>
              The J: studio drive isn&apos;t reachable from here. Open the site on the <strong>studio machine</strong> (localhost) to manage tracks.
            </div>
          )}
          {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}

          {data?.available && (
            <>
              <div className="tm-list">
                {data.tracks.map((t) => (
                  <div className="tm-row" key={t.file}>
                    <span className="tm-n">{t.n ?? '•'}</span>
                    <span className="tm-name" title={t.file}>{t.title}</span>
                    <span className="muted tm-size">{t.sizeKB.toLocaleString()} KB</span>
                    <button className="an-btn tm-del" disabled={!!busy} onClick={() => del(t.file)}>
                      {busy === `del:${t.file}` ? '…' : 'Delete'}
                    </button>
                  </div>
                ))}
                {data.tracks.length === 0 && <div className="muted" style={{ padding: '8px 2px' }}>No .mp3 files on J: yet — upload some below.</div>}
              </div>

              <div className="cover-modal-drop" style={{ aspectRatio: 'auto', minHeight: 120, maxHeight: 160 }}
                   onClick={() => inputRef.current?.click()}
                   onDragOver={(e) => e.preventDefault()}
                   onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
                <span className="muted">Click to choose .mp3 files, or drag &amp; drop<br /><small>they upload to the J: drive</small></span>
              </div>
              <input ref={inputRef} type="file" accept="audio/mpeg,.mp3" multiple style={{ display: 'none' }}
                     onChange={(e) => addFiles(e.target.files)} />

              {queue.length > 0 && (
                <div className="tm-queue">
                  {queue.map((f) => (
                    <div className="tm-qrow" key={f.name}>
                      <span className="tm-name">{f.name}</span>
                      <span className="muted">{Math.round(f.size / 1024).toLocaleString()} KB</span>
                      <button className="an-btn tm-del" disabled={!!busy} onClick={() => setQueue((q) => q.filter((x) => x.name !== f.name))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {prog && <div className="muted" style={{ fontSize: 12 }}>{prog}</div>}
              <p className="muted" style={{ fontSize: 11 }}>Tracks upload to J:. Push them live with <strong>Publish to Production</strong>.</p>
            </>
          )}
        </div>

        <div className="cover-modal-actions">
          <button className="an-btn" onClick={() => !busy && hide()} disabled={!!busy}>Close</button>
          <button className="an-btn an-btn-primary" onClick={upload} disabled={!queue.length || !!busy}>
            {busy === 'upload' ? 'Uploading…' : `Upload ${queue.length || ''} to J:`}
          </button>
        </div>
      </div>
    </div>
  );
}
