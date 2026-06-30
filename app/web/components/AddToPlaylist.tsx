'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { listMyPlaylists, createPlaylist, addToPlaylist, bulkAddToPlaylist, type UserPlaylist } from '@/lib/playlists';
import { usePlaylistMembership } from '@/stores/playlistMembership';

const PLUS_PATH = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';
const CHECK_PATH = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';

// Add-to-playlist control. Adds either ONE song (songId — the "+"/✓ icon used in
// track lists and the footer player) or a WHOLE album (songIds + a labeled
// button — used on the album page). The signed-in user can pick an existing
// playlist or create one on the spot; once a single song is in a playlist the
// icon turns into a ✓. Guests see a sign-in nudge.
interface Props {
  songId?: string;
  songIds?: string[];   // when set, adds many songs at once (e.g. a full album)
  label?: string;       // when set, render a labeled button instead of the icon
  // Lazy resolver for the song ids — used where the ids aren't known upfront
  // (e.g. the album hover popup, which only knows the album code). Resolved the
  // moment the user actually adds, so hovering a tile costs no extra fetch.
  getSongIds?: () => Promise<string[]>;
  iconPath?: string;    // override the trigger glyph (icon mode only)
}

export default function AddToPlaylist({ songId, songIds, label, getSongIds, iconPath }: Props) {
  const ids = songIds && songIds.length ? songIds : (songId ? [songId] : []);
  const bulk = ids.length > 1 || !!songIds || !!getSongIds;
  const single = !bulk && !!songId;

  // Resolve the ids to add: known upfront, or fetched on demand.
  const resolveIds = async (): Promise<string[]> => {
    if (ids.length) return ids;
    if (getSongIds) { try { return await getSongIds(); } catch { return []; } }
    return [];
  };

  const { authenticated } = useAuth();
  const ensureLoaded = usePlaylistMembership((s) => s.ensureLoaded);
  const isMember = usePlaylistMembership((s) => (single && songId ? (s.counts[songId] ?? 0) > 0 : false));
  const markAdded = usePlaylistMembership((s) => s.markAdded);
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserPlaylist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Warm the membership map once per session so the ✓ shows without opening the menu.
  useEffect(() => { if (authenticated) ensureLoaded(); }, [authenticated, ensureLoaded]);

  // Close the menu on an outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Lazy-load the caller's playlists the first time the menu opens.
  useEffect(() => {
    if (!open || !authenticated || loaded) return;
    listMyPlaylists().then(setLists).catch(() => setLists([])).finally(() => setLoaded(true));
  }, [open, authenticated, loaded]);

  const flashAdded = () => { setAdded(true); setTimeout(() => setAdded(false), 1500); };

  // Add the song(s) to an existing playlist.
  const addTo = async (playlistId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const list = await resolveIds();
      if (!list.length) return;
      let delta = list.length;
      if (bulk) {
        const res = await bulkAddToPlaylist(playlistId, list);
        delta = res.added;
      } else {
        const res = await addToPlaylist(playlistId, list[0]) as { duplicate?: boolean };
        delta = res?.duplicate ? 0 : 1;
      }
      list.forEach((id) => markAdded(id));
      setLists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, item_count: (p.item_count ?? 0) + delta } : p)));
      setOpen(false);
      flashAdded();
    } catch { /* surfaced via no state change */ } finally { setBusy(false); }
  };

  // Create a new playlist and add the song(s) to it.
  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const list = await resolveIds();
      if (!list.length) return;
      const pl = await createPlaylist({ name });
      if (bulk) await bulkAddToPlaylist(pl.id, list); else await addToPlaylist(pl.id, list[0]);
      list.forEach((id) => markAdded(id));
      setLists((prev) => [{ ...pl, item_count: list.length }, ...prev]);
      setNewName('');
      setOpen(false);
      flashAdded();
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const showCheck = added || isMember;
  const headLabel = bulk ? 'Add album to Playlist' : 'Add to Playlist';

  return (
    <div className={`jv-add-pl${showCheck ? ' added' : ''}${label ? ' labeled' : ''}`} ref={ref}>
      {label ? (
        <button
          className="jv-addpl-btn"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-expanded={open}
        >{added ? '✓ Added' : label}</button>
      ) : (
        <button
          // Already in a playlist (✓): clicking does NOT open the popup again.
          onClick={() => { if (isMember && !open) return; setOpen((o) => !o); }}
          title={isMember ? 'Already in your Playlist' : 'Add to Playlist'}
          aria-label={isMember ? 'Already in your Playlist' : 'Add to Playlist'}
          aria-haspopup={!isMember}
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24"><path d={showCheck ? CHECK_PATH : (iconPath || PLUS_PATH)} /></svg>
        </button>
      )}
      {open && (
        <div className="jv-add-pl-menu" role="menu">
          {!authenticated ? (
            <div className="signin">
              <Link href="/signin" onClick={() => setOpen(false)}>Sign in</Link> to create and save Playlists.
            </div>
          ) : (
            <>
              <div className="head">{headLabel}</div>
              {!loaded && <div className="empty">Loading…</div>}
              {loaded && lists.length === 0 && <div className="empty">No Playlists yet — create one below.</div>}
              {lists.map((pl) => (
                <button key={pl.id} className="row" role="menuitem" onClick={() => addTo(pl.id)} disabled={busy}>
                  <span>{pl.name}{pl.is_default && <span className="pl-default-tag">Default</span>}</span>
                  <span className="count">{pl.item_count ?? 0}</span>
                </button>
              ))}
              <div className="new-row">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createAndAdd(); }}
                  placeholder="New Playlist…"
                  maxLength={200}
                  aria-label="New Playlist name"
                />
                <button onClick={createAndAdd} disabled={busy || !newName.trim()}>Add</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
