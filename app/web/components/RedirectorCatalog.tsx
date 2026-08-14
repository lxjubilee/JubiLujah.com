'use client';
// ============================================================================
// Redirector "Browse codes" — a visual master-detail drill-down.
//
//   Left rail:  Music · Articles · Books
//   Right col:  Music → persona cards (photo + name) → album cards (cover) →
//               album detail (album QR + a grid of song QR codes).
//               Articles → persona cards → that persona's articles (QR preview).
//
// Real minted tokens render the live dotted QR (/qr/<token>.svg); anything not
// minted (articles) falls back to a deterministic dotted preview.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { INSPIRE_ORDER, avatarKey, personaCardImage } from '@/lib/personas';
import { redirector } from '@/lib/redirector';

interface MfTrack { n: number; title: string; url?: string }
interface MfAlbum { code: string; title: string; trackCount?: number; tracks?: MfTrack[] }
interface MfArtist { slug: string; name: string; role?: string; albums?: MfAlbum[] }
interface MfCategory { key: string; label: string; artists?: MfArtist[] }
interface Manifest { categories?: MfCategory[] }
interface Article { slug: string; title: string; author?: string; personaSlug?: string; album?: string; song?: string }

// ---- deterministic dotted QR PREVIEW (for not-yet-minted assets) ------------
function hash32(s: string): number { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(seed: number): () => number { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FINDER = (r: number, c: number, N: number) => (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
function QrPreview({ seed, size = 132 }: { seed: string; size?: number }) {
  const N = 21, Q = 2, total = N + Q * 2, FG = '#1A1A2E', EYE = '#0F3460';
  const grid = useMemo(() => { const rand = mulberry32(hash32(seed)); const g: boolean[][] = Array.from({ length: N }, () => Array<boolean>(N).fill(false)); for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) if (!FINDER(r, c, N)) g[r][c] = rand() > 0.5; return g; }, [seed]);
  const u = size / total, p = Q * u;
  const eye = (cr: number, cc: number) => { const x = p + cc * u, y = p + cr * u; return (<g key={`f${cr}-${cc}`}><rect x={x} y={y} width={7 * u} height={7 * u} rx={1.6 * u} fill={EYE} /><rect x={x + u} y={y + u} width={5 * u} height={5 * u} rx={1.1 * u} fill="#fff" /><rect x={x + 2 * u} y={y + 2 * u} width={3 * u} height={3 * u} rx={0.8 * u} fill={EYE} /></g>); };
  return (<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ background: '#fff', borderRadius: 8 }} role="img" aria-label="QR preview">{grid.map((row, r) => row.map((on, c) => (on && !FINDER(r, c, N) ? <circle key={`${r}-${c}`} cx={p + (c + 0.5) * u} cy={p + (r + 0.5) * u} r={u * 0.5} fill={FG} /> : null)))}{eye(0, 0)}{eye(0, N - 7)}{eye(N - 7, 0)}</svg>);
}

function initials(s: string) { const w = (s || '?').replace(/[^a-zA-Z ]/g, ' ').trim().split(/\s+/); return ((w[0]?.[0] || '?') + (w[1]?.[0] || '')).toUpperCase(); }
function FallbackImg({ src, seed, circle, size }: { src: string | null; seed: string; circle?: boolean; size?: number }) {
  const [broken, setBroken] = useState(false);
  const radius = circle ? '50%' : 10;
  const dim = size ? { width: size, height: size } : { width: '100%', aspectRatio: '1' as const };
  if (!src || broken) {
    let h = 0; for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return <div style={{ ...dim, borderRadius: radius, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20, background: `linear-gradient(135deg, hsl(${h} 45% 34%), hsl(${(h + 40) % 360} 55% 46%))` }}>{initials(seed)}</div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} style={{ ...dim, borderRadius: radius, objectFit: 'cover', display: 'block' }} />;
}

