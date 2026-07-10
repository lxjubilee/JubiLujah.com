'use client';
// ============================================================================
// Mobile App Settings — admin UI.
//
// Controls what the MOBILE app shows on its Home, independently of the website,
// as three dynamic levels: PAGES (the app's top nav) → each page has an optional
// per-page HERO banner + any number of SECTIONS → each section is typed
// (Artists or Albums) and holds the items you pick. Layout is fixed by type
// (artists render as circles, albums as square covers).
//
// Reads/writes /api/admin/mobile/*; the app reads the resulting /api/mobile/config.
// No optimistic updates — every write re-fetches the whole config.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { api } from '@/lib/api';

interface SectionItem {
  id: number; item_type: 'album' | 'artist'; item_ref: string;
  title: string | null; artist?: string | null; genre?: string | null;
  display_order: number; is_active: boolean;
}
interface Section {
  id: number; category_id: number; name: string; kind: 'artists' | 'albums';
  display_order: number; is_active: boolean; show_genre: boolean; items: SectionItem[];
}
interface HeroSlide {
  id: number; album_ref: string; title?: string | null; artist?: string | null;
  headline: string | null; subtitle: string | null;
  display_order: number; is_active: boolean; starts_at: string | null; ends_at: string | null;
}
interface Page {
  id: number; key: string; label: string; kind: string;
  display_order: number; is_active: boolean; is_visible: boolean; hero_enabled: boolean;
  hero: HeroSlide[]; sections: Section[];
}
interface AdminConfig { categories: Page[]; }
interface PickArtist { slug: string; name: string; category: string; albumCount: number }
interface PickAlbum { code: string; title: string; artist: string; category: string }

// Runs a write, flashes the result, and re-fetches; returns the response so
// callers can (e.g.) auto-select a freshly created page/section.
type Act = <T>(p: Promise<T>, ok: string) => Promise<T | undefined>;

const ALBUM_PAGE_SIZE = 100; // matches the API's pageSize cap

// Deterministic placeholder tile (cover/avatar) from a seed — real cover art is
// a later polish; the admin only needs a recognizable, stable swatch.
function hashHue(s: string) { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 360; }
function tileStyle(seed: string): CSSProperties {
  const h = hashHue(seed);
  return { background: `linear-gradient(135deg, hsl(${h} 42% 30%), hsl(${(h + 40) % 360} 55% 46%))` };
}
function initials(s: string) {
  const w = s.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
  return (s || '?').slice(0, 2).toUpperCase();
}

const CDN_BASE = (process.env.NEXT_PUBLIC_CDN_BASE || 'https://cdn.jubileeverse.com').replace(/\/$/, '');
// Persona avatars live at <CDN>/personas/<Firstname>.png (matches the API's
// personaImage()); non-personas 404 and fall back to the gradient tile.
function personaUrl(slug: string) {
  const f = slug.split('-')[0] || slug;
  return `${CDN_BASE}/personas/${f.charAt(0).toUpperCase()}${f.slice(1)}.png`;
}

