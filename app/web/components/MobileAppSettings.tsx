'use client';
// ============================================================================
// Mobile App Settings — admin UI (BRD: Mobile App Settings).
//
// Controls what the MOBILE app shows, independently of the website: the five
// top-level categories (order / visible / active), the albums/artists inside
// each, and the Music Type genres (+ minimum album count). Reads and writes the
// /api/admin/mobile/* API; the app reads the resulting /api/mobile/config.
//
// Reordering is via ▲/▼ buttons (no drag-and-drop dependency), matching the
// Manage Music admin conventions. No optimistic updates — re-fetch after writes.
// ============================================================================
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';

interface Item {
  id: number; item_type: 'album' | 'artist' | 'collection'; item_ref: string;
  title: string | null; display_order: number; is_active: boolean;
}
interface Category {
  id: number; key: string; label: string; kind: string;
  display_order: number; is_active: boolean; is_visible: boolean; items: Item[];
}
interface MusicType {
  id: number; genre: string; label: string; display_order: number; is_pinned: boolean; is_active: boolean;
}
interface AdminConfig {
  categories: Category[]; musicTypes: MusicType[]; settings: { min_album_count: number };
}
interface PickArtist { slug: string; name: string; category: string; albumCount: number }
interface PickAlbum { code: string; title: string; artist: string; category: string }

const box: CSSProperties = { border: '1px solid var(--line)', borderRadius: 8, background: 'var(--surface)' };
const btn: CSSProperties = {
  padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6,
  border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink)', cursor: 'pointer',
};
const input: CSSProperties = {
  padding: '7px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--line)',
  background: 'var(--bg)', color: 'var(--ink)',
};

