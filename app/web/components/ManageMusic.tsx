'use client';
// ============================================================================
// Manage Music — Admin Panel module (BRD: Manage Music for Jubilujah.com).
// Dashboard + Albums + Songs + Missing Assets + Activity + Sync, all backed by
// /api/admin/music. Access is gated by the admin/layout.tsx role guard.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

type View = 'dashboard' | 'albums' | 'songs' | 'missing' | 'activity' | 'sync';

interface Dashboard {
  cards: Record<string, number>;
  last_sync: any;
  schedule: { schedule: string; enabled: boolean; last_run_at?: string; next_run_at?: string } | null;
  initialized: boolean;
}
interface AlbumRow {
  album_code: string; album_id: string; title: string; artist_name: string; artist_slug: string;
  category: string | null; release_year: number | null; cover_url: string | null; cover_present: boolean | null;
  song_count: number; audio_present_count: number; audio_missing_count: number; metadata_complete: boolean;
  visibility: 'published' | 'hidden' | 'draft'; present_in_manifest: boolean; published_at: string | null; last_synced_at: string | null;
}
interface SongRow {
  song_id: string; album_code: string; track_number: number; title: string; artist_name: string;
  duration_seconds: number | null; mp3_url: string | null; mp3_available: boolean; lyrics_available: boolean;
  metadata_complete: boolean; visibility: string; present_in_manifest: boolean;
}

const CARD_DEFS: { key: string; label: string; warn?: boolean; go?: { view: View; filter?: Record<string, string> } }[] = [
  { key: 'total_albums_cdn', label: 'Albums on CDN', go: { view: 'albums' } },
  { key: 'albums_published', label: 'Albums Published', go: { view: 'albums', filter: { visibility: 'published' } } },
  { key: 'albums_hidden', label: 'Albums Hidden', go: { view: 'albums', filter: { visibility: 'hidden' } } },
  { key: 'albums_missing_cover', label: 'Missing Cover Images', warn: true, go: { view: 'albums', filter: { cover: 'missing' } } },
  { key: 'total_songs_cdn', label: 'Songs on CDN', go: { view: 'songs' } },
  { key: 'songs_published', label: 'Songs Published', go: { view: 'songs', filter: { visibility: 'published' } } },
  { key: 'songs_hidden', label: 'Songs Hidden', go: { view: 'songs', filter: { visibility: 'hidden' } } },
  { key: 'songs_missing_audio', label: 'Songs Missing Audio', warn: true, go: { view: 'songs', filter: { audio: 'missing' } } },
  { key: 'total_artists', label: 'Total Artists' },
  { key: 'albums_pending_review', label: 'Albums Pending Review', go: { view: 'albums', filter: { visibility: 'draft' } } },
  { key: 'albums_missing_metadata', label: 'Albums Missing Metadata', warn: true, go: { view: 'albums', filter: { metadata: 'missing' } } },
  { key: 'songs_missing_metadata', label: 'Songs Missing Metadata', warn: true, go: { view: 'songs', filter: { metadata: 'missing' } } },
];

function VisBadge({ v }: { v: string }) {
  const dot = v === 'published' ? '🟢' : v === 'hidden' ? '🔴' : '⚪';
  return <span className={`mm-badge ${v}`}><span className="mm-dot">{dot}</span>{v}</span>;
}

