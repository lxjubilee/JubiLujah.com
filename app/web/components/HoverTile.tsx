'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlayer, PlayerSong } from '@/stores/player';
import { api } from '@/lib/api';
import { albumUuid } from '@/lib/ids';
import { MY_LIST, has, toggle } from '@/lib/userlists';
import { genrePair, albumTheme } from '@/lib/genres';
import { albumLanguage, albumBcp47 } from '@/lib/languages';
import { useAuth } from './AuthProvider';
import { useLikes } from '@/stores/likes';
import { useAuthGate } from '@/stores/authGate';
import AddToPlaylist from './AddToPlaylist';
import CoverEditBadge from './CoverEditBadge';
import TrackEditBadge from './TrackEditBadge';

// Material "playlist_add" glyph — distinguishes Add-to-Playlist from the
// Add-to-My-List "+" in the popup.
const PLAYLIST_ADD = 'M2 14h8v-2H2v2zm0-4h12V8H2v2zm0-6v2h12V4H2zm14 6v3h-3v2h3v3h2v-3h3v-2h-3v-3h-2z';

export interface TileData {
  code: string;
  title: string;
  href: string;
  image: string | null;
  status: 'ready' | 'studio';
  trackCount: number;
  artistName: string;
  // Whether the album has a published cover image on the CDN. Used with
  // MediaRow's `requireCover` to hide cover-less albums from non-admins.
  hasCover?: boolean;
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d={d} /></svg>
);
const PATHS = {
  play: 'M8 5v14l11-7z',
  plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
  check: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  thumb: 'M1 21h4V9H1v12zM23 10c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
  chevron: 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
};

