'use client';
// ============================================================================
// Redirector catalog navigation — the QR asset tree.
//
// Left nav restructured into three asset domains, each of which will carry its
// own redirector token + QR code:
//
//   Music     → 12 Inspire personas → each persona's albums → each album's songs
//   Articles  → grouped by persona → each article
//   Books     → (no data source yet — placeholder)
//
// FRONT END ONLY (step 1). Every album and every song shows an INDIVIDUAL QR —
// currently a deterministic *preview* placeholder (clearly labelled "not minted"),
// because token minting is the next step. When the redirector API is wired, each
// leaf's preview is replaced by its real tokened QR (see lib/redirector.ts).
//
// Data is read from the same public catalog the site renders from:
//   /music/catalog-manifest.json   (personas · albums · songs)
//   /articles/articles.json        (articles, by persona)
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { INSPIRE_ORDER, avatarKey } from '@/lib/personas';
import { redirector } from '@/lib/redirector';

// ---- shapes from the public catalog manifest -------------------------------
interface MfTrack { n: number; title: string; file?: string; url?: string }
interface MfAlbum { code: string; title: string; trackCount?: number; playable?: number; tracks?: MfTrack[] }
interface MfArtist { slug: string; name: string; role?: string; albums?: MfAlbum[] }
interface MfCategory { key: string; label: string; artists?: MfArtist[] }
interface Manifest { categories?: MfCategory[] }
interface Article { slug: string; title: string; author?: string; personaSlug?: string; album?: string; song?: string }

type Kind = 'persona' | 'album' | 'song' | 'article' | 'book';
interface Selection {
  kind: Kind;
  title: string;
  qrSeed?: string;                 // preview fallback for not-yet-minted leaves
  token?: string;                  // real minted token → live QR (when present)
  cover?: string | null;
  rows: [string, string][];        // label/value detail rows
}

// ---- deterministic QR-style PREVIEW (dependency-free, not yet scannable) ----
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FINDER = (r: number, c: number, N: number) =>
  (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);

// Dotted preview matching the real minted style: circular data modules, solid
// rounded finder "eyes", and a THIN white quiet-zone border (Q modules). Purely
// cosmetic (not scanned), so the thin border is fine here.
function QrPreview({ seed, size = 148 }: { seed: string; size?: number }) {
  const N = 21;            // QR-v1-style module grid
  const Q = 2;             // thin quiet zone (white border), in modules
  const total = N + Q * 2;
  const FG = '#1A1A2E', EYE = '#0F3460';
  const grid = useMemo(() => {
    const rand = mulberry32(hash32(seed));
    const g: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
    for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) if (!FINDER(r, c, N)) g[r][c] = rand() > 0.5;
    return g;
  }, [seed]);
  const u = size / total;  // px per module
  const p = Q * u;         // quiet-zone offset in px
  const eye = (cr: number, cc: number) => {
    const x = p + cc * u, y = p + cr * u;
    return (
      <g key={`f${cr}-${cc}`}>
        <rect x={x} y={y} width={7 * u} height={7 * u} rx={1.6 * u} fill={EYE} />
        <rect x={x + u} y={y + u} width={5 * u} height={5 * u} rx={1.1 * u} fill="#fff" />
        <rect x={x + 2 * u} y={y + 2 * u} width={3 * u} height={3 * u} rx={0.8 * u} fill={EYE} />
      </g>
    );
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: '#fff', borderRadius: 6 }}
      role="img" aria-label={`QR preview for ${seed}`}>
      {grid.map((row, r) => row.map((on, c) => (on && !FINDER(r, c, N)
        ? <circle key={`${r}-${c}`} cx={p + (c + 0.5) * u} cy={p + (r + 0.5) * u} r={u * 0.5} fill={FG} />
        : null)))}
      {eye(0, 0)}{eye(0, N - 7)}{eye(N - 7, 0)}
    </svg>
  );
}