function fmtDate(s?: string | null) { return s ? new Date(s).toLocaleString() : '—'; }
function fmtDur(s?: number | null) {
  if (!s && s !== 0) return '—';
  const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ManageMusic() {
  const [view, setView] = useState<View>('dashboard');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [dash, setDash] = useState<Dashboard | null>(null);
  // Filter handed from a clicked dashboard card to the albums/songs view.
  const [seedFilter, setSeedFilter] = useState<Record<string, string> | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 6000); };
  const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

  const loadDash = useCallback(() => {
    api.get<Dashboard>('/api/admin/music/dashboard').then(setDash).catch((e) => flash('err', errText(e)));
  }, []);
  useEffect(() => { loadDash(); }, [loadDash]);

  const runSync = async (probe: 'missing' | 'all') => {
    setSyncing(true); setMsg(null);
    try {
      const r = await api.post<any>('/api/admin/music/sync', { probe });
      flash('ok', `Sync complete — ${r.albums_new} new albums, ${r.songs_new} new songs, ${r.albums_updated} updated, ${r.missing_covers} missing covers, ${r.missing_audio} missing audio.`);
      loadDash();
    } catch (e) { flash('err', `Sync failed: ${errText(e)}`); }
    finally { setSyncing(false); }
  };

  const goCard = (c: typeof CARD_DEFS[number]) => {
    if (!c.go) return;
    setSeedFilter(c.go.filter || {});
    setView(c.go.view);
  };

  return (
    <>
      <div className="mm-toolbar">
        <h2 className="section-title" style={{ margin: 0 }}>Manage Music</h2>
        <div className="mm-btn-row">
          {dash?.last_sync && <span className="mm-muted" style={{ fontSize: 12 }}>Last sync: {fmtDate(dash.last_sync.started_at)} ({dash.last_sync.status})</span>}
          <button className="mm-btn" disabled={syncing} onClick={() => runSync('missing')}>{syncing ? 'Syncing…' : 'Sync with CDN'}</button>
          <button className="mm-btn sm" disabled={syncing} title="Re-probe every cover on the CDN" onClick={() => runSync('all')}>Full re-probe</button>
        </div>
      </div>

      {msg && <div className={`mm-note ${msg.kind}`}>{msg.text}</div>}

      <div className="mm-tabs">
        {(['dashboard', 'albums', 'songs', 'missing', 'activity', 'sync'] as View[]).map((v) => (
          <button key={v} className={`mm-tab ${view === v ? 'active' : ''}`} onClick={() => { setSeedFilter(null); setView(v); }}>
            {v === 'missing' ? 'Missing Assets' : v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === 'dashboard' && (
        <DashboardView dash={dash} onCard={goCard} initialized={dash?.initialized} onSync={() => runSync('all')} syncing={syncing} />
      )}
      {view === 'albums' && <AlbumsView seedFilter={seedFilter} flash={flash} onChanged={loadDash} />}
      {view === 'songs' && <SongsView seedFilter={seedFilter} flash={flash} />}
      {view === 'missing' && <MissingView />}
      {view === 'activity' && <ActivityView />}
      {view === 'sync' && <SyncView flash={flash} />}
    </>
  );
}

// ---------------------------------------------------------------------------
function DashboardView({ dash, onCard, initialized, onSync, syncing }: {
  dash: Dashboard | null; onCard: (c: typeof CARD_DEFS[number]) => void; initialized?: boolean; onSync: () => void; syncing: boolean;
}) {
  if (!dash) return <p className="notice">Loading…</p>;
  if (!initialized) {
    return (
      <div className="mm-note">
        No music has been synchronized yet. Click <strong>Sync with CDN</strong> above (or
        {' '}<button className="mm-btn sm" disabled={syncing} onClick={onSync}>run the first sync now</button>)
        to import album &amp; song metadata from cdn.jubileeverse.com. No media files are copied — only references.
      </div>
    );
  }
  return (
    <div className="mm-cards">
      {CARD_DEFS.map((c) => (
        <button key={c.key} className={`mm-card ${c.warn && (dash.cards[c.key] || 0) > 0 ? 'warn' : ''}`}
          onClick={() => onCard(c)} disabled={!c.go} style={{ cursor: c.go ? 'pointer' : 'default' }}>
          <div className="v">{dash.cards[c.key] ?? 0}</div>
          <div className="l">{c.label}</div>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AlbumsView({ seedFilter, flash, onChanged }: {
  seedFilter: Record<string, string> | null; flash: (k: 'ok' | 'err', t: string) => void; onChanged: () => void;
}) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>(seedFilter || {});
  const [sort, setSort] = useState('album_name');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AlbumRow[]; total: number; pageSize: number } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (seedFilter) { setFilters(seedFilter); setQ(''); setPage(1); } }, [seedFilter]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '50', sort, dir });
    if (q.trim()) p.set('q', q.trim());
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    api.get<{ items: AlbumRow[]; total: number; pageSize: number }>(`/api/admin/music/albums?${p}`).then(setData).catch((e) => flash('err', String(e)));
  }, [q, filters, sort, dir, page, flash]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const setF = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const toggleSort = (col: string) => { if (sort === col) setDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSort(col); setDir('asc'); } };
  const toggleSel = (code: string) => setSel((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });

  const setVisibility = async (code: string, visibility: string) => {
    try { await api.patch(`/api/admin/music/albums/${code}/visibility`, { visibility }); flash('ok', `${code} → ${visibility}`); load(); onChanged(); }
    catch (e) { flash('err', String(e)); }
  };
  const refresh = async (code: string) => {
    try { await api.post(`/api/admin/music/albums/${code}/refresh`); flash('ok', `${code} refreshed from CDN`); load(); }
    catch (e) { flash('err', String(e)); }
  };
  const validate = async (code: string) => {
    try { await api.post(`/api/admin/music/albums/${code}/validate`); flash('ok', `${code} validated`); load(); }
    catch (e) { flash('err', String(e)); }
  };
  const del = async (code: string) => {
    if (!confirm(`Remove the local reference for ${code}? CDN files are NOT deleted; a future sync re-imports it.`)) return;
    try { await api.del(`/api/admin/music/albums/${code}`); flash('ok', `${code} local reference removed`); load(); onChanged(); }
    catch (e) { flash('err', String(e)); }
  };
  const bulk = async (action: string) => {
    if (!sel.size) return;
    setBusy(true);
    try { const r = await api.post<any>('/api/admin/music/bulk', { action, albumCodes: [...sel] }); flash('ok', `${action}: ${r.affected} affected`); setSel(new Set<string>()); load(); onChanged(); }
    catch (e) { flash('err', String(e)); } finally { setBusy(false); }
  };

  const total = data?.total || 0; const pageSize = data?.pageSize || 50; const pages = Math.max(1, Math.ceil(total / pageSize));
  const Th = ({ col, children }: { col: string; children: React.ReactNode }) => (
    <th onClick={() => toggleSort(col)}>{children}{sort === col ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>
  );

  return (
    <div>
      <div className="mm-filters">
        <input className="mm-input" placeholder="Search album, artist, code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select className="mm-select" value={filters.visibility || ''} onChange={(e) => setF('visibility', e.target.value)}>
          <option value="">All visibility</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="draft">Draft</option>
        </select>
        <select className="mm-select" value={filters.cover || ''} onChange={(e) => setF('cover', e.target.value)}>
          <option value="">Cover: any</option><option value="present">Has cover</option><option value="missing">Missing cover</option>
        </select>
        <select className="mm-select" value={filters.audio || ''} onChange={(e) => setF('audio', e.target.value)}>
          <option value="">Audio: any</option><option value="missing">Missing audio</option>
        </select>
        <select className="mm-select" value={filters.metadata || ''} onChange={(e) => setF('metadata', e.target.value)}>
          <option value="">Metadata: any</option><option value="complete">Complete</option><option value="missing">Missing</option>
        </select>
        <input className="mm-input" style={{ minWidth: 120 }} placeholder="Artist slug" value={filters.artist || ''} onChange={(e) => setF('artist', e.target.value)} />
        <CsvButton kind="albums" />
      </div>

      {sel.size > 0 && (
        <div className="mm-bulkbar">
          <strong>{sel.size} selected</strong>
          <button className="mm-btn sm" disabled={busy} onClick={() => bulk('publish')}>Publish</button>
          <button className="mm-btn sm" disabled={busy} onClick={() => bulk('hide')}>Hide</button>
          <button className="mm-btn sm" disabled={busy} onClick={() => bulk('draft')}>Set Draft</button>
          <button className="mm-btn sm" disabled={busy} onClick={() => bulk('refresh')}>Refresh</button>
          <button className="mm-btn sm" disabled={busy} onClick={() => bulk('validate')}>Validate</button>
          <button className="mm-btn sm" onClick={() => setSel(new Set<string>())}>Clear</button>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="mm-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={!!data?.items.length && sel.size === data?.items.length}
                onChange={(e) => setSel(e.target.checked ? new Set<string>(data?.items.map((a) => a.album_code)) : new Set<string>())} /></th>
              <th></th>
              <Th col="album_name">Album</Th>
              <Th col="artist">Artist</Th>
              <Th col="release">Year</Th>
              <Th col="songs">Songs</Th>
              <th>Cover</th><th>Audio</th>
              <Th col="visibility">Visibility</Th>
              <Th col="updated">Last Synced</Th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.album_code}>
                <td><input type="checkbox" checked={sel.has(a.album_code)} onChange={() => toggleSel(a.album_code)} /></td>
                <td>{a.cover_present && a.cover_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img className="mm-thumb" src={a.cover_url} alt="" loading="lazy" />
                  : <span className="mm-thumb empty">🟡</span>}</td>
                <td><button className="mm-btn sm" style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', padding: 0, fontWeight: 700 }}
                  onClick={() => setDetail(a.album_code)}>{a.title || a.album_code}</button>
                  <div className="mm-muted" style={{ fontSize: 11 }}>{a.album_code}{!a.present_in_manifest && ' · ⚠ broken ref'}</div></td>
                <td>{a.artist_name}</td>
                <td>{a.release_year || '—'}</td>
                <td>{a.song_count}</td>
                <td>{a.cover_present === null ? '—' : a.cover_present ? <span className="mm-check pass">✓</span> : <span className="mm-check fail">✗</span>}</td>
                <td>{a.audio_missing_count === 0 ? <span className="mm-check pass">✓</span> : <span className="mm-check fail">{a.audio_present_count}/{a.song_count}</span>}</td>
                <td><VisBadge v={a.visibility} /></td>
                <td className="mm-muted">{fmtDate(a.last_synced_at)}</td>
                <td>
                  <div className="mm-btn-row">
                    {a.visibility !== 'published' && <button className="mm-btn sm" onClick={() => setVisibility(a.album_code, 'published')}>Publish</button>}
                    {a.visibility !== 'hidden' && <button className="mm-btn sm" onClick={() => setVisibility(a.album_code, 'hidden')}>Hide</button>}
                    <button className="mm-btn sm" onClick={() => refresh(a.album_code)}>↻</button>
                    <button className="mm-btn sm" onClick={() => validate(a.album_code)}>✓?</button>
                    <button className="mm-btn sm" onClick={() => del(a.album_code)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={11} className="mm-muted" style={{ padding: 20 }}>No albums match.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="mm-pager">
        <span>{total} albums · page {page}/{pages}</span>
        <button className="mm-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="mm-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      {detail && <AlbumDrawer code={detail} onClose={() => setDetail(null)} flash={flash} onChanged={() => { load(); onChanged(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
function AlbumDrawer({ code, onClose, flash, onChanged }: {
  code: string; onClose: () => void; flash: (k: 'ok' | 'err', t: string) => void; onChanged: () => void;
}) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(() => { api.get<any>(`/api/admin/music/albums/${code}`).then(setD).catch((e) => flash('err', String(e))); }, [code, flash]);
  useEffect(() => { load(); }, [load]);
  const setSongVis = async (id: string, visibility: string) => {
    try { await api.patch(`/api/admin/music/songs/${id}/visibility`, { visibility }); load(); onChanged(); }
    catch (e) { flash('err', String(e)); }
  };
  const a = d?.album;
  return (
    <>
      <div className="mm-drawer-backdrop" onClick={onClose} />
      <div className="mm-drawer">
        <button className="mm-drawer-close" onClick={onClose}>×</button>
        {!d ? <p className="notice">Loading…</p> : (
          <>
            <div style={{ display: 'flex', gap: 14 }}>
              {a.cover_present && a.cover_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.cover_url} alt="" style={{ width: 96, height: 96, borderRadius: 10, objectFit: 'cover' }} />
                : <div style={{ width: 96, height: 96, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🟡</div>}
              <div>
                <h3>{a.title}</h3>
                <div className="mm-muted">{a.artist_name} · {a.album_code}</div>
                <div style={{ marginTop: 8 }}><VisBadge v={a.visibility} /></div>
              </div>
            </div>

            <div className="mm-btn-row" style={{ marginTop: 14 }}>
              <button className="mm-btn primary sm" onClick={async () => { await api.patch(`/api/admin/music/albums/${code}/visibility`, { visibility: 'published' }); flash('ok', 'Published'); load(); onChanged(); }}>Publish</button>
              <button className="mm-btn sm" onClick={async () => { await api.patch(`/api/admin/music/albums/${code}/visibility`, { visibility: 'hidden' }); flash('ok', 'Hidden'); load(); onChanged(); }}>Hide</button>
              <button className="mm-btn sm" onClick={async () => { await api.post(`/api/admin/music/albums/${code}/refresh`); flash('ok', 'Refreshed'); load(); }}>Refresh from CDN</button>
              <button className="mm-btn sm" onClick={async () => { await api.post(`/api/admin/music/albums/${code}/validate`); flash('ok', 'Validated'); load(); }}>Validate</button>
            </div>

            <div className="mm-section-h">Album Information</div>
            <dl className="mm-kv">
              <dt>CDN folder</dt><dd>{a.cdn_path || '—'}</dd>
              <dt>Cover URL</dt><dd>{a.cover_url ? <a href={a.cover_url} target="_blank" rel="noreferrer">{a.cover_url}</a> : '—'}</dd>
              <dt>Category</dt><dd>{a.category || '—'}</dd>
              <dt>Release year</dt><dd>{a.release_year || '—'}</dd>
              <dt>Songs</dt><dd>{a.song_count} ({a.audio_present_count} with audio)</dd>
              <dt>Metadata</dt><dd>{a.metadata_complete ? 'Complete' : 'Incomplete'}</dd>
              <dt>On CDN</dt><dd>{a.present_in_manifest ? 'Yes' : '⚠ Broken reference (no longer in manifest)'}</dd>
              <dt>Last synced</dt><dd>{fmtDate(a.last_synced_at)}</dd>
            </dl>

            <div className="mm-section-h">Validation Results</div>
            <dl className="mm-kv">
              {d.validation?.length ? d.validation.map((c: any) => (
                <div key={c.check_name} style={{ display: 'contents' }}>
                  <dt>{c.check_name}</dt>
                  <dd className={c.passed ? 'mm-check pass' : 'mm-check fail'}>{c.passed ? '✓' : '✗'} {c.detail}</dd>
                </div>
              )) : <dd className="mm-muted">No validation recorded — click Validate.</dd>}
            </dl>

            <div className="mm-section-h">Track List ({d.songs?.length || 0})</div>
            <table className="mm-table">
              <thead><tr><th>#</th><th>Title</th><th>Dur</th><th>MP3</th><th>Visibility</th><th></th></tr></thead>
              <tbody>
                {d.songs?.map((s: SongRow) => (
                  <tr key={s.song_id}>
                    <td>{s.track_number}</td>
                    <td>{s.title}{s.mp3_url && <div style={{ fontSize: 10 }} className="mm-muted"><a href={s.mp3_url} target="_blank" rel="noreferrer">cdn ↗</a></div>}</td>
                    <td>{fmtDur(s.duration_seconds)}</td>
                    <td>{s.mp3_available ? <span className="mm-check pass">✓</span> : <span className="mm-check fail">✗</span>}</td>
                    <td><VisBadge v={s.visibility} /></td>
                    <td><button className="mm-btn sm" onClick={() => setSongVis(s.song_id, s.visibility === 'hidden' ? 'published' : 'hidden')}>{s.visibility === 'hidden' ? 'Unhide' : 'Hide'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
function SongsView({ seedFilter, flash }: { seedFilter: Record<string, string> | null; flash: (k: 'ok' | 'err', t: string) => void }) {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>(seedFilter || {});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: SongRow[]; total: number; pageSize: number } | null>(null);
  useEffect(() => { if (seedFilter) { setFilters(seedFilter); setPage(1); } }, [seedFilter]);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (q.trim()) p.set('q', q.trim());
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
    api.get<{ items: SongRow[]; total: number; pageSize: number }>(`/api/admin/music/songs?${p}`).then(setData).catch((e) => flash('err', String(e)));
  }, [q, filters, page, flash]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const setF = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const setVis = async (id: string, visibility: string) => {
    try { await api.patch(`/api/admin/music/songs/${id}/visibility`, { visibility }); load(); }
    catch (e) { flash('err', String(e)); }
  };
  const total = data?.total || 0; const pageSize = data?.pageSize || 50; const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <div className="mm-filters">
        <input className="mm-input" placeholder="Search song, artist, album code…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <input className="mm-input" style={{ minWidth: 130 }} placeholder="Album code" value={filters.album || ''} onChange={(e) => setF('album', e.target.value)} />
        <select className="mm-select" value={filters.visibility || ''} onChange={(e) => setF('visibility', e.target.value)}>
          <option value="">All visibility</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="draft">Draft</option>
        </select>
        <select className="mm-select" value={filters.audio || ''} onChange={(e) => setF('audio', e.target.value)}>
          <option value="">Audio: any</option><option value="present">Has MP3</option><option value="missing">Missing MP3</option>
        </select>
        <CsvButton kind="songs" />
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="mm-table">
          <thead><tr><th>Song</th><th>Album</th><th>Artist</th><th>Dur</th><th>MP3</th><th>Lyrics</th><th>Visibility</th><th>Actions</th></tr></thead>
          <tbody>
            {data?.items.map((s) => (
              <tr key={s.song_id}>
                <td>{s.title}<div className="mm-muted" style={{ fontSize: 11 }}>#{s.track_number}</div></td>
                <td>{s.album_code}</td><td>{s.artist_name}</td><td>{fmtDur(s.duration_seconds)}</td>
                <td>{s.mp3_available ? <span className="mm-check pass">✓</span> : <span className="mm-check fail">✗</span>}</td>
                <td>{s.lyrics_available ? '✓' : '—'}</td>
                <td><VisBadge v={s.visibility} /></td>
                <td><button className="mm-btn sm" onClick={() => setVis(s.song_id, s.visibility === 'hidden' ? 'published' : 'hidden')}>{s.visibility === 'hidden' ? 'Publish' : 'Hide'}</button></td>
              </tr>
            ))}
            {data && !data.items.length && <tr><td colSpan={8} className="mm-muted" style={{ padding: 20 }}>No songs match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mm-pager">
        <span>{total} songs · page {page}/{pages}</span>
        <button className="mm-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="mm-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function MissingView() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.get<any>('/api/admin/music/missing').then(setD).catch(() => {}); }, []);
  if (!d) return <p className="notice">Loading…</p>;
  const Group = ({ title, rows, render }: { title: string; rows: any[]; render: (r: any) => React.ReactNode }) => (
    <div style={{ marginBottom: 22 }}>
      <div className="mm-section-h">{title} ({rows.length})</div>
      {rows.length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{rows.slice(0, 200).map((r, i) => <li key={i}>{render(r)}</li>)}</ul>
        : <p className="mm-muted" style={{ fontSize: 13 }}>None 🎉</p>}
    </div>
  );
  return (
    <div>
      <CsvButton kind="missing" />
      <Group title="Albums Missing Cover Images" rows={d.albums_missing_cover} render={(r) => <>{r.title} <span className="mm-muted">— {r.artist_name} ({r.album_code})</span></>} />
      <Group title="Albums Missing Metadata" rows={d.albums_missing_metadata} render={(r) => <>{r.title} <span className="mm-muted">— {r.artist_name} ({r.album_code})</span></>} />
      <Group title="Songs Missing MP3 Files" rows={d.songs_missing_audio} render={(r) => <>{r.title} <span className="mm-muted">— {r.album_code} #{r.track_number}</span></>} />
      <Group title="Songs Missing Metadata" rows={d.songs_missing_metadata} render={(r) => <>{r.title || '(untitled)'} <span className="mm-muted">— {r.album_code} #{r.track_number}</span></>} />
      <Group title="Broken Cover / CDN References" rows={d.broken_cover_references} render={(r) => <>{r.title} <span className="mm-muted">— {r.album_code}</span></>} />
      <Group title="Broken Audio References" rows={d.broken_audio_references} render={(r) => <>{r.title} <span className="mm-muted">— {r.album_code} #{r.track_number}</span></>} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function ActivityView() {
  const [d, setD] = useState<any>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { api.get<any>(`/api/admin/music/activity?page=${page}&limit=50`).then(setD).catch(() => {}); }, [page]);
  const total = d?.total || 0; const pages = Math.max(1, Math.ceil(total / 50));
  return (
    <div>
      <div className="mm-filters"><CsvButton kind="activity" /></div>
      <table className="mm-table">
        <thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Target</th><th>Change</th></tr></thead>
        <tbody>
          {d?.items?.map((r: any) => (
            <tr key={r.id}>
              <td className="mm-muted">{fmtDate(r.created_at)}</td>
              <td>{r.actor_name || '—'}</td>
              <td>{r.action}</td>
              <td>{r.target_type}{r.target_id ? `: ${r.target_id}` : ''}</td>
              <td className="mm-muted" style={{ fontSize: 11 }}>
                {r.previous_value && <span>{JSON.stringify(r.previous_value)} → </span>}
                {r.new_value && <span>{JSON.stringify(r.new_value).slice(0, 80)}</span>}
              </td>
            </tr>
          ))}
          {d && !d.items.length && <tr><td colSpan={5} className="mm-muted" style={{ padding: 20 }}>No activity yet.</td></tr>}
        </tbody>
      </table>
      <div className="mm-pager">
        <span>{total} entries · page {page}/{pages}</span>
        <button className="mm-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
        <button className="mm-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SyncView({ flash }: { flash: (k: 'ok' | 'err', t: string) => void }) {
  const [cfg, setCfg] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [runDetail, setRunDetail] = useState<any>(null);

  const load = useCallback(() => {
    api.get<any>('/api/admin/music/sync/config').then(setCfg).catch(() => {});
    api.get<any[]>('/api/admin/music/sync/runs?limit=25').then(setRuns).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openRun != null) api.get<any>(`/api/admin/music/sync/runs/${openRun}`).then(setRunDetail).catch(() => {}); }, [openRun]);

  const save = async (schedule: string, enabled: boolean) => {
    try { const r = await api.put<any>('/api/admin/music/sync/config', { schedule, enabled }); setCfg(r); flash('ok', 'Schedule saved'); }
    catch (e) { flash('err', String(e)); }
  };

  return (
    <div>
      <div className="mm-section-h">Automatic Synchronization</div>
      <div className="mm-note">
        <div className="mm-filters" style={{ marginBottom: 0 }}>
          <label>Cadence:&nbsp;
            <select className="mm-select" value={cfg?.schedule || 'off'} onChange={(e) => save(e.target.value, cfg?.enabled ?? false)}>
              <option value="off">Off</option><option value="hourly">Every hour</option><option value="6h">Every 6 hours</option>
              <option value="12h">Every 12 hours</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={cfg?.enabled || false} onChange={(e) => save(cfg?.schedule || 'daily', e.target.checked)} /> Enabled
          </label>
          <span className="mm-muted" style={{ fontSize: 12 }}>
            Last run: {fmtDate(cfg?.last_run_at)} · Next: {fmtDate(cfg?.next_run_at)}
          </span>
        </div>
        <div className="mm-muted" style={{ fontSize: 11, marginTop: 8 }}>
          The scheduler runs inside the API process and must be enabled there with <code>MUSIC_SYNC_SCHEDULER=on</code>.
        </div>
      </div>

      <div className="mm-section-h">Synchronization History</div>
      <table className="mm-table">
        <thead><tr><th>Started</th><th>Trigger</th><th>Status</th><th>New A/S</th><th>Updated A/S</th><th>Removed</th><th>Missing cov/aud</th><th></th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="mm-muted">{fmtDate(r.started_at)}</td>
              <td>{r.trigger}</td>
              <td>{r.status === 'success' ? '🟢' : r.status === 'error' ? '🔴' : '🟡'} {r.status}</td>
              <td>{r.albums_new}/{r.songs_new}</td>
              <td>{r.albums_updated}/{r.songs_updated}</td>
              <td>{r.albums_removed}/{r.songs_removed}</td>
              <td>{r.missing_covers}/{r.missing_audio}</td>
              <td><button className="mm-btn sm" onClick={() => setOpenRun(openRun === r.id ? null : r.id)}>{openRun === r.id ? 'Hide' : 'Log'}</button></td>
            </tr>
          ))}
          {!runs.length && <tr><td colSpan={8} className="mm-muted" style={{ padding: 20 }}>No sync runs yet.</td></tr>}
        </tbody>
      </table>
      {openRun != null && runDetail && (
        <div className="mm-log" style={{ marginTop: 12 }}>
          {(runDetail.log || []).map((l: any) => `${l.at}  ${l.msg}${l.error ? ' — ' + l.error : ''}`).join('\n')}
          {runDetail.error && `\nERROR: ${runDetail.error}`}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV export must carry the Bearer token, so we fetch + blob-download rather
// than navigating (a plain link wouldn't send the Authorization header).
function CsvButton({ kind }: { kind: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/admin/music/export?kind=${kind}&format=csv`, {
        headers: token ? { authorization: `Bearer ${token}` } : {}, credentials: 'omit',
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `jubilujah-music-${kind}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { /* surfaced via button state only */ }
    finally { setBusy(false); }
  };
  return <button className="mm-btn sm" disabled={busy} onClick={download}>{busy ? 'Exporting…' : `Export ${kind} CSV`}</button>;
}
