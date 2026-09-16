'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { heroKey, useHeroPositions } from '@/stores/heroPositions';

// ============================================================================
// ADMIN · HERO IMAGE PREVIEW (owner, 2026-09-16).
//
//   the grid         every hero picture that has been positioned, grouped by
//                    artist, each thumbnail cropped the way the site crops it.
//                    Filters show the ones still waiting, or all of them.
//   the previewer    "Preview & position" steps through every picture NO admin
//                    has positioned yet: frame it, Save & next, and the next one
//                    comes up. Clicking a thumbnail opens the same previewer on
//                    that picture, to re-frame one that is already set.
//
// 🔴 "POSITIONED" MEANS A VALUE IS STORED, NOT THAT IT IS NON-ZERO. An unset
// picture renders at 0 (top), and so does one an admin looked at and decided the
// top was right. Saving 0 is a decision; it takes the picture out of the queue.
//
// 🔴 THE PREVIEW IS THE HOME HERO AT REAL SIZE, SCALED DOWN — NOT A SMALL HERO.
// The banner is full width by (viewport − 98px header − 80px player), and its
// lettering is in absolute pixels. Drawn natively at, say, 1920×902 and shrunk
// with a transform, the crop AND the words sitting over it are in true
// proportion; a thumbnail-sized banner would put 40px titles over a third of the
// picture and frame everything too high. The album page banner uses the same
// height and the same stored value, so this frame stands for both.
//
// Direction matches the red arrows (components/HeroQr.tsx): "up" raises the
// value, which moves the picture up and brings its lower part into view.
// ============================================================================

export interface PreviewHero {
  code: string;
  title: string;
  artistName: string;
  image: string;
  href: string;
  blurb: string;
}

/** The chrome the home hero subtracts from the viewport (globals.css .jp-hero). */
const HERO_CHROME = 98 + 80;

const FRAMES = [
  { id: 'laptop', label: 'Laptop · 1366×768', w: 1366, h: 768 },
  { id: 'laptop-hd', label: 'Laptop · 1536×864', w: 1536, h: 864 },
  { id: 'desktop', label: 'Desktop · 1920×1080', w: 1920, h: 1080 },
  { id: 'wide', label: 'Ultrawide · 3440×1440', w: 3440, h: 1440 },
  { id: 'screen', label: 'This window', w: 0, h: 0 },
] as const;
type FrameId = (typeof FRAMES)[number]['id'];
const FRAME_STORE = 'jp-hero-preview-frame';

type View = 'positioned' | 'needs' | 'all';

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const fmt = (v: number) => `${Math.round(v * 10) / 10}%`;

function frameSize(id: FrameId): { w: number; h: number } {
  const f = FRAMES.find((x) => x.id === id) || FRAMES[2];
  const w = f.w || (typeof window !== 'undefined' ? window.innerWidth : 1920);
  const h = f.h || (typeof window !== 'undefined' ? window.innerHeight : 1080);
  return { w, h: Math.max(320, h - HERO_CHROME) };
}