// A little QR glyph shown on QR-bearing tree rows so the "every album/song has a
// code" arrangement reads at a glance.
function QrChip() {
  return (
    <span title="Has an individual QR code" aria-hidden="true" style={{
      display: 'inline-grid', gridTemplateColumns: 'repeat(3,3px)', gridAutoRows: 3, gap: 1, opacity: 0.7,
    }}>
      {[1, 0, 1, 0, 1, 0, 1, 0, 1].map((v, i) => (
        <span key={i} style={{ width: 3, height: 3, background: v ? 'var(--accent-gold)' : 'transparent' }} />
      ))}
    </span>
  );
}

const caret = (open: boolean) => (
  <span style={{ display: 'inline-block', width: 12, transition: 'transform .12s', transform: open ? 'rotate(90deg)' : 'none', color: 'var(--ink-muted)' }}>▸</span>
);

export default function RedirectorCatalog() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['music']));
  const [sel, setSel] = useState<Selection | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [tokensBySlug, setTokensBySlug] = useState<Map<string, string>>(new Map());
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await fetch('/music/catalog-manifest.json').then((r) => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json(); });
        let arts: Article[] = [];
        try {
          const a = await fetch('/articles/articles.json').then((r) => (r.ok ? r.json() : null));
          if (a) arts = Array.isArray(a) ? a : (a.articles || Object.values(a).find(Array.isArray) || []);
        } catch { /* articles are optional for the scaffold */ }
        if (!alive) return;
        setManifest(m); setArticles(arts);
        // Real minted album tokens (admin-authed). Non-fatal: if unauthorized or
        // the endpoint is unavailable, albums fall back to the preview placeholder.
        try {
          const at = await redirector.assetTokens(); // album + song tokens, keyed by slug
          if (alive) setTokensBySlug(new Map(at.tokens.map((t) => [t.slug, t.token])));
        } catch { /* not authed / no tokens — preview fallback */ }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const choose = (id: string, s: Selection) => { setSelId(id); setSel(s); };

  // ---- derived models ------------------------------------------------------
  const personas = useMemo(() => {
    if (!manifest) return [] as MfArtist[];
    const bySlug = new Map<string, MfArtist>();
    for (const c of manifest.categories || []) for (const a of c.artists || []) bySlug.set(a.slug, a);
    return INSPIRE_ORDER.map((slug) => bySlug.get(slug)).filter((a): a is MfArtist => !!a);
  }, [manifest]);

  const articleGroups = useMemo(() => {
    const byPersona = new Map<string, Article[]>();
    for (const a of articles) {
      const k = a.personaSlug || 'other';
      if (!byPersona.has(k)) byPersona.set(k, []);
      byPersona.get(k)!.push(a);
    }
    // Order the groups by the canonical persona order, then any leftovers.
    const order = INSPIRE_ORDER.map(avatarKey);
    const keys = [...byPersona.keys()].sort((x, y) => {
      const ix = order.indexOf(x); const iy = order.indexOf(y);
      return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
    });
    return keys.map((k) => ({ key: k, articles: byPersona.get(k)! }));
  }, [articles]);

  const totalAlbums = useMemo(() => personas.reduce((n, p) => n + (p.albums?.length || 0), 0), [personas]);

  // ---- row primitives ------------------------------------------------------
  const rowBase = (depth: number, active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
    padding: '5px 8px', paddingLeft: 8 + depth * 14, borderRadius: 6, cursor: 'pointer',
    border: 'none', background: active ? 'var(--bg)' : 'transparent',
    color: active ? 'var(--accent-gold)' : 'var(--ink-soft)', fontSize: 13, fontWeight: active ? 700 : 500,
  });

  function Branch({ id, depth, label, count, open }: { id: string; depth: number; label: React.ReactNode; count?: React.ReactNode; open: boolean }) {
    return (
      <button onClick={() => toggle(id)} style={rowBase(depth, false)}>
        {caret(open)}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {count !== undefined && <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{count}</span>}
      </button>
    );
  }
  function Leaf({ id, depth, label, sel: s, qr }: { id: string; depth: number; label: React.ReactNode; sel: Selection; qr?: boolean }) {
    return (
      <button onClick={() => choose(id, s)} style={{ ...rowBase(depth, selId === id), paddingLeft: 8 + depth * 14 + 12 }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {qr && <QrChip />}
      </button>
    );
  }

  const pane: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 10, padding: 12, background: 'var(--surface)', minWidth: 0 };

  if (loading) return <p className="notice">Loading catalog…</p>;
  if (error) return <p className="notice" style={{ color: '#c0392b' }}>Could not load catalog: {error}</p>;

  const musicOpen = expanded.has('music');
  const articlesOpen = expanded.has('articles');
  const booksOpen = expanded.has('books');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,380px) minmax(0,1fr)', gap: 14, alignItems: 'start' }}>
      {/* ---- left navigation ---- */}
      <div style={{ ...pane, maxHeight: '72vh', overflowY: 'auto' }}>
        {/* MUSIC */}
        <Branch id="music" depth={0} label={<strong>🎵 Music</strong>} count={`${personas.length} personas · ${totalAlbums} albums`} open={musicOpen} />
        {musicOpen && personas.map((p) => {
          const pid = `music:${p.slug}`;
          const pOpen = expanded.has(pid);
          const albums = p.albums || [];
          return (
            <div key={p.slug}>
              <Branch id={pid} depth={1} label={p.name} count={`${albums.length} album${albums.length === 1 ? '' : 's'}`} open={pOpen} />
              {pOpen && albums.map((al) => {
                const aid = `${pid}:${al.code}`;
                const aOpen = expanded.has(aid);
                const songs = al.tracks || [];
                return (
                  <div key={al.code}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Branch id={aid} depth={2} label={<span>{al.title} <QrChip /></span>} count={`${songs.length || al.trackCount || 0} songs`} open={aOpen} />
                      </div>
                      <button title="Select album" onClick={() => choose(aid, {
                        kind: 'album', title: al.title, token: tokensBySlug.get(al.code), qrSeed: `album:${al.code}`, cover: `/cover/${encodeURIComponent(al.code)}.png`,
                        rows: [['Persona', p.name], ['Album code', al.code], ['Songs', String(songs.length || al.trackCount || 0)], ['Asset kind', 'album']],
                      })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: selId === aid ? 'var(--accent-gold)' : (tokensBySlug.has(al.code) ? 'var(--success)' : 'var(--ink-muted)'), fontSize: 12, padding: '0 8px' }}>QR ▸</button>
                    </div>
                    {aOpen && songs.map((t) => {
                      const sid = `${aid}#${t.n}`;
                      return (
                        <Leaf key={sid} id={sid} depth={3} qr
                          label={<span><span style={{ color: 'var(--ink-muted)' }}>{t.n}.</span> {t.title}</span>}
                          sel={{
                            kind: 'song', title: t.title, token: tokensBySlug.get(`${al.code}#${t.n}`), qrSeed: `song:${al.code}#${t.n}`,
                            rows: [['Persona', p.name], ['Album', al.title], ['Album code', al.code], ['Track #', String(t.n)], ['Song ID', `${al.code}#${t.n}`], ['Asset kind', 'song']],
                          }} />
                      );
                    })}
                    {aOpen && songs.length === 0 && <p className="notice" style={{ paddingLeft: 8 + 3 * 14 }}>No song list in the manifest for this album.</p>}
                  </div>
                );
              })}
              {pOpen && albums.length === 0 && <p className="notice" style={{ paddingLeft: 8 + 2 * 14 }}>No albums.</p>}
            </div>
          );
        })}

        {/* ARTICLES */}
        <div style={{ marginTop: 4 }}>
          <Branch id="articles" depth={0} label={<strong>📄 Articles</strong>} count={`${articles.length}`} open={articlesOpen} />
          {articlesOpen && articleGroups.map((g) => {
            const gid = `articles:${g.key}`;
            const gOpen = expanded.has(gid);
            const label = g.articles[0]?.author || g.key;
            return (
              <div key={g.key}>
                <Branch id={gid} depth={1} label={label} count={`${g.articles.length}`} open={gOpen} />
                {gOpen && g.articles.map((ar) => {
                  const arid = `${gid}:${ar.slug}`;
                  return (
                    <Leaf key={arid} id={arid} depth={2} qr label={ar.title}
                      sel={{
                        kind: 'article', title: ar.title, qrSeed: `article:${ar.slug}`,
                        rows: [['Author', ar.author || '—'], ['Persona', ar.personaSlug || '—'], ['Related album', ar.album || '—'], ['Related song', ar.song || '—'], ['Slug', ar.slug], ['Asset kind', 'article']],
                      }} />
                  );
                })}
              </div>
            );
          })}
          {articlesOpen && articles.length === 0 && <p className="notice" style={{ paddingLeft: 8 + 14 }}>No articles loaded.</p>}
        </div>

        {/* BOOKS */}
        <div style={{ marginTop: 4 }}>
          <Branch id="books" depth={0} label={<strong>📚 Books</strong>} count="0" open={booksOpen} />
          {booksOpen && <p className="notice" style={{ paddingLeft: 8 + 14 }}>No books yet — this section is scaffolded and ready for a books data source.</p>}
        </div>
      </div>

      {/* ---- detail / QR ---- */}
      <div style={pane}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Asset & QR code</div>
        {!sel && <p className="notice">Select an album, song, or article on the left to see its individual QR code.</p>}
        {sel && (
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {sel.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sel.cover} alt="" width={88} height={88} style={{ borderRadius: 8, objectFit: 'cover', background: 'var(--bg)' }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{sel.title}</div>
                <div style={{ marginTop: 6, display: 'grid', gap: 2 }}>
                  {sel.rows.map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                      <span style={{ flex: '0 0 108px', color: 'var(--ink-muted)' }}>{k}</span>
                      <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {sel.token ? (
              <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/qr/${sel.token}.svg`} alt={`QR for ${sel.title}`} width={148} height={148} style={{ background: '#fff', borderRadius: 6, padding: 6 }} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'var(--success)', border: '1px solid var(--success)' }}>
                    MINTED · live token
                  </span>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, fontSize: 13 }}>
                    <span style={{ flex: '0 0 84px', color: 'var(--ink-muted)' }}>Token</span><code style={{ wordBreak: 'break-all' }}>{sel.token}</code>
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 13 }}>
                    <span style={{ flex: '0 0 84px', color: 'var(--ink-muted)' }}>Short URL</span>
                    <a href={`/r/${sel.token}`} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>{`${origin}/r/${sel.token}`}</a>
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                    <a href={`/qr/${sel.token}.svg`} download>SVG</a>
                    <a href={`/qr/${sel.token}.png?size=1024`} download>PNG</a>
                    <a href={`/qr/${sel.token}.png?variant=print&size=2048`} download>Print</a>
                    <button type="button" onClick={() => { if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(`${origin}/r/${sel.token}`); }}
                      style={{ cursor: 'pointer', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, color: 'var(--ink-soft)', padding: '3px 10px' }}>Copy link</button>
                  </div>
                </div>
              </div>
            ) : sel.qrSeed ? (
              <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <QrPreview seed={sel.qrSeed} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'var(--copper)', border: '1px solid var(--copper)' }}>
                    PREVIEW · not minted yet
                  </span>
                  <p className="notice" style={{ maxWidth: 320, marginTop: 8 }}>
                    A deterministic preview for this {sel.kind}. Album tokens are live; songs are
                    minted in a later pass.
                  </p>
                </div>
              </div>
            ) : (
              <p className="notice" style={{ marginTop: 12 }}>This node is a grouping level — expand it to reach QR-bearing assets.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