export default function HoverTile({ data }: { data: TileData }) {
  const tileRef = useRef<HTMLAnchorElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 300 });
  const [broken, setBroken] = useState(false);
  const [inList, setInList] = useState(false);

  const { authenticated, canSeeStudio } = useAuth();
  const albumId = albumUuid(data.code);
  const liked = useLikes((s) => s.has('album', albumId));
  const toggleLike = useLikes((s) => s.toggle);
  const ensureLikes = useLikes((s) => s.ensureLoaded);

  useEffect(() => {
    setMounted(true);
    setInList(has(MY_LIST, data.code));
  }, [data.code]);

  // Warm the account-backed likes set once signed in, so ♥ state is correct.
  useEffect(() => { if (authenticated) ensureLikes(); }, [authenticated, ensureLikes]);

  const computePos = () => {
    const el = tileRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(Math.round(r.width * 1.55), 300);
    const estH = width + 150; // square cover + body
    let left = r.left + r.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = r.top + r.height / 2 - estH / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - estH - 8));
    setPos({ left, top, width });
  };

  const scheduleOpen = () => {
    clearTimeout(closeTimer.current);
    openTimer.current = setTimeout(() => { computePos(); setOpen(true); }, 350);
  };
  const scheduleClose = () => {
    clearTimeout(openTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  const cancelClose = () => clearTimeout(closeTimer.current);

  // Close the preview if the page scrolls (fixed-position card would detach).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const play = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const album = await api.get<{ tracks: { id: string; title: string; url: string | null }[] }>(`/api/albums/${data.code}`);
      const songs: PlayerSong[] = album.tracks
        .filter((t) => t.url)
        .map((t) => ({ id: t.id, songId: t.id, title: t.title, artist: data.artistName, album: data.title, url: t.url, cover: data.image, href: data.href }));
      if (songs.length) usePlayer.getState().playQueue(songs, 0);
    } catch { /* no audio available */ }
  };
  const onAdd = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setInList(toggle(MY_LIST, data.code)); };
  // Resolve the album's track ids on demand so the whole album can be added to a
  // playlist from the popup (the tile only knows the album code).
  const fetchAlbumTrackIds = async (): Promise<string[]> => {
    try {
      const album = await api.get<{ tracks: { id: string }[] }>(`/api/albums/${data.code}`);
      return album.tracks.map((t) => t.id);
    } catch { return []; }
  };
  const onLike = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!authenticated) { useAuthGate.getState().show('Sign in to save your favorites'); return; }
    toggleLike('album', albumId);
  };

  // Album language: drives the foreign-code pill AND the `lang` tag on the title
  // text so CJK (Japanese/Chinese/Korean) renders with the correct glyphs even on
  // an English page (shared Unicode codepoints otherwise default to Chinese glyphs).
  const albLang = albumLanguage(data.code);
  const isForeign = albLang !== 'en' && albLang !== 'other';
  const titleLang = albumBcp47(data.code);
  const showCodePill = canSeeStudio && (data.status === 'studio' || isForeign);

  const Cover = ({ sizes }: { sizes: string }) => (
    data.image && !broken
      ? <Image src={data.image} alt={data.title} fill sizes={sizes} style={{ objectFit: 'cover' }} onError={() => setBroken(true)} />
      : <span className="nf-cover-fallback"><span className="nf-cover-name" lang={titleLang}>{data.title}</span></span>
  );

  const { primary, secondary } = genrePair(data.code, data.artistName, data.title);
  // Third line: secondary genre · what-it's-about theme (either may be absent).
  const line3 = [secondary, albumTheme(data.code)].filter(Boolean).join(' · ');

  return (
    <>
      <Link
        ref={tileRef}
        href={data.href}
        className={`nf-tile nf-tile--square${data.status === 'studio' && canSeeStudio ? ' nf-tile--studio' : ''}`}
        title={data.title}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <span className="nf-tile-bg" />
        <Cover sizes="(max-width: 760px) 30vw, 16vw" />
        {/* Album-code ID pill (upper-left) — always shown on foreign-language
            covers for the privileged tier; also on studio drafts. */}
        {showCodePill && <span className="nf-code-pill nf-code-pill--tile">{data.code}</span>}
      </Link>

      {mounted && open && createPortal(
        <div
          className="nf-preview"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <Link href={data.href} className="nf-preview-cover" aria-label={data.title}>
            <Cover sizes="380px" />
            {/* Studio albums OR any foreign-language album (privileged tier): show
                the album-code ID (upper-left, red pill). */}
            {showCodePill && <span className="nf-code-pill">{data.code}</span>}
            {/* Admin-only (large preview): replace cover + manage J: tracks. */}
            <CoverEditBadge code={data.code} title={data.title} />
            <TrackEditBadge code={data.code} title={data.title} />
          </Link>
          <div className="nf-preview-body">
            <div className="nf-preview-actions">
              <button className="nf-act play" onClick={play} title="Play album"><Icon d={PATHS.play} /></button>
              {/* Add-to-My-List "+" button hidden for now (local). To restore, uncomment:
              <button className={`nf-act${inList ? ' on' : ''}`} onClick={onAdd} title={inList ? 'In My List' : 'Add to My List'}>
                <Icon d={inList ? PATHS.check : PATHS.plus} />
              </button>
              */}
              <AddToPlaylist getSongIds={fetchAlbumTrackIds} iconPath={PLAYLIST_ADD} />
              <button className={`nf-act${liked ? ' on' : ''}`} onClick={onLike} title={liked ? 'Liked' : 'Like'}><Icon d={PATHS.thumb} /></button>
              <Link href={data.href} className="nf-act details" title="More info & related albums"><Icon d={PATHS.chevron} /></Link>
            </div>
            <div className="nf-preview-title" lang={titleLang}>{data.title}</div>
            <div className="nf-preview-meta">
              <span className={`status-pill ${data.status}`}>{primary || (data.status === 'ready' ? 'Ready' : 'Studio')}</span>
              {data.status === 'ready' && <span className="nf-hd">HD</span>}
              <span className="nf-preview-artist">{data.artistName}</span>
            </div>
            {line3 && <div className="nf-preview-genres">{line3}</div>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
