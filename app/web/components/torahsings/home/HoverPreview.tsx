'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAudioActions } from '@/components/torahsings/audio/AudioProvider';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { albumPlayables, artUrl, hasAudio, type CatalogAlbum } from '@/lib/torahsings/angels';
import { showAuthGate } from '@/lib/torahsings/auth-gate';
import { albumUuid, songUuid } from '@/lib/ids';
import { AddToPlaylist } from '@/components/torahsings/album/AddToPlaylist';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import { ensureLikesLoaded, likeKey, resetLikes, toggleLikeStored, useLikedSet } from '@/lib/torahsings/likes';
import styles from './CatalogHoverPreview.module.css';

/**
 * The JubileePraise "nf-preview" hover popup. A single portal, shared by every
 * catalog tile: hovering a tile opens an enlarged card (art + action row + meta)
 * positioned over the tile; it pops in, stays while the pointer is over either
 * the tile or the popup, and closes on leave / scroll.
 */

interface HoverPreviewApi {
  show: (album: CatalogAlbum, el: HTMLElement) => void;
  hide: () => void;
}

const HoverPreviewContext = createContext<HoverPreviewApi | null>(null);

/** Tiles call this to drive the shared popup. Null when no provider is mounted. */
export function useHoverPreview(): HoverPreviewApi | null {
  return useContext(HoverPreviewContext);
}

interface Active {
  album: CatalogAlbum;
  rect: DOMRect;
}

/** Exact Material-icon paths jubileepraise's nf-preview uses (24×24 viewBox). */
const ICON = {
  play: 'M8 5v14l11-7z',
  add: 'M2 14h8v-2H2v2zm0-4h12V8H2v2zm0-6v2h12V4H2zm14 6v3h-3v2h3v3h2v-3h3v-2h-3v-3h-2z',
  thumb:
    'M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  chevron: 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
} as const;

/** jubileepraise's "M" icon wrapper: a 20×20 fill icon on a 24-unit grid. */
function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ENTER_DELAY = 160; // ms before the popup opens — avoids flicker on fast passes
const LEAVE_DELAY = 130; // ms grace so moving tile -> popup doesn't close it

