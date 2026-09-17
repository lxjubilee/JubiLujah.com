'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlayer, PlayerSong } from '@/stores/player';
import { api } from '@/lib/api';
import type { HeroSlide } from '@/lib/heroes';
import HeroQr from './HeroQr';
import { heroKey, useHeroPositions } from '@/stores/heroPositions';

// ============================================================================
// THE HOME HERO — a few album banners, cross-fading, over the content rows.
//
// Ported from kJubilee.com's station carousel (public/css/pages/home.css and
// public/js/pages/home.js there). The same anatomy, and deliberately so — the
// two properties are siblings and a visitor who knows one should recognise the
// other:
//
//   the picture, full bleed          a hero image, not a cover: 16:9, no lettering
//   a 180° scrim at the bottom       the picture falls away into the page's black
//   the artist, huge and faint       kJubilee prints the STATION FREQUENCY here
//   the title, one line              there: the station name; here: the album
//   one sentence                     there: the station blurb; here: the album's
//   a transport button               there: tune in; here: play the album
//
// 🔴 WHAT IS DIFFERENT, AND WHY. kJubilee's ident is a frequency because a radio
// station IS its frequency. An album has no such number, so the same treatment
// carries the ARTIST — the name the picture is selling, at the size that makes
// it part of the artwork rather than a label pasted over it.
//
// 🔴 THE WHOLE BANNER IS A LINK TO THE ALBUM, and the controls sit on top of it.
// A visitor who clicks the picture means "show me this record"; one who clicks
// the button means "play it, and leave me where I am". Both readings are right,
// which is why the button is not inside the link — a <button> nested in an <a>
// is invalid HTML and browsers resolve it by following the link anyway, so the
// play button would have navigated away instead of playing.
// ============================================================================

const PLAY = 'M8 5.5v13l11-6.5-11-6.5z';
const PAUSE = 'M6 5h4v14H6zm8 0h4v14h-4z';
const CHEVRON_LEFT = 'm15 6-6 6 6 6';
const CHEVRON_RIGHT = 'm9 6 6 6-6 6';

/** How long a slide holds before the next one fades in. */
const DWELL_MS = 9000;