// Cover/avatar thumbnail. Albums resolve through the same-origin /cover/<code>
// route (CDN-first, local fallback); artists through the persona CDN url. Either
// falls back to a deterministic gradient tile with initials if the image 404s.
function Thumb({ shape, seed, code, slug }: { shape: 'sq' | 'circ'; seed: string; code?: string; slug?: string }) {
  const [broken, setBroken] = useState(false);
  const src = code ? `/cover/${encodeURIComponent(code)}.png` : slug ? personaUrl(slug) : null;
  if (!src || broken) return <div className={`mas-tile ${shape}`} style={tileStyle(seed)}><span>{initials(seed)}</span></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`mas-tile ${shape}`} src={src} alt="" loading="lazy" onError={() => setBroken(true)} />;
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={`mas-switch${checked ? ' on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="mas-track" aria-hidden="true" /> {label}
    </label>
  );
}

// ---- Themed confirm / prompt modal (replaces window.confirm / window.prompt) ----
interface ConfirmOpts { title: string; message?: string; confirmLabel?: string }
interface PromptOpts { title: string; message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string }
type DialogState = ({ type: 'confirm' } & ConfirmOpts) | ({ type: 'prompt' } & PromptOpts);
interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  promptText: (opts: PromptOpts) => Promise<string | null>;
}
const DialogContext = createContext<DialogApi>({ confirm: async () => false, promptText: async () => null });
function useDialog() { return useContext(DialogContext); }

function Modal({ dialog, onResolve }: { dialog: DialogState | null; onResolve: (v: boolean | string | null) => void }) {
  const isPrompt = dialog?.type === 'prompt';
  const [value, setValue] = useState('');
  useEffect(() => { setValue(dialog?.type === 'prompt' ? (dialog.defaultValue ?? '') : ''); }, [dialog]);
  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onResolve(dialog.type === 'prompt' ? null : false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, onResolve]);
  if (!dialog) return null;

  const cancel = () => onResolve(isPrompt ? null : false);
  const ok = () => onResolve(isPrompt ? (value.trim() || null) : true);

  return (
    <div className="mas-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className="mas-modal" role="dialog" aria-modal="true" aria-label={dialog.title}>
        <h3>{dialog.title}</h3>
        {dialog.message && <p>{dialog.message}</p>}
        {isPrompt && (
          <input className="mas-input" autoFocus value={value}
            placeholder={(dialog as PromptOpts).placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />
        )}
        <div className="mas-modal-actions">
          <button className="mm-btn" onClick={cancel}>Cancel</button>
          <button className="mm-btn primary" onClick={ok} disabled={isPrompt && !value.trim()}>
            {dialog.confirmLabel ?? (isPrompt ? 'Save' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MobileAppSettings() {
  const { loading, authenticated, hasRole } = useAuth();
  const [cfg, setCfg] = useState<AdminConfig | null>(null);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pageDragIdx, setPageDragIdx] = useState<number | null>(null);
  const [pageOverIdx, setPageOverIdx] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolver = useRef<((v: boolean | string | null) => void) | null>(null);
  const resolveDialog = useCallback((v: boolean | string | null) => {
    const r = resolver.current; resolver.current = null; setDialog(null); r?.(v);
  }, []);
  const dialogApi = useMemo<DialogApi>(() => ({
    confirm: (opts) => new Promise<boolean>((resolve) => { resolver.current = resolve as (v: boolean | string | null) => void; setDialog({ type: 'confirm', ...opts }); }),
    promptText: (opts) => new Promise<string | null>((resolve) => { resolver.current = resolve as (v: boolean | string | null) => void; setDialog({ type: 'prompt', ...opts }); }),
  }), []);

  const flash = useCallback((kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  }, []);

  const reload = useCallback(async () => {
    try { setCfg(await api.get<AdminConfig>('/api/admin/mobile/config')); }
    catch (e) { flash('err', String((e as Error).message || e)); }
  }, [flash]);

  useEffect(() => {
    if (!loading && authenticated && hasRole('admin')) void reload();
  }, [loading, authenticated, hasRole, reload]);

  const act = useCallback<Act>(async (p, ok) => {
    try { const r = await p; flash('ok', ok); await reload(); return r; }
    catch (e) { flash('err', String((e as Error).message || e)); return undefined; }
  }, [flash, reload]);

  if (loading) return <p className="notice">Checking access…</p>;
  if (!authenticated || !hasRole('admin')) return <p className="notice">Access denied — requires the admin role.</p>;

  const cats = cfg?.categories ?? [];
  const pages = cats.filter((c) => c.kind !== 'music_type');
  const selectedPage = pages.find((p) => p.key === selKey) ?? pages[0] ?? null;

  // Drag-and-drop reorder of the pages. Pages reorder by KEY; music_type is kept
  // at the end (it isn't shown in this list).
  const dropReorderPages = (to: number) => {
    if (pageDragIdx === null || pageDragIdx === to) return;
    const order = pages.map((p) => p.key);
    const [moved] = order.splice(pageDragIdx, 1);
    order.splice(to, 0, moved);
    const keys = [...order, ...cats.filter((c) => c.kind === 'music_type').map((c) => c.key)];
    void act(api.patch('/api/admin/mobile/categories-order', { keys }), 'Order saved');
  };

  const addPage = async () => {
    const label = await dialogApi.promptText({ title: 'Add page', placeholder: 'e.g. New Releases', confirmLabel: 'Add page' });
    if (!label || !label.trim()) return;
    const p = await act(api.post<Page>('/api/admin/mobile/categories', { label: label.trim() }), 'Page added');
    if (p) setSelKey(p.key);
  };

  return (
    <DialogContext.Provider value={dialogApi}>
      <h2 className="section-title">Mobile App Settings</h2>
      <p className="muted" style={{ marginTop: -6, marginBottom: 6, fontSize: 13 }}>
        Control what the mobile app shows on its Home pages. Changes go live in the app within a minute.
      </p>
      {msg && <div className={`mas-flash ${msg.kind}`}>{msg.text}</div>}

      <div className="mas-layout">
          <div>
            <p className="mas-eyebrow">Category · the app&apos;s top nav</p>
            <div className="mas-pages">
              {pages.map((p, i) => (
                <div key={p.key} role="button" tabIndex={0}
                  className={`mas-page${selectedPage && p.key === selectedPage.key ? ' sel' : ''}${pageDragIdx === i ? ' mas-drag' : ''}${pageOverIdx === i && pageDragIdx !== null && pageDragIdx !== i ? ' mas-over' : ''}`}
                  onClick={() => setSelKey(p.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelKey(p.key); } }}
                  onDragOver={(e) => { e.preventDefault(); if (pageOverIdx !== i) setPageOverIdx(i); }}
                  onDragLeave={() => setPageOverIdx((o) => (o === i ? null : o))}
                  onDrop={(e) => { e.preventDefault(); dropReorderPages(i); setPageDragIdx(null); setPageOverIdx(null); }}>
                  <span className="mas-grip" draggable title="Drag to reorder"
                    onClick={(e) => e.stopPropagation()}
                    onDragStart={(e) => { e.stopPropagation(); setPageDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setPageDragIdx(null); setPageOverIdx(null); }}>⠿</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="mas-nm">{p.label}</div>
                    <div className="mas-sub">
                      {p.hero_enabled ? 'hero · ' : ''}{p.sections.length} section{p.sections.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="mas-flags">
                    <span className={`mas-dot ${p.is_active ? 'on' : 'off'}`} title={p.is_active ? 'Active (shown)' : 'Inactive (hidden)'} />
                  </div>
                </div>
              ))}
            </div>
            <button className="mm-btn sm" style={{ marginTop: 12, width: '100%' }} onClick={() => void addPage()}>+ Add page</button>
          </div>

          <div>
            {selectedPage
              ? <PageEditor key={selectedPage.key} page={selectedPage} act={act} />
              : <p className="muted">No pages yet — add one to start.</p>}
          </div>
      </div>
      <Modal dialog={dialog} onResolve={resolveDialog} />
    </DialogContext.Provider>
  );
}

// ---------------------------------------------------------------------------

function PageEditor({ page, act }: { page: Page; act: Act }) {
  const { confirm } = useDialog();
  const patch = (body: Record<string, unknown>) => act(api.patch(`/api/admin/mobile/categories/${page.key}`, body), 'Page updated');
  const del = async () => {
    if (await confirm({ title: `Delete “${page.label}”?`, message: 'This page and its hero banner and sections will be removed.', confirmLabel: 'Delete page' })) {
      void act(api.del(`/api/admin/mobile/categories/${page.key}`), 'Page deleted');
    }
  };
  return (
    <div className="mas-stack">
      <div className="mas-card">
        <div className="mas-head mas-head--bottom">
          <label className="mas-field" style={{ flex: 1, minWidth: 200 }}>
            <span className="mas-flab">Category name</span>
            <input className="mas-input" defaultValue={page.label} key={page.label}
              onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== page.label) void patch({ label: v }); }} />
          </label>
          <div className="mas-toggles">
            <Switch checked={page.is_active} onChange={(v) => void patch({ is_active: v })} label="Active" />
            <button className="mas-icon mas-icon--danger" title="Delete page" onClick={() => void del()}>🗑</button>
          </div>
        </div>
      </div>

      <HeroManager page={page} act={act} />
      <SectionsEditor page={page} act={act} />
    </div>
  );
}

// ---- Per-page hero ---------------------------------------------------------

function HeroManager({ page, act }: { page: Page; act: Act }) {
  const slides = page.hero;
  const existing = new Set(slides.map((s) => s.album_ref));
  // Drag-and-drop reorder (via the grip handle on each row).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dropReorder = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const ids = slides.map((s) => s.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(to, 0, moved);
    void act(api.patch(`/api/admin/mobile/categories/${page.key}/hero-order`, { ids }), 'Order saved');
  };
  const patchSlide = (id: number, body: Record<string, unknown>, ok = 'Saved') =>
    act(api.patch(`/api/admin/mobile/hero-slides/${id}`, body), ok);

  return (
    <div className="mas-card">
      <div className="mas-head">
        <p className="mas-label">Hero banner · this page</p>
        <Switch checked={page.hero_enabled}
          onChange={(v) => void act(api.patch(`/api/admin/mobile/categories/${page.key}`, { hero_enabled: v }), 'Updated')}
          label="Active" />
      </div>

      {!page.hero_enabled ? (
        <p className="mas-hint">Turn on to show a full-width hero carousel at the top of this page.</p>
      ) : (
        <>
          <p className="mas-hint">Full-width carousel at the top of this page{slides.length > 1 ? ' · drag the grip to reorder' : ', in this order'}.</p>
          {slides.length === 0 && <p className="mas-empty">No slides yet — add an album below.</p>}
          {slides.length > 0 && (
          <div className="mas-slidelist jv-scroll">
          {slides.map((s, i) => (
            <div key={s.id}
              className={`mas-slide${dragIdx === i ? ' mas-drag' : ''}${overIdx === i && dragIdx !== null && dragIdx !== i ? ' mas-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
              onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropReorder(i); setDragIdx(null); setOverIdx(null); }}>
              <span className="mas-grip" draggable title="Drag to reorder"
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>⠿</span>
              <Thumb shape="sq" code={s.album_ref} seed={s.title || s.album_ref} />
              <div className="mas-sfields">
                <div className="mas-stitle">{s.title || s.album_ref}</div>
                <div className="mas-smeta">
                  <Switch checked={s.is_active} onChange={(v) => void patchSlide(s.id, { is_active: v }, 'Updated')} label="Active" />
                  <span>·</span><span>{s.artist || '—'}</span>
                </div>
              </div>
              <div className="mas-sside">
                <button className="mas-icon mas-icon--danger" title="Remove" onClick={() => void act(api.del(`/api/admin/mobile/hero-slides/${s.id}`), 'Removed')}>✕</button>
              </div>
            </div>
          ))}
          </div>
          )}
          <Picker kind="albums" existing={existing} addLabel="Add hero slide"
            onAdd={(ref) => void act(api.post(`/api/admin/mobile/categories/${page.key}/hero-slides`, { album_ref: ref }), 'Hero slide added')} />
        </>
      )}
    </div>
  );
}

