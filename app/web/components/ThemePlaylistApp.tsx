'use client';
// ============================================================================
// Theme playlist page (client) — orchestrates the whole spec. Composes via
// /api/playlist, persists per-user preferences + rotation via /api/me (when
// signed in), feeds the shared global player, and hosts the session shapers,
// artist selector (§3), Backstage story overlay (§6), mood check-in (§9),
// declaration mode (§13), and send (§14.2).
//
// i18n: the catalog is English-first today; primary chrome uses useT() and the
// feature's micro-labels are English literals to be lifted into dictionaries as
// other languages are populated (see lib/i18n.ts tpl.* keys).
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer, type PlayerSong } from '@/stores/player';
import { useAuth } from '@/components/AuthProvider';
import { langName, LANGUAGES } from '@/lib/languages';
import ArtistSelector, { personaName } from '@/components/ArtistSelector';
import MoodCheckIn from '@/components/MoodCheckIn';
import BackstageOverlay from '@/components/BackstageOverlay';
import DeclarationMode from '@/components/DeclarationMode';
import SendModal from '@/components/SendModal';
import {
  composePlaylist, getPrefs, putPrefs, getRotation, recordServed, resetRotation,
  type Arc, type ComposeResponse, type Entry, type TrackEntry,
} from '@/lib/themePlaylist';

interface InitialTheme {
  name: string; statement: string; accent: string | null; heroImage: string | null;
  supportedArcs: Arc[]; defaultArc: Arc; targetTrackCount: number;
}
interface SharedSeed { personas?: string[] | null; language?: string | null; arc?: Arc | null; note?: string | null; senderName?: string | null }

