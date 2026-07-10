'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { usePlayer } from '@/stores/player';
import { personaCardImage, avatarKey } from '@/lib/personas';
import { listMyPlaylists, type UserPlaylist } from '@/lib/playlists';
import { useT } from '@/lib/useT';
import { albumBcp47 } from '@/lib/languages';

// ============================================================================
// Search results (Spotify-style). Catalog matches (artists / albums / songs /
// music types) are computed on the server and passed in; the signed-in user's
// own playlists are fetched client-side (Bearer-auth) and filtered by name.
//
// Tabs: All · Songs · Albums · Artists · Music Types · Playlists. "All" shows a
// Top Result card + a short Songs list, then a card row per non-empty section.
// Studio (no-audio) albums/songs are shown only to admin/executive/reviewer.
// ============================================================================

export interface SR {
  query: string;
  artists: { slug: string; name: string; role: string | null }[];
  albums: { code: string; title: string; artistSlug: string; artistName: string; status: 'ready' | 'studio'; cover: string }[];
  songs: { id: string; n: number; title: string; albumCode: string; albumTitle: string; artistSlug: string; artistName: string; status: 'ready' | 'studio'; url: string | null; cover: string }[];
  types: { type: string; slug: string; label: string; count: number; cover: string | null }[];
}

type TabKey = 'all' | 'songs' | 'albums' | 'artists' | 'types' | 'playlists';

const PLAY = 'M8 5v14l11-7z';
const NOTE = 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z';

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={d} /></svg>;
}

// Cover image with a music-note fallback when the art is missing/broken.
function Cover({ src, alt, round = false }: { src?: string | null; alt: string; round?: boolean }) {
  const [broken, setBroken] = useState(false);
  const cls = `sr-cover${round ? ' sr-cover--round' : ''}`;
  if (!src || broken) return <span className={`${cls} sr-cover--empty`}><Icon d={NOTE} size={22} /></span>;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img className={cls} src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />;
}