// ---- Sections --------------------------------------------------------------

function SectionsEditor({ page, act }: { page: Page; act: Act }) {
  const sections = page.sections;
  const [selId, setSelId] = useState<number | null>(null);
  const sel = sections.find((s) => s.id === selId) ?? sections[0] ?? null;

  // Drag-and-drop reorder of the section tabs.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dropReorderSections = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(to, 0, moved);
    void act(api.patch(`/api/admin/mobile/categories/${page.key}/sections-order`, { ids }), 'Order saved');
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    void act(api.patch(`/api/admin/mobile/categories/${page.key}/sections-order`, { ids }), 'Order saved');
  };
  const addSection = async () => {
    const s = await act(api.post<Section>(`/api/admin/mobile/categories/${page.key}/sections`, { name: 'New section', kind: 'artists' }), 'Section added');
    if (s) setSelId(s.id);
  };

  return (
    <div className="mas-card">
      <div className="mas-head" style={{ marginBottom: 12 }}>
        <p className="mas-label">Sections on this page{sections.length > 1 ? ' · drag to reorder' : ''}</p>
        <button className="mm-btn sm" onClick={() => void addSection()}>+ Add section</button>
      </div>

      {sections.length === 0 ? (
        <p className="mas-empty">No sections yet. Add one, then choose Artists or Albums.</p>
      ) : (
        <>
          <div className="mas-sectabs jv-scroll" role="tablist" aria-label="Sections">
            {sections.map((s, i) => (
              <button key={s.id} draggable
                className={`mas-sectab${sel && s.id === sel.id ? ' sel' : ''}${overIdx === i && dragIdx !== null && dragIdx !== i ? ' mas-over' : ''}`}
                style={{ opacity: dragIdx === i ? 0.4 : (s.is_active ? 1 : 0.55) }}
                onClick={() => setSelId(s.id)}
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
                onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
                onDrop={(e) => { e.preventDefault(); dropReorderSections(i); setDragIdx(null); setOverIdx(null); }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>
                <span>{s.name}</span>
                <small>{s.kind === 'artists' ? '◍ Artists' : '▦ Albums'} · {s.items.length}{s.is_active ? '' : ' · hidden'}</small>
              </button>
            ))}
          </div>
          {sel && (
            <SectionEditor key={sel.id} page={page} section={sel} act={act}
              index={sections.findIndex((s) => s.id === sel.id)} count={sections.length} onMove={moveSection} />
          )}
        </>
      )}
    </div>
  );
}