export function HoverPreviewProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Active | null>(null);
  const [mounted, setMounted] = useState(false);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
  const overPopup = useRef(false);

  useEffect(() => setMounted(true), []);

  const show = useCallback((album: CatalogAlbum, el: HTMLElement) => {
    if (leaveTimer.current) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    // No hover popup on touch devices — they have no hover intent.
    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) return;
    if (enterTimer.current) window.clearTimeout(enterTimer.current);
    enterTimer.current = window.setTimeout(() => {
      setActive({ album, rect: el.getBoundingClientRect() });
    }, ENTER_DELAY);
  }, []);

  const hide = useCallback(() => {
    if (enterTimer.current) {
      window.clearTimeout(enterTimer.current);
      enterTimer.current = null;
    }
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      if (!overPopup.current) setActive(null);
    }, LEAVE_DELAY);
  }, []);

  // A fixed-position popup goes stale the moment the page scrolls or resizes.
  useEffect(() => {
    if (!active) return;
    const close = () => {
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      overPopup.current = false;
      setActive(null);
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [active]);

  const api = useMemo<HoverPreviewApi>(() => ({ show, hide }), [show, hide]);

  return (
    <HoverPreviewContext.Provider value={api}>
      {children}
      {mounted &&
        active &&
        createPortal(
          <PreviewCard
            active={active}
            onEnter={() => {
              overPopup.current = true;
              if (leaveTimer.current) {
                window.clearTimeout(leaveTimer.current);
                leaveTimer.current = null;
              }
            }}
            onLeave={() => {
              overPopup.current = false;
              setActive(null);
            }}
          />,
          document.body,
        )}
    </HoverPreviewContext.Provider>
  );
}

function PreviewCard({
  active,
  onEnter,
  onLeave,
}: {
  active: Active;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { album, rect } = active;
  const { startAlbum } = useAudioActions();
  const { session } = useJubileeAccount();
  // True while the add-to-playlist menu is open — see onMouseLeave below.
  const [menuOpen, setMenuOpen] = useState(false);

  // Hovering a different tile swaps the album in place. Drop the hold too,
  // otherwise the card stays pinned open after its menu was remounted shut.
  useEffect(() => {
    setMenuOpen(false);
  }, [album.code]);
  const playable = hasAudio(album);

  // Account-backed like, from the shared store so it stays in sync with the
  // album-detail heart and the Liked page.
  const likedSet = useLikedSet();
  const albumId = albumUuid(album.code);
  const liked = likedSet.has(likeKey('album', albumId));

  useEffect(() => {
    if (session) ensureLikesLoaded();
    else resetLikes();
  }, [session]);

  // Guests get the global sign-in gate (which outlives this card's unmount).
  const onLike = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!session) {
      showAuthGate();
      return;
    }
    void toggleLikeStored('album', albumId);
  };

  // Grow the card beyond the tile and centre it on the tile, clamped to the
  // viewport. Sizing matches JubileePraise's nf-preview exactly: 1.55× the tile
  // width (min 300px, uncapped), with the height ≈ width + 150 (square cover +
  // info panel).
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.max(Math.round(rect.width * 1.55), 300);
  const estHeight = width + 150; // square cover + info panel
  const left = clamp(rect.left + rect.width / 2 - width / 2, 10, vw - width - 10);
  const top = clamp(rect.top + rect.height / 2 - estHeight / 2, 10, vh - estHeight - 10);

  const play = () => {
    if (playable) startAlbum(albumPlayables(album));
  };

  return (
    <div
      className={styles.preview}
      style={{ left, top, width }}
      onMouseEnter={onEnter}
      // The add-to-playlist menu opens BELOW the card, so moving the mouse to it
      // leaves the card's bounds. Hold the card open while that menu is up,
      // otherwise the card unmounts and takes the menu with it.
      onMouseLeave={() => {
        if (!menuOpen) onLeave();
      }}
      role="dialog"
      aria-label={album.title}
    >
      <Link href={`/album/${album.code}`} className={styles.cover} aria-label={`Open ${album.title}`}>
        {album.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artUrl(album.art)} alt="" loading="lazy" decoding="async" />
        ) : (
          <CelestialArt
            seed={album.code}
            hue={album.hue}
            topic={album.book}
            glyph={album.glyph}
            ratio="1 / 1"
          />
        )}
        <span className={styles.coverGrad} aria-hidden="true" />
      </Link>

      <div className={styles.body}>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.act} ${styles.play}`}
            onClick={play}
            disabled={!playable}
            aria-label={playable ? `Play ${album.title}` : `${album.title} — audio coming soon`}
          >
            <Icon d={ICON.play} />
          </button>

          <AddToPlaylist
            // Remount when the hovered album changes: that closes an open menu,
            // so it can never end up showing one album while adding another.
            key={album.code}
            getSongIds={() => album.tracks.map((t) => songUuid(album.code, t.n))}
            onOpenChange={setMenuOpen}
          >
            {(openMenu) => (
              <button
                type="button"
                className={styles.act}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMenu();
                }}
                aria-label="Add album to playlist"
              >
                <Icon d={ICON.add} />
              </button>
            )}
          </AddToPlaylist>

          <button
            type="button"
            className={`${styles.act} ${liked ? styles.actOn : ''}`}
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? 'Liked' : 'Like'}
          >
            <Icon d={ICON.thumb} />
          </button>

          <Link
            href={`/album/${album.code}`}
            className={`${styles.act} ${styles.details}`}
            aria-label="More info"
          >
            <Icon d={ICON.chevron} />
          </Link>
        </div>

        <div className={styles.title}>{album.title}</div>

        <div className={styles.meta}>
          <span className={styles.genre}>{album.book}</span>
          {playable && <span className={styles.hd}>HD</span>}
          <span className={styles.artist}>
            {playable ? `${album.tracks.length} song${album.tracks.length === 1 ? '' : 's'}` : 'Coming soon'}
          </span>
        </div>

        <div className={styles.tags}>Torah Sings · sung by the Angels</div>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