export default function SearchResults({ data }: { data: SR }) {
  const term = data.query.trim().toLowerCase();
  const { authenticated, canSeeStudio } = useAuth();
  const t = useT();
  const [tab, setTab] = useState<TabKey>('all');
  const [playlists, setPlaylists] = useState<UserPlaylist[]>([]);

  // The signed-in user's own playlists, filtered by the query (client-side).
  useEffect(() => {
    if (!authenticated || !term) { setPlaylists([]); return; }
    let live = true;
    listMyPlaylists()
      .then((all) => { if (live) setPlaylists(all.filter((p) => p.name.toLowerCase().includes(term))); })
      .catch(() => { if (live) setPlaylists([]); });
    return () => { live = false; };
  }, [authenticated, term]);

  // Studio drafts are gated to the privileged tier.
  const albums = useMemo(() => canSeeStudio ? data.albums : data.albums.filter((a) => a.status === 'ready'), [data.albums, canSeeStudio]);
  const songs = useMemo(() => canSeeStudio ? data.songs : data.songs.filter((s) => s.status === 'ready'), [data.songs, canSeeStudio]);
  const { artists, types } = data;

  const playSong = (s: SR['songs'][number]) => {
    usePlayer.getState().playQueue([{ id: s.id, songId: s.id, title: s.title, artist: s.artistName, album: s.albumTitle, url: s.url, cover: s.cover, href: `/album?c=${s.albumCode}` }], 0);
  };

  // Best single match for the "Top result" card.
  type Top =
    | { kind: 'artist'; v: SR['artists'][number] }
    | { kind: 'album'; v: SR['albums'][number] }
    | { kind: 'song'; v: SR['songs'][number] };
  const topResult = useMemo<Top | null>(() => {
    const aw: Top[] = artists.map((v) => ({ kind: 'artist', v }));
    const lw: Top[] = albums.map((v) => ({ kind: 'album', v }));
    const sw: Top[] = songs.map((v) => ({ kind: 'song', v }));
    const nameOf = (t: Top) => (t.kind === 'artist' ? t.v.name : t.v.title).toLowerCase();
    // Exact match wins (artist > album > song), then a prefix match, then the
    // first album / artist / song available.
    return [...aw, ...lw, ...sw].find((t) => nameOf(t) === term)
      || aw.find((t) => nameOf(t).startsWith(term)) || lw.find((t) => nameOf(t).startsWith(term))
      || lw[0] || aw[0] || sw[0] || null;
  }, [artists, albums, songs, term]);

  const total = albums.length + artists.length + songs.length + types.length + playlists.length;

  const TABS: { key: TabKey; label: string; show: boolean }[] = [
    { key: 'all', label: t('search.all'), show: true },
    { key: 'songs', label: t('search.songs'), show: songs.length > 0 },
    { key: 'albums', label: t('search.albums'), show: albums.length > 0 },
    { key: 'artists', label: t('search.artists'), show: artists.length > 0 },
    { key: 'types', label: t('search.musicTypes'), show: types.length > 0 },
    { key: 'playlists', label: t('search.playlists'), show: playlists.length > 0 },
  ];

  // ---- render helpers ----
  const SongRow = ({ s }: { s: SR['songs'][number] }) => (
    <div className="sr-song" role="button" tabIndex={0} onClick={() => playSong(s)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && playSong(s)}>
      <div className="sr-song-art"><Cover src={s.cover} alt={s.title} /><span className="sr-song-play"><Icon d={PLAY} size={18} /></span></div>
      <div className="sr-song-txt">
        <div className="sr-song-title" lang={albumBcp47(s.albumCode)}>{s.title}{s.status === 'studio' && <span className="sr-studio-dot" title="Studio draft" />}</div>
        <div className="sr-song-sub">{s.artistName} · <Link href={`/album?c=${s.albumCode}`} className="sr-inline-link" onClick={(e) => e.stopPropagation()}>{s.albumTitle}</Link></div>
      </div>
    </div>
  );

  const AlbumCard = ({ a }: { a: SR['albums'][number] }) => (
    <Link href={`/album?c=${a.code}`} className={`sr-card${a.status === 'studio' && canSeeStudio ? ' sr-card--studio' : ''}`}>
      <div className="sr-card-art"><Cover src={a.cover} alt={a.title} /><span className="sr-card-play"><Icon d={PLAY} /></span></div>
      <div className="sr-card-title" lang={albumBcp47(a.code)}>{a.title}</div>
      <div className="sr-card-sub">{t('kind.album')} · {a.artistName}</div>
    </Link>
  );

  const ArtistCard = ({ a }: { a: SR['artists'][number] }) => (
    <Link href={`/artist/${a.slug}`} className="sr-card sr-card--artist">
      <div className={`sr-card-art sr-card-art--round ${avatarKey(a.slug)}`}><Cover src={personaCardImage(a.slug)} alt={a.name} round /></div>
      <div className="sr-card-title">{a.name}</div>
      <div className="sr-card-sub">{a.role || t('kind.artist')}</div>
    </Link>
  );

  const TypeCard = ({ ty }: { ty: SR['types'][number] }) => (
    <Link href={`/music-type/${ty.slug}`} className="sr-card">
      <div className="sr-card-art"><Cover src={ty.cover} alt={ty.label} /></div>
      <div className="sr-card-title">{ty.label}</div>
      <div className="sr-card-sub">{t('kind.musicType')} · {t(ty.count === 1 ? 'count.albumsOne' : 'count.albums', { n: ty.count })}</div>
    </Link>
  );

  const PlaylistCard = ({ p }: { p: UserPlaylist }) => (
    <Link href={`/playlist?id=${p.id}`} className="sr-card">
      <div className="sr-card-art"><Cover src={p.cover} alt={p.name} /></div>
      <div className="sr-card-title">{p.name}</div>
      <div className="sr-card-sub">{t('kind.playlist')} · {t((p.item_count ?? 0) === 1 ? 'count.songsOne' : 'count.songs', { n: p.item_count ?? 0 })}</div>
    </Link>
  );

  const TopCard = () => {
    if (!topResult) return null;
    if (topResult.kind === 'artist') {
      const a = topResult.v;
      return (
        <Link href={`/artist/${a.slug}`} className="sr-top-card">
          <div className={`sr-top-art sr-top-art--round ${avatarKey(a.slug)}`}><Cover src={personaCardImage(a.slug)} alt={a.name} round /></div>
          <div className="sr-top-name">{a.name}</div>
          <div className="sr-top-kind">{a.role || t('kind.artist')}</div>
        </Link>
      );
    }
    if (topResult.kind === 'album') {
      const a = topResult.v;
      return (
        <Link href={`/album?c=${a.code}`} className="sr-top-card">
          <div className="sr-top-art"><Cover src={a.cover} alt={a.title} /></div>
          <div className="sr-top-name" lang={albumBcp47(a.code)}>{a.title}</div>
          <div className="sr-top-kind">{t('kind.album')} · {a.artistName}</div>
          <span className="sr-top-play"><Icon d={PLAY} size={26} /></span>
        </Link>
      );
    }
    const s = topResult.v;
    return (
      <div className="sr-top-card" role="button" tabIndex={0} onClick={() => playSong(s)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && playSong(s)}>
        <div className="sr-top-art"><Cover src={s.cover} alt={s.title} /></div>
        <div className="sr-top-name" lang={albumBcp47(s.albumCode)}>{s.title}</div>
        <div className="sr-top-kind">{t('kind.song')} · {s.artistName}</div>
        <span className="sr-top-play"><Icon d={PLAY} size={26} /></span>
      </div>
    );
  };

  const Section = ({ title, items }: { title: string; items: React.ReactNode }) => (
    <section className="sr-section">
      <h2 className="sr-h2">{title}</h2>
      <div className="sr-grid">{items}</div>
    </section>
  );

  if (!term) return <p className="sr-notice">{t('search.prompt')}</p>;
  if (total === 0) return <p className="sr-notice">{t('search.noResults', { q: data.query })}</p>;

  return (
    <div className="sr sr-layout">
      <nav className="sr-nav">
        <div className="sr-nav-label">{t('search.filter')}</div>
        {TABS.filter((t) => t.show).map((t) => (
          <button key={t.key} type="button" className={`sr-nav-item${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>
      <div className="sr-content">

      {tab === 'all' && (
        <>
          <div className="sr-top-row">
            {topResult && (
              <div className="sr-top-col">
                <h2 className="sr-h2">{t('search.topResult')}</h2>
                <TopCard />
              </div>
            )}
            {songs.length > 0 && (
              <div className="sr-songs-col">
                <h2 className="sr-h2">{t('search.songs')}</h2>
                <div className="sr-song-list">{songs.slice(0, 4).map((s) => <SongRow key={s.id} s={s} />)}</div>
              </div>
            )}
          </div>
          {albums.length > 0 && <Section title={t('search.albums')} items={albums.slice(0, 7).map((a) => <AlbumCard key={a.code} a={a} />)} />}
          {artists.length > 0 && <Section title={t('search.artists')} items={artists.slice(0, 7).map((a) => <ArtistCard key={a.slug} a={a} />)} />}
          {types.length > 0 && <Section title={t('search.musicTypes')} items={types.slice(0, 7).map((ty) => <TypeCard key={ty.slug} ty={ty} />)} />}
          {playlists.length > 0 && <Section title={t('search.yourPlaylists')} items={playlists.slice(0, 7).map((p) => <PlaylistCard key={p.id} p={p} />)} />}
        </>
      )}

      {tab === 'songs' && <div className="sr-song-list sr-song-list--full">{songs.map((s) => <SongRow key={s.id} s={s} />)}</div>}
      {tab === 'albums' && <div className="sr-grid">{albums.map((a) => <AlbumCard key={a.code} a={a} />)}</div>}
      {tab === 'artists' && <div className="sr-grid">{artists.map((a) => <ArtistCard key={a.slug} a={a} />)}</div>}
      {tab === 'types' && <div className="sr-grid">{types.map((ty) => <TypeCard key={ty.slug} ty={ty} />)}</div>}
      {tab === 'playlists' && <div className="sr-grid">{playlists.map((p) => <PlaylistCard key={p.id} p={p} />)}</div>}
      </div>
    </div>
  );
}