const panel: React.CSSProperties = { border: '1px solid var(--line)', borderRadius: 14, padding: 16, background: 'var(--surface)', minWidth: 0 };
const searchInput: React.CSSProperties = { background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', color: 'var(--ink)', fontSize: 13, outline: 'none', minWidth: 200, fontFamily: 'inherit' };

export default function RedirectorCatalog() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [tokens, setTokens] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<'music' | 'articles' | 'books'>('music');
  const [personaSlug, setPersonaSlug] = useState<string | null>(null);
  const [albumCode, setAlbumCode] = useState<string | null>(null);
  const [albumQuery, setAlbumQuery] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await fetch('/music/catalog-manifest.json').then((r) => { if (!r.ok) throw new Error(`manifest ${r.status}`); return r.json(); });
        let arts: Article[] = [];
        try { const a = await fetch('/articles/articles.json').then((r) => (r.ok ? r.json() : null)); if (a) arts = Array.isArray(a) ? a : (a.articles || Object.values(a).find(Array.isArray) || []); } catch { /* optional */ }
        if (!alive) return;
        setManifest(m); setArticles(arts);
        try { const at = await redirector.assetTokens(); if (alive) setTokens(new Map(at.tokens.map((t) => [t.slug, t.token]))); } catch { /* preview fallback */ }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const personas = useMemo(() => {
    if (!manifest) return [] as MfArtist[];
    const bySlug = new Map<string, MfArtist>();
    for (const c of manifest.categories || []) for (const a of c.artists || []) bySlug.set(a.slug, a);
    return INSPIRE_ORDER.map((slug) => bySlug.get(slug)).filter((a): a is MfArtist => !!a);
  }, [manifest]);
  const articleCount = useMemo(() => { const m = new Map<string, number>(); for (const a of articles) { const k = a.personaSlug || 'other'; m.set(k, (m.get(k) || 0) + 1); } return m; }, [articles]);

  const persona = personaSlug ? personas.find((p) => p.slug === personaSlug) || null : null;
  const album = persona && albumCode ? (persona.albums || []).find((a) => a.code === albumCode) || null : null;

  const goSection = (s: 'music' | 'articles' | 'books') => { setSection(s); setPersonaSlug(null); setAlbumCode(null); setAlbumQuery(''); };
  const albumToken = (code: string) => tokens.get(code);
  const songToken = (code: string, n: number) => tokens.get(`${code}#${n}`);

  // ---- reusable bits -------------------------------------------------------
  const crumb = (label: string, onClick?: () => void, last = false) => (
    <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {onClick ? <button className="rc-link" onClick={onClick}>{label}</button> : <span style={{ color: last ? 'var(--ink)' : 'var(--ink-soft)', fontWeight: last ? 700 : 500 }}>{label}</span>}
    </span>
  );
  const Crumbs = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, marginBottom: 16 }}>
      {crumb(section === 'music' ? 'Music' : section === 'articles' ? 'Articles' : 'Books', persona ? () => { setPersonaSlug(null); setAlbumCode(null); } : undefined, !persona)}
      {persona && <span style={{ color: 'var(--ink-muted)' }}>›</span>}
      {persona && crumb(persona.name, album ? () => setAlbumCode(null) : undefined, !album)}
      {album && <span style={{ color: 'var(--ink-muted)' }}>›</span>}
      {album && crumb(album.title, undefined, true)}
    </div>
  );

  const nav: [typeof section, string, string, string][] = [
    ['music', '🎵', 'Music', `${personas.length} personas`],
    ['articles', '📄', 'Articles', `${articles.length} articles`],
    ['books', '📚', 'Books', 'coming soon'],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px,210px) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <style>{`
        .rc-card{background:var(--bg);border:1px solid var(--line);border-radius:12px;cursor:pointer;transition:border-color .15s,transform .15s,background .15s;text-align:center}
        .rc-card:hover{border-color:var(--accent-gold);transform:translateY(-2px)}
        .rc-nav{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;border:none;background:transparent;border-radius:10px;padding:12px 12px;cursor:pointer;color:var(--ink-soft);transition:background .15s,color .15s}
        .rc-nav:hover{background:var(--bg)}
        .rc-nav.on{background:var(--bg);color:var(--ink);box-shadow:inset 3px 0 0 var(--accent-gold)}
        .rc-link{border:none;background:transparent;color:var(--accent-gold);cursor:pointer;font-size:13px;font-weight:600;padding:0}
        .rc-link:hover{text-decoration:underline}
        .rc-dl{color:var(--accent-gold);text-decoration:none;font-size:12px}.rc-dl:hover{text-decoration:underline}
      `}</style>

      {/* Left rail */}
      <div style={{ ...panel, padding: 8 }}>
        {nav.map(([key, icon, label, sub]) => (
          <button key={key} className={`rc-nav${section === key ? ' on' : ''}`} onClick={() => goSection(key)}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{icon} {label}</span>
            <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{sub}</span>
          </button>
        ))}
      </div>

      {/* Right column */}
      <div style={panel}>
        {loading ? <p className="notice">Loading catalog…</p>
          : error ? <p className="notice" style={{ color: '#c0392b' }}>Could not load: {error}</p>
            : (
              <>
                <Crumbs />

                {/* BOOKS */}
                {section === 'books' && <p className="notice">No books yet — this section is scaffolded and ready for a books source.</p>}

                {/* PERSONA GRID (music or articles) */}
                {section !== 'books' && !persona && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 14 }}>
                    {personas.map((p) => {
                      const count = section === 'music' ? (p.albums?.length || 0) : (articleCount.get(avatarKey(p.slug)) || 0);
                      return (
                        <div key={p.slug} className="rc-card" style={{ padding: 14 }} onClick={() => { setPersonaSlug(p.slug); setAlbumCode(null); setAlbumQuery(''); }}>
                          <div style={{ width: 76, height: 76, margin: '0 auto 10px' }}><FallbackImg src={personaCardImage(p.slug)} seed={p.name} circle size={76} /></div>
                          <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink)' }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 2 }}>{count} {section === 'music' ? 'albums' : 'articles'}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ALBUM GRID (with search) */}
                {section === 'music' && persona && !album && (() => {
                  const all = persona.albums || [];
                  const q = albumQuery.trim().toLowerCase();
                  const filtered = q ? all.filter((a) => a.title.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) : all;
                  return (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                          {q ? `${filtered.length} of ${all.length}` : `${all.length}`} album{all.length === 1 ? '' : 's'}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <input value={albumQuery} onChange={(e) => setAlbumQuery(e.target.value)} placeholder="Search albums…"
                            aria-label="Search albums" style={{ ...searchInput, paddingRight: albumQuery ? 30 : 12 }} />
                          {albumQuery && (
                            <button onClick={() => setAlbumQuery('')} aria-label="Clear search"
                              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--ink-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      </div>
                      {all.length === 0 ? <p className="notice">No albums.</p>
                        : filtered.length === 0 ? <p className="notice">No albums match “{albumQuery}”.</p>
                          : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
                              {filtered.map((al) => {
                                const songs = al.tracks?.length || al.trackCount || 0;
                                const minted = !!albumToken(al.code);
                                return (
                                  <div key={al.code} className="rc-card" style={{ padding: 10, textAlign: 'left' }} onClick={() => setAlbumCode(al.code)}>
                                    <div style={{ position: 'relative', marginBottom: 8 }}>
                                      <FallbackImg src={`/cover/${encodeURIComponent(al.code)}.png`} seed={al.title} />
                                      <span style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: '50%', background: minted ? 'var(--success)' : 'var(--ink-muted)', boxShadow: '0 0 0 2px rgba(0,0,0,.35)' }} title={minted ? 'QR minted' : 'not minted'} />
                                    </div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{al.title}</div>
                                    <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{songs} songs</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                    </div>
                  );
                })()}

                {/* ALBUM DETAIL — album QR + songs grid */}
                {section === 'music' && persona && album && (() => {
                  const aTok = albumToken(album.code);
                  const songs = album.tracks || [];
                  return (
                    <div>
                      {/* Album header */}
                      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', paddingBottom: 18, borderBottom: '1px solid var(--line)' }}>
                        <div style={{ width: 120, flex: '0 0 auto' }}><FallbackImg src={`/cover/${encodeURIComponent(album.code)}.png`} seed={album.title} /></div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-muted)' }}>{persona.name} · album</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '2px 0 6px' }}>{album.title}</div>
                          <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Code <code>{album.code}</code> · {songs.length || album.trackCount || 0} songs</div>
                        </div>
                        <div style={{ flex: '0 0 auto', textAlign: 'center' }}>
                          {aTok ? <img src={`/qr/${aTok}.svg?qz=2`} alt="Album QR" width={132} height={132} style={{ background: '#fff', borderRadius: 10, padding: 0 }} /> : <QrPreview seed={`album:${album.code}`} />}
                          <div style={{ marginTop: 8 }}>
                            {aTok ? (
                              <>
                                <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: 'var(--success)', border: '1px solid var(--success)' }}>MINTED</span>
                                <div style={{ marginTop: 6, display: 'flex', gap: 10, justifyContent: 'center', fontSize: 12 }}>
                                  <a className="rc-dl" href={`/qr/${aTok}.svg`} download>SVG</a>
                                  <a className="rc-dl" href={`/qr/${aTok}.png?size=1024`} download>PNG</a>
                                  <a className="rc-dl" href={`/r/${aTok}`} target="_blank" rel="noreferrer">Open</a>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--ink-muted)', marginTop: 6, wordBreak: 'break-all', maxWidth: 150 }}>{origin}/r/{aTok}</div>
                              </>
                            ) : <span style={{ fontSize: 11, color: 'var(--copper)' }}>preview · not minted</span>}
                          </div>
                        </div>
                      </div>

                      {/* Songs */}
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-muted)', margin: '18px 0 12px' }}>Songs · scan to play</div>
                      {songs.length === 0 ? <p className="notice">No song list for this album.</p> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
                          {songs.map((t) => {
                            const sTok = songToken(album.code, t.n);
                            return (
                              <div key={t.n} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                                {sTok ? <img src={`/qr/${sTok}.svg?qz=2`} alt="" width={104} height={104} style={{ background: '#fff', borderRadius: 8, padding: 0, width: '100%', height: 'auto', maxWidth: 120 }} /> : <QrPreview seed={`song:${album.code}#${t.n}`} size={104} />}
                                <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ color: 'var(--ink-muted)' }}>{t.n}.</span> {t.title}</div>
                                {sTok
                                  ? <div style={{ marginTop: 4, display: 'flex', gap: 10, justifyContent: 'center', fontSize: 11 }}><a className="rc-dl" href={`/qr/${sTok}.svg`} download>SVG</a><a className="rc-dl" href={`/r/${sTok}`} target="_blank" rel="noreferrer">Open</a></div>
                                  : <div style={{ fontSize: 10, color: 'var(--copper)', marginTop: 4 }}>not minted</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ARTICLES — persona's articles as preview cards */}
                {section === 'articles' && persona && (() => {
                  const list = articles.filter((a) => (a.personaSlug || 'other') === avatarKey(persona.slug));
                  return list.length === 0 ? <p className="notice">No articles for {persona.name}.</p> : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14 }}>
                      {list.map((a) => {
                        const tok = tokens.get(a.slug);
                        return (
                        <div key={a.slug} style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, textAlign: 'center' }}>
                          {tok ? <img src={`/qr/${tok}.svg?qz=2`} alt="Article QR" width={104} height={104} style={{ background: '#fff', borderRadius: 8, padding: 0, width: '100%', height: 'auto', maxWidth: 120 }} /> : <QrPreview seed={`article:${a.slug}`} size={104} />}
                          <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--ink)', marginTop: 8, lineHeight: 1.3 }}>{a.title}</div>
                          {tok
                            ? <div style={{ marginTop: 4, display: 'flex', gap: 10, justifyContent: 'center', fontSize: 11 }}><a className="rc-dl" href={`/qr/${tok}.svg`} download>SVG</a><a className="rc-dl" href={`/qr/${tok}.png?size=1024`} download>PNG</a><a className="rc-dl" href={`/r/${tok}`} target="_blank" rel="noreferrer">Open</a></div>
                            : <div style={{ fontSize: 10, color: 'var(--copper)', marginTop: 4 }}>preview · not minted</div>}
                        </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            )}
      </div>
    </div>
  );
}