export default function MobileAppSettings() {
  const { loading, authenticated, hasRole } = useAuth();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  const reload = useCallback(async () => {
    try {
      const data = await api.get<AdminConfig>('/api/admin/mobile/config');
      setCfg(data);
      setSelKey((k) => k ?? data.categories[0]?.key ?? null);
    } catch (e) {
      flash('err', String((e as Error).message || e));
    }
  }, [flash]);

  useEffect(() => {
    if (!loading && authenticated && hasRole('admin')) void reload();
  }, [loading, authenticated, hasRole, reload]);

  // Wrap a write so it reports errors and refreshes from the server.
  const run = useCallback(async (p: Promise<unknown>, ok: string) => {
    try { await p; flash('ok', ok); await reload(); }
    catch (e) { flash('err', String((e as Error).message || e)); }
  }, [flash, reload]);

  const cats = cfg?.categories ?? [];
  const selected = useMemo(() => cats.find((c) => c.key === selKey) ?? null, [cats, selKey]);

  if (loading) return <p className="notice">Checking access…</p>;
  if (!authenticated || !hasRole('admin')) return <p className="notice">Access denied — requires the admin role.</p>;

  // ---- category ops ----
  const moveCategory = (idx: number, dir: -1 | 1) => {
    const keys = cats.map((c) => c.key);
    const j = idx + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[idx], keys[j]] = [keys[j], keys[idx]];
    void run(api.patch('/api/admin/mobile/categories-order', { keys }), 'Order saved');
  };
  const patchCategory = (key: string, body: Record<string, unknown>) =>
    run(api.patch(`/api/admin/mobile/categories/${key}`, body), 'Category updated');

  return (
    <>
      <h2 className="section-title">Mobile App Settings</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14, fontSize: 13 }}>
        Control what appears in the mobile app and in what order. Changes go live in the app within a minute.
      </p>
      {msg && (
        <div style={{
          ...box, padding: '8px 12px', marginBottom: 12, fontSize: 13,
          borderColor: msg.kind === 'ok' ? 'var(--accent)' : '#b3261e',
          color: msg.kind === 'ok' ? 'var(--ink)' : '#b3261e',
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: categories */}
        <div style={{ ...box, flex: '0 0 260px', maxWidth: 300, padding: 8 }}>
          <div className="eyebrow" style={{ padding: '4px 8px 8px', color: 'var(--accent)', fontWeight: 700 }}>Categories</div>
          {cats.map((c, i) => (
            <div key={c.key} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px', borderRadius: 6,
              background: c.key === selKey ? 'var(--bg)' : 'transparent', cursor: 'pointer',
            }} onClick={() => setSelKey(c.key)}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <button style={{ ...btn, padding: '0 5px' }} onClick={(e) => { e.stopPropagation(); moveCategory(i, -1); }} disabled={i === 0}>▲</button>
                <button style={{ ...btn, padding: '0 5px' }} onClick={(e) => { e.stopPropagation(); moveCategory(i, 1); }} disabled={i === cats.length - 1}>▼</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</div>
                <div className="muted" style={{ fontSize: 11 }}>{c.kind}{c.is_visible ? '' : ' · hidden'}{c.is_active ? '' : ' · inactive'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Right: selected category detail */}
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          {selected ? (
            <CategoryDetail
              key={selected.key}
              category={selected}
              settings={cfg!.settings}
              musicTypes={cfg!.musicTypes}
              onPatchCategory={patchCategory}
              run={run}
            />
          ) : <p className="muted">Select a category.</p>}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function CategoryDetail({
  category, settings, musicTypes, onPatchCategory, run,
}: {
  category: Category; settings: { min_album_count: number }; musicTypes: MusicType[];
  onPatchCategory: (key: string, body: Record<string, unknown>) => Promise<void>;
  run: (p: Promise<unknown>, ok: string) => Promise<void>;
}) {
  return (
    <div style={{ ...box, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>{category.label}</h3>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={category.is_visible}
            onChange={(e) => onPatchCategory(category.key, { is_visible: e.target.checked })} /> Visible in app
        </label>
        <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={category.is_active}
            onChange={(e) => onPatchCategory(category.key, { is_active: e.target.checked })} /> Active
        </label>
      </div>

      {category.kind === 'music_type'
        ? <MusicTypes musicTypes={musicTypes} settings={settings} run={run} />
        : <CategoryItems category={category} run={run} />}
    </div>
  );
}

// ---- content items (curated / personas / albums) --------------------------

function CategoryItems({ category, run }: {
  category: Category; run: (p: Promise<unknown>, ok: string) => Promise<void>;
}) {
  const items = category.items;
  const personaLabel = category.kind === 'personas';

  const moveItem = (idx: number, dir: -1 | 1) => {
    const ids = items.map((it) => it.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run(api.patch(`/api/admin/mobile/categories/${category.key}/items-order`, { ids }), 'Order saved');
  };

  return (
    <>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {items.length === 0
          ? 'No items yet — the app shows sensible defaults from the catalog until you add items here.'
          : `${items.length} item(s). ${personaLabel ? 'Uncheck a persona to hide it from this section.' : ''}`}
      </p>
      {items.map((it, i) => (
        <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button style={{ ...btn, padding: '0 5px' }} onClick={() => moveItem(i, -1)} disabled={i === 0}>▲</button>
            <button style={{ ...btn, padding: '0 5px' }} onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}>▼</button>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}
            title={personaLabel ? 'Show in Inspire Family Mobile Section' : 'Active'}>
            <input type="checkbox" checked={it.is_active}
              onChange={(e) => run(api.patch(`/api/admin/mobile/items/${it.id}`, { is_active: e.target.checked }), 'Updated')} />
            <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <b>{it.item_type}</b> · {it.title || it.item_ref}
            </span>
          </label>
          <button style={btn} onClick={() => run(api.del(`/api/admin/mobile/items/${it.id}`), 'Removed')}>Remove</button>
        </div>
      ))}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <AddItem category={category} run={run} />
      </div>
    </>
  );
}

function AddItem({ category, run }: {
  category: Category; run: (p: Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<'artist' | 'album'>(category.kind === 'personas' ? 'artist' : 'album');
  const [q, setQ] = useState('');
  const [artists, setArtists] = useState<PickArtist[]>([]);
  const [albums, setAlbums] = useState<PickAlbum[]>([]);

  const search = useCallback(async () => {
    try {
      if (mode === 'artist') setArtists(await api.get<PickArtist[]>('/api/admin/mobile/pick/artists'));
      else setAlbums(await api.get<PickAlbum[]>(`/api/admin/mobile/pick/albums?q=${encodeURIComponent(q)}`));
    } catch { /* surfaced elsewhere */ }
  }, [mode, q]);

  useEffect(() => { void search(); }, [search]);

  const add = (item_type: 'artist' | 'album', item_ref: string, title: string) =>
    run(api.post(`/api/admin/mobile/categories/${category.key}/items`, { item_type, item_ref, title }), 'Added');

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select style={input} value={mode} onChange={(e) => setMode(e.target.value as 'artist' | 'album')}>
          <option value="artist">Add artist</option>
          <option value="album">Add album</option>
        </select>
        {mode === 'album' && (
          <input style={{ ...input, flex: 1 }} placeholder="Search albums…" value={q}
            onChange={(e) => setQ(e.target.value)} />
        )}
      </div>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
        {mode === 'artist'
          ? artists.map((a) => (
            <Row key={a.slug} label={`${a.name} · ${a.category} (${a.albumCount})`} onAdd={() => add('artist', a.slug, a.name)} />
          ))
          : albums.map((a) => (
            <Row key={a.code} label={`${a.title} — ${a.artist}`} onAdd={() => add('album', a.code, a.title)} />
          ))}
      </div>
    </div>
  );
}

function Row({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <button style={btn} onClick={onAdd}>Add</button>
    </div>
  );
}

// ---- music types ----------------------------------------------------------

function MusicTypes({ musicTypes, settings, run }: {
  musicTypes: MusicType[]; settings: { min_album_count: number };
  run: (p: Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [genre, setGenre] = useState('');
  const [minCount, setMinCount] = useState(String(settings.min_album_count));

  const move = (idx: number, dir: -1 | 1) => {
    const ids = musicTypes.map((m) => m.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void run(api.patch('/api/admin/mobile/music-types-order', { ids }), 'Order saved');
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}>Show a genre once it has at least</label>
        <input style={{ ...input, width: 70 }} type="number" min={1} value={minCount}
          onChange={(e) => setMinCount(e.target.value)} />
        <span style={{ fontSize: 13 }}>albums</span>
        <button style={btn} onClick={() => run(api.patch('/api/admin/mobile/settings', { min_album_count: Number(minCount) }), 'Saved')}>Save</button>
      </div>

      {musicTypes.map((m, i) => (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <button style={{ ...btn, padding: '0 5px' }} onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
            <button style={{ ...btn, padding: '0 5px' }} onClick={() => move(i, 1)} disabled={i === musicTypes.length - 1}>▼</button>
          </div>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
            <input type="checkbox" checked={m.is_active}
              onChange={(e) => run(api.patch(`/api/admin/mobile/music-types/${m.id}`, { is_active: e.target.checked }), 'Updated')} />
            <span style={{ fontSize: 13 }}>{m.label}{m.is_pinned ? ' · pinned' : ''}</span>
          </label>
          {!m.is_pinned && (
            <button style={btn} onClick={() => run(api.del(`/api/admin/mobile/music-types/${m.id}`), 'Removed')}>Remove</button>
          )}
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
        <input style={{ ...input, flex: 1 }} placeholder="Add a genre (e.g. Hymns)" value={genre}
          onChange={(e) => setGenre(e.target.value)} />
        <button style={btn} disabled={!genre.trim()}
          onClick={() => { void run(api.post('/api/admin/mobile/music-types', { genre: genre.trim() }), 'Added'); setGenre(''); }}>Add</button>
      </div>
    </>
  );
}
