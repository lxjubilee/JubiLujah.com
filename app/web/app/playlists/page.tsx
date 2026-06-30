'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import {
  listMyPlaylists, createPlaylist, deletePlaylist, getPlaylist,
  type UserPlaylist,
} from '@/lib/playlists';
import { usePlayer, type PlayerSong } from '@/stores/player';

// Deterministic gradient art per playlist (fallback when it has no tracks yet).
function artStyle(seed: string): React.CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const h2 = (h + 48) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 55% 32%), hsl(${h2} 60% 22%))` };
}

const NOTE = 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z';

export default function PlaylistsPage() {
  const { authenticated, loading } = useAuth();
  const router = useRouter();
  const playQueue = usePlayer((s) => s.playQueue);

  const [mine, setMine] = useState<UserPlaylist[]>([]);
  const [mineLoaded, setMineLoaded] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refreshMine = useCallback(() => {
    if (!authenticated) { setMine([]); setMineLoaded(true); return; }
    listMyPlaylists().then(setMine).catch(() => setMine([])).finally(() => setMineLoaded(true));
  }, [authenticated]);

  useEffect(() => { if (!loading) refreshMine(); }, [loading, refreshMine]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || creating) return;
    setCreating(true); setErr(null);
    try {
      const pl = await createPlaylist({ name: n, description: desc.trim() || undefined });
      setMine((p) => [{ ...pl, item_count: 0 }, ...p]);
      setName(''); setDesc('');
    } catch (e: any) {
      setErr(e?.message || 'Could not create Playlist.');
    } finally { setCreating(false); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await deletePlaylist(confirmDel.id);
      setMine((p) => p.filter((x) => x.id !== confirmDel.id));
      setConfirmDel(null);
    } catch { /* ignore */ } finally { setDeleting(false); }
  };

  const open = (id: string) => router.push(`/playlist?id=${id}`);

  // Start playback straight from the card (the click is the user gesture, so
  // autoplay is allowed), then open the playlist page so the tracks are visible.
  const onPlay = async (id: string) => {
    try {
      const d = await getPlaylist(id);
      const songs: PlayerSong[] = d.items.map((it, i) => ({
        id: `pl-${id}#${i}`, songId: it.song_id, title: it.song_title,
        artist: it.artist_name || undefined, album: it.album_title || undefined,
        url: it.url ?? null, cover: it.cover ?? null, href: `/playlist?id=${id}`,
      }));
      if (songs.some((s) => s.url)) playQueue(songs, 0);
    } catch { /* ignore */ }
    open(id);
  };

  // Hide the auto-provisioned "My Favorites" default from this grid.
  const visible = mine.filter((pl) => !pl.is_default);

  return (
    <>
      <section className="plx-hero">
        <div className="container">
          <h1 className="plx-hero-title">My Favorites</h1>
          <p className="plx-hero-lead">
            Build your own mixes from any album or straight from the player — name them, play them,
            and keep them saved to your account.
          </p>
        </div>
      </section>

      <section className="plx-section">
        <div className="container">
          <div className="plx-section-head">
            <h2 className="plx-section-title">My Playlists</h2>
            {authenticated && visible.length > 0 && <span className="plx-section-count">{visible.length}</span>}
          </div>

          {!loading && !authenticated && (
            <div className="plx-signin">
              <p><Link href="/signin" className="pl-link">Sign in</Link> to create Playlists and save them to your account.</p>
            </div>
          )}

          {authenticated && (
            <form className="plx-create" onSubmit={onCreate}>
              <input className="plx-input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="New Playlist name" maxLength={200} aria-label="Playlist name" />
              <input className="plx-input plx-input-desc" value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)" maxLength={2000} aria-label="Playlist description" />
              <button type="submit" className="plx-create-btn" disabled={creating || !name.trim()}>
                {creating ? 'Creating…' : '+ Create'}
              </button>
            </form>
          )}
          {err && <p className="notice pl-error">{err}</p>}

          {authenticated && mineLoaded && visible.length === 0 && (
            <p className="plx-empty">No Playlists yet. Name one above to get started.</p>
          )}

          {authenticated && visible.length > 0 && (
            <div className="plx-grid">
              {visible.map((pl) => {
                const count = pl.item_count ?? 0;
                return (
                  <article key={pl.id} className="plx-card">
                    <button className="plx-art" style={pl.cover ? undefined : artStyle(pl.id + pl.name)} onClick={() => open(pl.id)} aria-label={`Open ${pl.name}`}>
                      {pl.cover
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img className="plx-art-img" src={pl.cover} alt="" />
                        : <svg className="plx-art-note" viewBox="0 0 24 24" fill="currentColor"><path d={NOTE} /></svg>}
                      <span className="plx-art-count">{count} {count === 1 ? 'track' : 'tracks'}</span>
                      <span className="plx-art-play" onClick={(e) => { e.stopPropagation(); onPlay(pl.id); }} role="button" aria-label={`Play ${pl.name}`} title="Play">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>
                      </span>
                    </button>
                    <div className="plx-card-body">
                      <h3 className="plx-card-name" onClick={() => open(pl.id)}>
                        {pl.name}
                        {pl.is_default && <span className="plx-default-badge">Default</span>}
                      </h3>
                      {pl.description && <p className="plx-card-desc">{pl.description}</p>}
                    </div>
                    <div className="plx-card-actions">
                      <button className="plx-btn plx-btn-primary" onClick={() => onPlay(pl.id)} disabled={count === 0}>▶ Play</button>
                      <button className="plx-btn" onClick={() => open(pl.id)}>Open</button>
                      {!pl.is_default && (
                        <button className="plx-btn plx-btn-ghost" onClick={() => setConfirmDel({ id: pl.id, name: pl.name })} aria-label="Delete Playlist">Delete</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {confirmDel && (
        <div className="rv-modal-backdrop" onClick={() => { if (!deleting) setConfirmDel(null); }}>
          <div className="rv-modal rv-modal-sm" role="dialog" aria-modal="true" aria-label="Delete Playlist" onClick={(e) => e.stopPropagation()}>
            <div className="rv-modal-head">
              <h3>Delete Playlist</h3>
              <button className="rv-modal-x" onClick={() => setConfirmDel(null)} aria-label="Close">×</button>
            </div>
            <p className="plx-confirm-text">
              Delete “<strong>{confirmDel.name}</strong>”? This permanently removes the Playlist and can’t be undone.
            </p>
            <div className="rv-modal-actions">
              <span className="rv-spacer" />
              <button className="rv-btn rv-btn-ghost" onClick={() => setConfirmDel(null)} disabled={deleting} type="button">Cancel</button>
              <button className="rv-btn rv-btn-danger" onClick={doDelete} disabled={deleting} type="button">{deleting ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