export default function HomeHero({ slides }: { slides: HeroSlide[] }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>();

  // The player is the source of truth for what the button says. Pausing from
  // the footer bar, or another album taking the bar over, both have to change
  // this button — so it follows the store rather than remembering its own idea
  // of what it started. (kJubilee does the same thing through its
  // `kj-player-state` event; here the store is already shared.)
  const nowHref = usePlayer((s) => s.nowPlaying?.href);
  const isPlaying = usePlayer((s) => s.isPlaying);

  // Admin-set framing for each picture (0 = top, the default).
  const positions = useHeroPositions((s) => s.map);
  useEffect(() => { useHeroPositions.getState().ensureLoaded(); }, []);

  const count = slides.length;
  const slide = slides[Math.min(i, count - 1)];
  // This slide's album is the one on the bar, playing or paused.
  const loaded = !!slide && nowHref === slide.href;
  const sounding = loaded && isPlaying;

  const go = useCallback((next: number) => {
    setI(((next % count) + count) % count);
  }, [count]);

  // 🔴 AN ALBUM STARTED FROM THE BANNER HOLDS THE BANNER. Found in production
  // 2026-09-16: press Play Album, and nine seconds later the carousel turned to a
  // different album whose button said "Play Album" — nothing on screen could pause
  // the record that was playing, and on a phone (no hover) it always turned.
  // While one of these albums is on the bar the carousel stays on it, and comes
  // back to it if the visitor had moved on.
  const heroIndexOnBar = slides.findIndex((s) => s.href === nowHref);
  useEffect(() => {
    if (heroIndexOnBar >= 0 && isPlaying) setI(heroIndexOnBar);
  }, [heroIndexOnBar, isPlaying]);

  // Auto-advance, restarted by any manual move so a slide the visitor just
  // chose gets its full dwell rather than the remainder of the previous one.
  // Held still for anyone who has asked for less motion, while the pointer is
  // over the banner (a sentence that slides out from under the reader mid-read is
  // the one thing a carousel must not do), and while one of its albums is loaded.
  const [hovering, setHovering] = useState(false);
  useEffect(() => {
    if (count < 2 || hovering || heroIndexOnBar >= 0) return;
    if (typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    timer.current = setInterval(() => setI((n) => (n + 1) % count), DWELL_MS);
    return () => clearInterval(timer.current);
  }, [count, hovering, i, heroIndexOnBar]);

  /**
   * Play this album on the footer bar, without leaving the page.
   *
   * The same three steps HoverTile's play button takes: ask the API for the
   * album's tracks, keep the ones with audio, hand them to the player as a
   * queue. The album page is NOT loaded to do it — that would be a navigation,
   * which is the thing this button exists to avoid.
   */
  const onPlay = async () => {
    if (!slide) return;
    // Already the album on the bar: this is a transport control, so it pauses
    // and resumes rather than restarting the record from track one.
    if (sounding) { usePlayer.getState().pause(); return; }
    if (loaded && usePlayer.getState().nowPlaying) { usePlayer.getState().resume(); return; }

    setBusy(true);
    try {
      const album = await api.get<{ tracks: { id: string; title: string; url: string | null }[] }>(
        `/api/albums/${slide.code}`);
      const songs: PlayerSong[] = album.tracks
        .filter((t) => t.url)
        .map((t) => ({
          id: t.id, songId: t.id, title: t.title,
          artist: slide.artistName, album: slide.title,
          // The SQUARE cover, not the banner: this is what the footer bar shows
          // beside the track, and every other surface that queues a song puts
          // the album's cover there.
          url: t.url, cover: slide.cover, href: slide.href,
        }));
      if (songs.length) usePlayer.getState().playQueue(songs, 0);
    } catch {
      /* No audio available — the banner stays where it is rather than throwing
         the visitor somewhere to explain a failure they did not cause. */
    } finally {
      setBusy(false);
    }
  };

  if (!slide) return null;

  return (
    <section
      className="jp-hero"
      aria-roledescription="carousel"
      aria-label="Featured albums"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Every picture is in the markup from the first paint and they trade
          opacity, which is what makes the change a dissolve rather than a
          swap.
          (Superseded in part 2026-09-16: with twelve slides only the live, previous
          and next pictures are in the markup; see below. Those still load eagerly,
          for the reasons that follow.)
          🔴 ALL THREE LOAD EAGERLY. The first one has to: it is the largest
          thing above the fold, so lazy-loading it would hand the page its own
          LCP as a late repaint. The other two have to for a worse reason — a
          lazy picture is fetched when it nears the viewport, but these are
          ALREADY in it and merely transparent, so a browser can leave them
          unfetched until the carousel turns. Seen in a headless capture: slide
          two came up as a black rectangle with the words still on it. Three
          pictures at ~200 KB is a cheap way to make that impossible. */}
      {slides.map((s, n) => {
        // TWELVE SLIDES NOW (one per family member), so not all twelve pictures
        // load up front: the live one, the one before it (still fading out) and
        // the next one (fetched ahead so it is ready when the carousel turns).
        const near = n === i || n === (i + 1) % count || n === (i - 1 + count) % count;
        if (!near) return null;
        return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={s.code}
          className={`jp-hero-art${n === i ? ' is-live' : ''}`}
          src={s.image}
          alt=""
          aria-hidden="true"
          decoding="async"
          loading="eager"
          style={positions[heroKey(s.code)] != null ? { objectPosition: `center ${positions[heroKey(s.code)]}%` } : undefined}
        />
        );
      })}

      <div className="jp-hero-scrim" aria-hidden="true" />

      {/* The picture itself, as a link. Underneath the words and the controls
          (z-index), so it takes only the clicks nothing else wanted. */}
      <Link className="jp-hero-hit" href={slide.href} aria-label={`${slide.title} by ${slide.artistName}`} />

      {/* The artist, huge and faint, low in the corner — kJubilee's frequency
          treatment. aria-hidden: it is the artwork's own lettering, and the
          name is already read out by the title link and the button. */}
      <span className="jp-hero-ident" aria-hidden="true">{slide.artistName}</span>

      {/* The scan-to-listen code, top right; clicking it plays the album (never
          pauses it: it is a Play, not a transport toggle). Admin arrows below. */}
      {/* Clicking the code opens its share row (owner, 2026-09-17); it no longer
          plays — Play Album, one line down, does that. */}
      <HeroQr code={slide.code} title={slide.title} />

      <div className="jp-hero-content" key={slide.code}>
        <h2 className="jp-hero-title">
          <Link href={slide.href}>{slide.title}</Link>
        </h2>
        <p className="jp-hero-blurb" title={slide.blurb}>{slide.blurb}</p>
        <div className="jp-hero-actions">
          <button
            type="button"
            className="jp-hero-play"
            onClick={onPlay}
            disabled={busy}
            aria-pressed={sounding}
            title={`${sounding ? 'Pause' : loaded ? 'Resume' : 'Play'} ${slide.title}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d={sounding ? PAUSE : PLAY} />
            </svg>
            {/* Says what pressing it WILL do, following the player: a paused album
                reads Resume, not Play Album, which would start it over. */}
            <span>{sounding ? 'Pause' : busy ? 'Starting…' : loaded ? 'Resume' : 'Play Album'}</span>
          </button>
          <Link className="jp-hero-more" href={slide.href}>View Album</Link>
        </div>
      </div>

      {count > 1 && (
        <>
          <button type="button" className="jp-hero-arrow prev" onClick={() => go(i - 1)} aria-label="Previous album">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d={CHEVRON_LEFT} /></svg>
          </button>
          <button type="button" className="jp-hero-arrow next" onClick={() => go(i + 1)} aria-label="Next album">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d={CHEVRON_RIGHT} /></svg>
          </button>
          <div className="jp-hero-dots">
            {slides.map((s, n) => (
              <button
                key={s.code}
                type="button"
                className={`jp-hero-dot${n === i ? ' is-live' : ''}`}
                onClick={() => go(n)}
                aria-label={s.title}
                aria-current={n === i}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