const DURATIONS: { label: string; seconds: number | null }[] = [
  { label: '20 min', seconds: 20 * 60 }, { label: '35 min', seconds: 35 * 60 },
  { label: '60 min', seconds: 60 * 60 }, { label: '90 min', seconds: 90 * 60 },
  { label: 'Full playlist', seconds: null },
];
const ARC_LABEL: Record<Arc, string> = { steady: 'Steady', build: 'Build', worship_set: 'Worship set' };
const ARC_HELP: Record<Arc, string> = {
  steady: 'A consistent energy band for workouts, driving, background praise.',
  build: 'Starts lower and climbs, for warming up and getting ready to go.',
  worship_set: 'Four movements (gather, rise, crest, land) for personal or corporate worship.',
};
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtLong = (s: number) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`; };

function sessionSeed(): string {
  try {
    let s = sessionStorage.getItem('tpl_seed');
    if (!s) { s = Math.random().toString(36).slice(2); sessionStorage.setItem('tpl_seed', s); }
    return s;
  } catch { return 'anon'; }
}
function moodFreshToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function ThemePlaylistApp({ themeId, initial, shared }: { themeId: string; initial: InitialTheme; shared?: SharedSeed }) {
  const { authenticated, user } = useAuth() as { authenticated: boolean; user?: { id?: string } | null };
  const [data, setData] = useState<ComposeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Selections (session shapers + artist selector).
  const [lang, setLang] = useState<string | null>(shared?.language ?? null);
  const [personas, setPersonas] = useState<string[] | null>(shared?.personas ?? null);
  const [arc, setArc] = useState<Arc>(shared?.arc ?? initial.defaultArc);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [testimonyOn, setTestimonyOn] = useState(true);
  const [introsOn, setIntrosOn] = useState(false);
  const [mood, setMood] = useState<string | null>(null);

  const [served, setServed] = useState<string[]>([]);
  const [showMood, setShowMood] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [backstageSlug, setBackstageSlug] = useState<string | null>(null);
  const [declTrack, setDeclTrack] = useState<TrackEntry | null>(null);

  const seedRef = useRef<string>('anon');
  const readyRef = useRef(false); // preferences/rotation loaded → safe to persist + compose

  // ── initial load: preferences (§18.5) + rotation (§14.1), then first compose.
  useEffect(() => {
    seedRef.current = user?.id || sessionSeed();
    let cancelled = false;
    (async () => {
      if (authenticated && !shared) {
        try {
          const p = await getPrefs(themeId);
          if (!cancelled) {
            if (p.personas) setPersonas(p.personas);
            if (p.language) setLang(p.language);
            if (p.arc) setArc(p.arc);
            setDurationSeconds(p.durationSeconds ?? null);
            setTestimonyOn(p.testimonyOn);
            setIntrosOn(p.introsOn);
            setMood(p.mood ?? null);
            if (!moodFreshToday(p.moodAt)) setShowMood(true);
          }
        } catch { if (!cancelled) setShowMood(true); }
      } else {
        if (!cancelled) setShowMood(true);
      }
      readyRef.current = true;
      if (!cancelled) void recompose(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId, authenticated]);

  // ── rotation fetch when language settles (rotation is per playlist + language).
  useEffect(() => {
    if (!authenticated || !data?.lang) return;
    let cancelled = false;
    getRotation(themeId, data.lang).then((r) => { if (!cancelled) setServed(r.served || []); }).catch(() => {});
    return () => { cancelled = true; };
  }, [authenticated, themeId, data?.lang]);

  const composeNow = useCallback(async () => {
    const res = await composePlaylist({
      themeId, lang: lang ?? undefined, personas: personas ?? undefined, arc,
      durationSeconds, mood, testimonyOn, served, seed: seedRef.current,
    });
    setData(res);
    // Adopt server-resolved lang/personas/arc so the UI reflects what was used.
    if (lang === null) setLang(res.lang);
    if (personas === null) setPersonas(res.personas);
    // Rotation exhausted → reset the server cycle so the next session starts fresh.
    if (res.rotationReset && authenticated) { resetRotation(themeId, res.lang).catch(() => {}); setServed([]); }
    return res;
  }, [themeId, lang, personas, arc, durationSeconds, mood, testimonyOn, served, authenticated]);

  // ── debounced live re-shuffle on any change (§3.3 no reload) ────────────────
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recompose = useCallback((immediate = false) => {
    if (timer.current) clearTimeout(timer.current);
    const run = () => { setLoading(true); composeNow().finally(() => setLoading(false)); };
    if (immediate) run(); else timer.current = setTimeout(run, 260);
  }, [composeNow]);

  useEffect(() => {
    if (!readyRef.current) return;
    recompose(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, personas, arc, durationSeconds, mood, testimonyOn]);

  // ── persist preferences (signed-in only) ────────────────────────────────────
  useEffect(() => {
    if (!readyRef.current || !authenticated || shared) return;
    const h = setTimeout(() => {
      putPrefs(themeId, {
        personas: personas ?? undefined, language: lang ?? undefined, arc,
        durationSeconds, testimonyOn, introsOn, mood,
      }).catch(() => {});
    }, 500);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas, lang, arc, durationSeconds, testimonyOn, introsOn, mood, authenticated]);

  // ── playback ────────────────────────────────────────────────────────────────
  const toPlayerSongs = useCallback((entries: Entry[]): PlayerSong[] => entries.map((e) => e.type === 'track'
    ? { id: e.songId, songId: e.songId, title: e.title, artist: e.personaName, album: e.albumTitle, url: e.url, cover: e.cover, href: `/playlist/${themeId}` }
    : { id: e.id, title: `Testimony: ${e.title}`, artist: 'Testimony', url: e.url, cover: e.image || null, href: `/playlist/${themeId}` }), [themeId]);

  const playFrom = useCallback((index: number) => {
    if (!data) return;
    usePlayer.getState().playQueue(toPlayerSongs(data.entries), index);
    // §14.1: record the served tracks for this listener + language.
    if (authenticated) {
      const ids = data.entries.filter((e): e is TrackEntry => e.type === 'track').map((e) => e.songId);
      recordServed(themeId, data.lang, ids).then((r) => setServed((s) => [...new Set([...s, ...ids])])).catch(() => {});
    }
  }, [data, toPlayerSongs, authenticated, themeId]);

  const trackEntries = useMemo(() => (data?.entries || []).filter((e): e is TrackEntry => e.type === 'track'), [data]);
  const accent = data?.theme.accent || initial.accent || '#f5a623';

  // Language options limited to the theme's satisfiable pools (§7).
  const langOptions = data?.availableLanguages || [];

  return (
    <div className="tpl" style={{ '--tpl-accent': accent } as React.CSSProperties}>
      {/* 1 — Hero */}
      <section className="tpl-hero" style={initial.heroImage ? { backgroundImage: `url(${initial.heroImage})` } : undefined}>
        <div className="tpl-hero-inner">
          <p className="tpl-kicker">Playlist</p>
          <h1 className="tpl-title">{data?.theme.name || initial.name}</h1>
          <p className="tpl-statement">{data?.theme.statement || initial.statement}</p>
          {shared?.senderName && (
            <p className="tpl-shared-note">
              Shared by {shared.senderName}{shared.note ? <>: “{shared.note}”</> : null}
            </p>
          )}
          <p className="tpl-meta">
            {loading ? 'Building your mix…'
              : data ? <>{data.trackCount} tracks · {data.distinctAlbums} albums · {fmtLong(data.runtimeSeconds)}</> : null}
          </p>
        </div>
      </section>

      {/* 2 — Primary controls */}
      <div className="tpl-controls">
        <button type="button" className="tpl-btn tpl-btn-primary" disabled={!trackEntries.length} onClick={() => playFrom(0)}>▶ Play</button>
        <button type="button" className="tpl-btn" disabled={!trackEntries.length}
          onClick={() => { seedRef.current = Math.random().toString(36).slice(2); recompose(true); }}>⇄ Shuffle</button>
        {authenticated && <button type="button" className="tpl-btn" onClick={() => setShowSend(true)}>↗ Send</button>}
      </div>

      {data?.underfilled && (
        <p className="tpl-warn">This mix is shorter than a full set for the current filters. Add an artist or switch language for more.</p>
      )}
      {!loading && trackEntries.length > 0 && trackEntries.length < 30 && (
        <p className="tpl-warn">Only {trackEntries.length} tracks match right now. Add an artist back for a fuller set.</p>
      )}

      {/* 3 — Session shapers */}
      <div className="tpl-shapers">
        <div className="tpl-shaper">
          <span className="tpl-shaper-label">Language</span>
          <select className="tpl-select" value={data?.lang || 'en'} onChange={(e) => setLang(e.target.value)}>
            {langOptions.map((l) => <option key={l} value={l}>{langName(l) || (LANGUAGES.find((x) => x.code === l)?.name ?? l)}</option>)}
          </select>
        </div>
        <div className="tpl-shaper">
          <span className="tpl-shaper-label">Session length</span>
          <div className="tpl-segmented">
            {DURATIONS.map((d) => (
              <button key={d.label} type="button"
                className={`tpl-seg${durationSeconds === d.seconds ? ' is-on' : ''}`}
                onClick={() => setDurationSeconds(d.seconds)}>{d.label}</button>
            ))}
          </div>
        </div>
        <div className="tpl-shaper">
          <span className="tpl-shaper-label">Energy arc</span>
          <div className="tpl-segmented">
            {(data?.theme.supportedArcs || initial.supportedArcs).map((a) => (
              <button key={a} type="button" className={`tpl-seg${arc === a ? ' is-on' : ''}`} title={ARC_HELP[a]} onClick={() => setArc(a)}>
                {ARC_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="tpl-shaper tpl-toggles">
          <label className="tpl-toggle">
            <input type="checkbox" checked={testimonyOn} onChange={(e) => setTestimonyOn(e.target.checked)} /> Testimony interludes
          </label>
          <label className="tpl-toggle" title="Short in-voice intros from the artist (rolling out).">
            <input type="checkbox" checked={introsOn} onChange={(e) => setIntrosOn(e.target.checked)} /> Artist intros
          </label>
          <button type="button" className="tpl-chip" onClick={() => setShowMood(true)}>Mood check-in</button>
        </div>
      </div>

      {/* 4 — Artist selector */}
      {data && (
        <div className="tpl-section">
          <div className="tpl-livecount">{data.trackCount} tracks</div>
          <ArtistSelector personas={data.eligiblePersonas} selected={personas ?? data.personas} onChange={setPersonas} />
        </div>
      )}

      {/* 5 — Track list */}
      <ol className="tpl-tracks">
        {(data?.entries || []).map((e, i) => e.type === 'interlude' ? (
          <li key={`i-${e.id}`} className="tpl-row tpl-row-interlude">
            <span className="tpl-row-idx">✦</span>
            <span className="tpl-row-main">
              <span className="tpl-row-title">Testimony: {e.title}</span>
              <span className="tpl-row-sub">{e.category} · {fmt(e.durationSeconds)}</span>
            </span>
            <button type="button" className="tpl-row-play" onClick={() => playFrom(i)} aria-label="Play testimony">▶</button>
          </li>
        ) : (
          <li key={e.songId} className="tpl-row">
            <span className="tpl-row-idx">{trackEntries.indexOf(e) + 1}</span>
            {e.cover ? <span className="tpl-row-art" style={{ backgroundImage: `url(${e.cover})` }} /> : <span className="tpl-row-art" />}
            <span className="tpl-row-main">
              <span className="tpl-row-title">{e.title}</span>
              <span className="tpl-row-sub">{personaName(e.personaSlug)} · {e.albumTitle}</span>
            </span>
            <span className="tpl-row-dur">{fmt(e.dur)}</span>
            {e.backstage && (
              <button type="button" className="tpl-row-story" title="Backstage story" onClick={() => setBackstageSlug(e.backstage!.slug)}>Story</button>
            )}
            <button type="button" className="tpl-row-decl" title="Declaration mode" onClick={() => { setDeclTrack(e); playFrom(i); }}>Speak</button>
            <button type="button" className="tpl-row-play" onClick={() => playFrom(i)} aria-label={`Play ${e.title}`}>▶</button>
          </li>
        ))}
      </ol>

      {/* Overlays */}
      {showMood && (
        <MoodCheckIn
          onPick={(m) => { setMood(m); setShowMood(false); }}
          onDismiss={() => setShowMood(false)}
        />
      )}
      {backstageSlug && <BackstageOverlay slug={backstageSlug} onClose={() => setBackstageSlug(null)} />}
      {declTrack && <DeclarationMode track={declTrack} onClose={() => setDeclTrack(null)} />}
      {showSend && data && (
        <SendModal themeId={themeId} language={data.lang} personas={personas ?? data.personas} arc={arc} onClose={() => setShowSend(false)} />
      )}
    </div>
  );
}