export default function HeroImagePreview({ pool }: { pool: PreviewHero[] }) {
  const map = useHeroPositions((s) => s.map);
  const [ready, setReady] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [view, setView] = useState<View>('positioned');
  const [artist, setArtist] = useState('');
  const [session, setSession] = useState<{ codes: string[]; start: number; label: string } | null>(null);
  const [local, setLocal] = useState(false);

  // The stored framing, fresh from the server: the queue of "not positioned
  // yet" is only as true as this map, so the page waits for it rather than
  // trusting whatever the store picked up earlier on another page.
  useEffect(() => {
    let live = true;
    setLocal(/^(localhost|127\.|\[::1\])/.test(window.location.hostname));
    fetch('/backstage/hero-position', { cache: 'no-store', credentials: 'omit' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((m: Record<string, number>) => {
        if (!live) return;
        useHeroPositions.setState((st) => ({ map: { ...st.map, ...(m || {}) }, loaded: true }));
        setReady(true);
      })
      .catch(() => { if (live) { setLoadErr(true); setReady(true); } });
    return () => { live = false; };
  }, []);

  const isSet = useCallback((code: string) => map[heroKey(code)] != null, [map]);

  const artists = useMemo(
    () => Array.from(new Set(pool.map((h) => h.artistName))).sort((a, b) => a.localeCompare(b)),
    [pool],
  );

  // Artist, then title: the order the grid reads in, and the order the
  // previewer walks, so "next" is the picture beside the one just framed.
  const ordered = useMemo(
    () => pool.slice().sort((a, b) => a.artistName.localeCompare(b.artistName) || a.title.localeCompare(b.title)),
    [pool],
  );
  const inArtist = useMemo(() => ordered.filter((h) => !artist || h.artistName === artist), [ordered, artist]);

  const total = pool.length;
  const positioned = ready ? pool.filter((h) => isSet(h.code)).length : 0;
  const needsHere = ready ? inArtist.filter((h) => !isSet(h.code)) : [];

  const shown = inArtist.filter((h) => view === 'all' || (view === 'positioned' ? isSet(h.code) : !isSet(h.code)));
  const groups = useMemo(() => {
    const out = new Map<string, PreviewHero[]>();
    for (const h of shown) {
      const list = out.get(h.artistName);
      if (list) list.push(h); else out.set(h.artistName, [h]);
    }
    return Array.from(out.entries());
  }, [shown]);

  const byCode = useMemo(() => new Map(pool.map((h) => [h.code, h])), [pool]);

  const startQueue = (list: PreviewHero[], label: string) => {
    if (list.length) setSession({ codes: list.map((h) => h.code), start: 0, label });
  };

  return (
    <div className="hip">
      <h2 className="section-title">Hero Image Preview</h2>
      <p className="section-sub">
        How every album&apos;s hero picture sits in the home banner and on its album page. Step through the ones
        nobody has positioned yet, or click any picture to re-frame it. Saves go live for every visitor.
      </p>

      {local && (
        <div className="notice hip-warn">
          You are on a <strong>local</strong> server: positions saved here are written to this machine&apos;s
          <code> content/hero-positions.json</code> and are never shipped by a release. To change the live site,
          position them at <strong>www.jubileepraise.com/admin/hero-images</strong>.
        </div>
      )}
      {loadErr && <div className="notice hip-warn">Could not load the saved positions, so the counts below may be wrong.</div>}

      <div className="kpi-row">
        <div className="kpi"><div className="n">{total}</div><div className="l">Hero pictures</div></div>
        <div className="kpi"><div className="n">{ready ? positioned : '…'}</div><div className="l">Positioned</div></div>
        <div className="kpi hip-kpi-needs"><div className="n">{ready ? total - positioned : '…'}</div><div className="l">Need positioning</div></div>
      </div>

      <div className="hip-toolbar">
        <button
          type="button"
          className="btn primary"
          disabled={!ready || needsHere.length === 0}
          onClick={() => startQueue(needsHere, artist ? `${artist} · not yet positioned` : 'Not yet positioned')}
        >
          {!ready ? 'Loading…'
            : needsHere.length ? `Preview & position · ${needsHere.length} to go`
              : 'All positioned ✓'}
        </button>

        <div className="hip-seg" role="tablist" aria-label="Show">
          {([
            ['positioned', `Positioned (${ready ? inArtist.filter((h) => isSet(h.code)).length : '…'})`],
            ['needs', `Needs position (${ready ? needsHere.length : '…'})`],
            ['all', `All (${inArtist.length})`],
          ] as [View, string][]).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v}
              className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>

        <select className="hip-select" value={artist} onChange={(e) => setArtist(e.target.value)} aria-label="Artist">
          <option value="">All artists</option>
          {artists.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {ready && groups.length === 0 && (
        <p className="notice">
          {view === 'positioned' ? 'No pictures have been positioned yet. Press Preview & position to start.'
            : view === 'needs' ? 'Every picture here has a position.' : 'No hero pictures found.'}
        </p>
      )}

      {ready && groups.map(([name, list]) => {
        const all = inArtist.filter((h) => h.artistName === name);
        const waiting = all.filter((h) => !isSet(h.code));
        return (
          <section key={name} className="hip-group">
            <header className="hip-group-head">
              <h3>{name}</h3>
              <span className="muted">{all.length - waiting.length} positioned · {waiting.length} need position</span>
              {waiting.length > 0 && (
                <button type="button" className="btn ghost hip-small" onClick={() => startQueue(waiting, `${name} · not yet positioned`)}>
                  Position {waiting.length}
                </button>
              )}
            </header>
            <div className="hip-grid">
              {list.map((h) => {
                const y = map[heroKey(h.code)];
                return (
                  <button
                    key={h.code}
                    type="button"
                    className="hip-tile"
                    title={`${h.title} · ${h.code}`}
                    onClick={() => setSession({ codes: shown.map((s) => s.code), start: shown.indexOf(h), label: 'Browsing' })}
                  >
                    <span className="hip-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.image} alt="" loading="lazy" decoding="async" style={{ objectPosition: `center ${y ?? 0}%` }} />
                      <span className={`hip-badge${y == null ? ' is-needs' : ''}`}>{y == null ? 'Needs position' : fmt(y)}</span>
                    </span>
                    <span className="hip-tile-title">{h.title}</span>
                    <span className="hip-tile-code">{h.code}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {session && (
        <Previewer
          heroes={session.codes.map((c) => byCode.get(c)).filter((h): h is PreviewHero => !!h)}
          start={session.start}
          label={session.label}
          onClose={() => setSession(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The step-through previewer.
// ---------------------------------------------------------------------------

function Previewer({ heroes, start, label, onClose }: {
  heroes: PreviewHero[]; start: number; label: string; onClose: () => void;
}) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(start, heroes.length - 1)));
  const [done, setDone] = useState(false);
  const [saved, setSaved] = useState(0);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [frameId, setFrameId] = useState<FrameId>('desktop');
  const [natural, setNatural] = useState(16 / 9);
  const [step, setStep] = useState(5);
  const save = useHeroPositions((s) => s.save);

  const hero = heroes[idx];
  const stored = useHeroPositions((s) => (hero ? s.map[heroKey(hero.code)] : undefined));
  const [y, setY] = useState(stored ?? 0);

  // New picture: start from what is stored for it (0, the site default, if nothing).
  useEffect(() => {
    if (!hero) return;
    setY(useHeroPositions.getState().map[heroKey(hero.code)] ?? 0);
    setStatus('idle');
  }, [hero]);

  // Fetch the next picture ahead, so Save & next never lands on a black frame.
  useEffect(() => {
    const next = heroes[idx + 1];
    if (next) { const img = new Image(); img.src = next.image; }
  }, [heroes, idx]);

  useEffect(() => {
    try {
      const f = localStorage.getItem(FRAME_STORE) as FrameId | null;
      if (f && FRAMES.some((x) => x.id === f)) setFrameId(f);
    } catch { /* storage blocked: keep the default */ }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [size, setSize] = useState(() => frameSize('desktop'));
  useEffect(() => {
    const update = () => setSize(frameSize(frameId));
    update();
    if (frameId !== 'screen') return;
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [frameId]);

  const pickFrame = (id: FrameId) => {
    setFrameId(id);
    try { localStorage.setItem(FRAME_STORE, id); } catch { /* ignore */ }
  };

  const next = useCallback(() => {
    if (idx + 1 < heroes.length) setIdx(idx + 1); else setDone(true);
  }, [idx, heroes.length]);
  const back = useCallback(() => { if (done) setDone(false); else if (idx > 0) setIdx(idx - 1); }, [idx, done]);

  const saveAndNext = useCallback(async () => {
    if (!hero || status === 'saving') return;
    setStatus('saving');
    const ok = await save(hero.code, y);
    if (!ok) { setStatus('error'); return; }
    setSaved((n) => n + 1);
    setStatus('idle');
    next();
  }, [hero, y, save, next, status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'SELECT' || t?.tagName === 'TEXTAREA') return;
      const inRange = t?.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range';
      const by = e.shiftKey ? 1 : step;
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (done) return;
      if (e.key === 'Enter') {
        if (t?.tagName === 'BUTTON') return; // a focused button handles its own Enter
        e.preventDefault(); void saveAndNext(); return;
      }
      if (inRange) return; // the slider moves itself with the arrow keys
      if (e.key === 'ArrowUp') { e.preventDefault(); setY((v) => clamp(v + by)); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setY((v) => clamp(v - by)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, done, saveAndNext, next, back, onClose]);

  if (!hero) return null;

  const frameAspect = size.w / size.h;
  const visible = Math.min(1, natural / frameAspect);
  const changed = stored == null || Math.abs(stored - y) > 0.05;

  return (
    <div className="hip-overlay" role="dialog" aria-modal="true" aria-label="Hero image previewer">
      <div className="hip-bar">
        <strong className="hip-bar-title">Hero Image Preview</strong>
        <span className="muted">{label}</span>
        <span className="hip-progress-text">{done ? `${heroes.length} of ${heroes.length}` : `${idx + 1} of ${heroes.length}`}</span>
        <span className="hip-progress"><span style={{ width: `${((done ? heroes.length : idx) / heroes.length) * 100}%` }} /></span>
        <span className="muted">{saved} saved</span>
        <select className="hip-select" value={frameId} onChange={(e) => pickFrame(e.target.value as FrameId)} aria-label="Preview screen size">
          {FRAMES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <button type="button" className="hip-close" onClick={onClose} aria-label="Close previewer" title="Close (Esc)">✕</button>
      </div>

      {done ? (
        <div className="hip-done">
          <h3>All done</h3>
          <p>{saved} of {heroes.length} picture{heroes.length === 1 ? '' : 's'} saved in this pass.</p>
          <div className="hip-actions">
            <button type="button" className="btn ghost" onClick={back}>← Back to the last picture</button>
            <button type="button" className="btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      ) : (
        <>
          <div className="hip-stage">
            <div className="hip-stage-main">
              <HeroFrame hero={hero} y={y} w={size.w} h={size.h} onNatural={setNatural} />
              <div className="hip-caption muted">
                The home banner at {size.w}×{size.h + HERO_CHROME}, scaled to fit. The album page banner uses the same framing.
              </div>
            </div>

            <aside className="hip-panel">
              <div className="hip-panel-title">{hero.title}</div>
              <div className="muted hip-panel-sub">{hero.artistName} · {hero.code}</div>
              <a className="hip-link" href={hero.href} target="_blank" rel="noreferrer">Open album page ↗</a>

              <Minimap image={hero.image} y={y} visible={visible} onPick={setY} />
              {visible >= 0.999 && (
                <p className="hip-note">At this screen size the whole height of the picture shows, so up and down change nothing here. Try a wider size.</p>
              )}

              <div className="hip-readout">
                <span className="hip-readout-n">{fmt(y)}</span>
                <span className={`hip-state${stored == null ? ' is-needs' : ''}`}>
                  {stored == null ? 'Not positioned' : changed ? `Saved at ${fmt(stored)}` : 'Saved'}
                </span>
              </div>

              <div className="hip-nudge">
                <button type="button" className="jp-hero-nudge-btn hip-nudge-btn" onClick={() => setY((v) => clamp(v + step))} aria-label="Move picture up" title="Move picture up (↑)">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><polyline points="6 15 12 9 18 15" /></svg>
                </button>
                <button type="button" className="jp-hero-nudge-btn hip-nudge-btn" onClick={() => setY((v) => clamp(v - step))} aria-label="Move picture down" title="Move picture down (↓)">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <label className="hip-step">
                  Step
                  <select className="hip-select" value={step} onChange={(e) => setStep(Number(e.target.value))}>
                    {[1, 2, 5, 10].map((s) => <option key={s} value={s}>{s}%</option>)}
                  </select>
                </label>
              </div>

              <input
                className="hip-range"
                type="range" min={0} max={100} step={0.5} value={y}
                onChange={(e) => setY(Number(e.target.value))}
                aria-label="Vertical position"
              />
              <div className="hip-range-ends muted"><span>Top of picture</span><span>Bottom</span></div>

              <div className="hip-quick">
                <button type="button" className="btn ghost hip-small" onClick={() => setY(0)}>Top</button>
                <button type="button" className="btn ghost hip-small" onClick={() => setY(50)}>Center</button>
                <button type="button" className="btn ghost hip-small" onClick={() => setY(100)}>Bottom</button>
                {stored != null && changed && (
                  <button type="button" className="btn ghost hip-small" onClick={() => setY(stored)}>Undo</button>
                )}
              </div>
            </aside>
          </div>

          <div className="hip-foot">
            <button type="button" className="btn ghost" onClick={back} disabled={idx === 0}>← Back</button>
            <button type="button" className="btn ghost" onClick={next}>Skip →</button>
            <span className="hip-foot-status">
              {status === 'error' && <span className="hip-err">Not saved. Check you are signed in as an admin, then try again.</span>}
              {status !== 'error' && <span className="muted">↑ ↓ move · Shift for 1% · Enter saves · ← → step · Esc closes</span>}
            </span>
            <button type="button" className="btn primary" onClick={() => void saveAndNext()} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : idx + 1 < heroes.length ? 'Save & next ⏎' : 'Save & finish ⏎'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** The home hero, drawn at a real screen size and scaled to the space it has. */
function HeroFrame({ hero, y, w, h, onNatural }: {
  hero: PreviewHero; y: number; w: number; h: number; onNatural: (aspect: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(0);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = boxW ? boxW / w : 0;

  return (
    <div ref={boxRef} className="hip-frame-box" style={{ aspectRatio: `${w} / ${h}`, maxWidth: `calc((100vh - 230px) * ${(w / h).toFixed(4)})` }}>
      {scale > 0 && (
        <div className="hip-frame" style={{ width: w, height: h, transform: `scale(${scale})` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={hero.code}
            className="jp-hero-art is-live hip-frame-art"
            src={hero.image}
            alt=""
            style={{ objectPosition: `center ${y}%` }}
            onLoad={(e) => {
              const i = e.currentTarget;
              if (i.naturalWidth && i.naturalHeight) onNatural(i.naturalWidth / i.naturalHeight);
            }}
          />
          <div className="jp-hero-scrim" aria-hidden="true" />
          <span className="jp-hero-ident" aria-hidden="true" style={{ fontSize: Math.max(30, Math.min(92, w * 0.054)) }}>
            {hero.artistName}
          </span>
          <div className="jp-hero-content" key={hero.code}>
            <h2 className="jp-hero-title">{hero.title}</h2>
            <p className="jp-hero-blurb">{hero.blurb}</p>
            <div className="jp-hero-actions">
              <span className="jp-hero-play">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5z" /></svg>
                <span>Play Album</span>
              </span>
              <span className="jp-hero-more">View Album</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The whole picture, with the part the banner shows outlined. Click or drag on
 * it to put the window where you want it.
 */
function Minimap({ image, y, visible, onPick }: {
  image: string; y: number; visible: number; onPick: (y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const pick = (clientY: number) => {
    const el = ref.current;
    if (!el || visible >= 0.999) return;
    const r = el.getBoundingClientRect();
    const f = (clientY - r.top) / r.height;
    onPick(clamp(Math.round(((f - visible / 2) / (1 - visible)) * 1000) / 10));
  };

  return (
    <div
      ref={ref}
      className="hip-minimap"
      title="Click or drag to place the visible area"
      onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e.clientY); }}
      onPointerMove={(e) => { if (dragging.current) pick(e.clientY); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" draggable={false} />
      <span
        className="hip-window"
        style={{ top: `${(1 - visible) * y}%`, height: `${visible * 100}%` }}
      />
    </div>
  );
}