function SectionEditor({ page, section, act, index, count, onMove }: {
  page: Page; section: Section; act: Act; index: number; count: number; onMove: (idx: number, dir: -1 | 1) => void;
}) {
  const { confirm } = useDialog();
  const isArtists = section.kind === 'artists';
  const items = section.items;
  const existing = new Set(items.map((it) => it.item_ref));

  const setKind = async (k: 'artists' | 'albums') => {
    if (k === section.kind) return;
    if (items.length === 0 || await confirm({ title: 'Switch section type?', message: 'This removes this section’s current items.', confirmLabel: 'Switch type' })) {
      void act(api.patch(`/api/admin/mobile/sections/${section.id}`, { kind: k }), 'Type changed');
    }
  };
  const del = async () => {
    if (await confirm({ title: `Delete “${section.name}”?`, message: 'This section and its items will be removed.', confirmLabel: 'Delete section' })) {
      void act(api.del(`/api/admin/mobile/sections/${section.id}`), 'Section deleted');
    }
  };

  // Drag-and-drop reorder for the artist circles (album rows use the ▲/▼ buttons).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dropReorder = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const ids = items.map((it) => it.id);
    const [moved] = ids.splice(dragIdx, 1);
    ids.splice(to, 0, moved);
    void act(api.patch(`/api/admin/mobile/sections/${section.id}/items-order`, { ids }), 'Order saved');
  };

  return (
    <div className="mas-card--inset" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
      <div className="mas-head mas-head--bottom">
        <label className="mas-field" style={{ flex: 1, minWidth: 180 }}>
          <span className="mas-flab">Section name</span>
          <input className="mas-input" defaultValue={section.name} key={section.name}
            onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== section.name) void act(api.patch(`/api/admin/mobile/sections/${section.id}`, { name: v }), 'Renamed'); }} />
        </label>
        <div className="mas-toggles">
          <Switch checked={section.is_active}
            onChange={(v) => void act(api.patch(`/api/admin/mobile/sections/${section.id}`, { is_active: v }), 'Updated')}
            label="Active" />
          {!isArtists && (
            <Switch checked={section.show_genre}
              onChange={(v) => void act(api.patch(`/api/admin/mobile/sections/${section.id}`, { show_genre: v }), 'Updated')}
              label="Genre" />
          )}
          <button className="mas-icon" title="Move left" disabled={index === 0} onClick={() => onMove(index, -1)}>◀</button>
          <button className="mas-icon" title="Move right" disabled={index === count - 1} onClick={() => onMove(index, 1)}>▶</button>
          <button className="mas-icon mas-icon--danger" title="Delete section" onClick={() => void del()}>🗑</button>
        </div>
      </div>

      <p className="mas-label" style={{ margin: '16px 0 8px' }}>Content type — layout is fixed by type</p>
      <div className="mas-seg" role="tablist" aria-label="Section content type">
        <button className={isArtists ? 'on' : ''} onClick={() => void setKind('artists')}>◍ Artists <span>circles</span></button>
        <button className={!isArtists ? 'on' : ''} onClick={() => void setKind('albums')}>▦ Albums <span>covers</span></button>
      </div>

      <p className="mas-label" style={{ margin: '18px 0 12px' }}>
        In this section — {items.length} {isArtists ? 'artist' : 'album'}{items.length === 1 ? '' : 's'}
        {items.length > 1 ? ' · drag to reorder' : ''}
      </p>
      {items.length === 0 && <p className="mas-empty">Nothing yet — add {isArtists ? 'artists' : 'albums'} below.</p>}

      {isArtists ? (
        <div className="mas-circrow mas-itemlist jv-scroll">
          {items.map((it, i) => (
            <div key={it.id} draggable
              className={`mas-circ${dragIdx === i ? ' mas-drag' : ''}${overIdx === i && dragIdx !== null && dragIdx !== i ? ' mas-over' : ''}`}
              onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
              onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropReorder(i); setDragIdx(null); setOverIdx(null); }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>
              <Thumb shape="circ" slug={it.item_ref} seed={it.title || it.item_ref} />
              <div className="mas-cnm" title={it.title || it.item_ref}>{it.title || it.item_ref}</div>
              <button className="mas-x" title="Remove" onClick={() => void act(api.del(`/api/admin/mobile/items/${it.id}`), 'Removed')}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mas-itemlist jv-scroll">
          {items.map((it, i) => (
            <div key={it.id}
              className={`mas-itemrow${dragIdx === i ? ' mas-drag' : ''}${overIdx === i && dragIdx !== null && dragIdx !== i ? ' mas-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); if (overIdx !== i) setOverIdx(i); }}
              onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
              onDrop={(e) => { e.preventDefault(); dropReorder(i); setDragIdx(null); setOverIdx(null); }}>
              <span className="mas-grip" draggable title="Drag to reorder"
                onDragStart={(e) => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>⠿</span>
              <Thumb shape="sq" code={it.item_ref} seed={it.title || it.item_ref} />
              <div style={{ minWidth: 0 }}>
                {/* Mirrors what the app captions the cover with: the primary genre
                    when this section shows genres, falling back to the album name
                    for the albums the catalog gives no genre. */}
                <div className="mas-it-title">{(section.show_genre && it.genre) || it.title || it.item_ref}</div>
                <div className="mas-it-sub">{it.artist || '—'}</div>
              </div>
              <button className="mm-btn sm" onClick={() => void act(api.del(`/api/admin/mobile/items/${it.id}`), 'Removed')}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <Picker kind={section.kind} existing={existing} addLabel={isArtists ? 'Add artists' : 'Add albums'}
        onAdd={(ref, title) => void act(api.post(`/api/admin/mobile/sections/${section.id}/items`, { item_ref: ref, title }), 'Added')} />
    </div>
  );
}

// ---- Shared picker (artists client-filtered; albums server-paged) ----------

function Picker({ kind, existing, onAdd, addLabel }: {
  kind: 'artists' | 'albums'; existing: Set<string>; onAdd: (ref: string, title: string) => void; addLabel: string;
}) {
  const isAlbum = kind === 'albums';
  const [q, setQ] = useState('');
  const [artists, setArtists] = useState<PickArtist[]>([]);
  const [albums, setAlbums] = useState<PickAlbum[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const search = useCallback(async () => {
    try {
      if (!isAlbum) setArtists(await api.get<PickArtist[]>('/api/admin/mobile/pick/artists'));
      else {
        const r = await api.get<{ items: PickAlbum[]; total: number }>(
          `/api/admin/mobile/pick/albums?q=${encodeURIComponent(q)}&page=${page}&pageSize=${ALBUM_PAGE_SIZE}`);
        setAlbums(r.items); setTotal(r.total);
      }
    } catch { /* surfaced by the caller's act() */ }
  }, [isAlbum, q, page]);

  useEffect(() => { void search(); }, [search]);
  useEffect(() => { setPage(1); }, [q]);

  const shownArtists = artists.filter((a) => !q || `${a.name} ${a.category}`.toLowerCase().includes(q.toLowerCase()));
  const pages = Math.max(1, Math.ceil(total / ALBUM_PAGE_SIZE));

  return (
    <div className="mas-picker">
      <p className="mas-label" style={{ marginBottom: 10 }}>{addLabel}</p>
      <div className="mas-picker-bar">
        <input className="mas-input" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={isAlbum ? `Search ${total || ''} albums…` : 'Search artists…'} />
      </div>
      <div className="jv-scroll" style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
        {!isAlbum
          ? shownArtists.map((a) => {
            const added = existing.has(a.slug);
            return (
              <div className="mas-pickrow" key={a.slug}>
                <Thumb shape="circ" slug={a.slug} seed={a.name} />
                <div style={{ minWidth: 0 }}>
                  <div className="mas-pk-title">{a.name}</div>
                  <div className="mas-pk-sub">{a.albumCount} albums · {a.category}</div>
                </div>
                {added ? <span className="mas-added">Added</span>
                  : <button className="mm-btn primary sm" onClick={() => onAdd(a.slug, a.name)}>Add</button>}
              </div>
            );
          })
          : albums.map((a) => {
            const added = existing.has(a.code);
            return (
              <div className="mas-pickrow" key={a.code}>
                <Thumb shape="sq" code={a.code} seed={a.title} />
                <div style={{ minWidth: 0 }}>
                  <div className="mas-pk-title">{a.title}</div>
                  <div className="mas-pk-sub">{a.artist}</div>
                </div>
                {added ? <span className="mas-added">Added</span>
                  : <button className="mm-btn primary sm" onClick={() => onAdd(a.code, a.title)}>Add</button>}
              </div>
            );
          })}
      </div>
      {isAlbum && total > ALBUM_PAGE_SIZE && (
        <div className="mm-pager">
          <span>{total} albums · page {page}/{pages}</span>
          <button className="mm-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className="mm-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
