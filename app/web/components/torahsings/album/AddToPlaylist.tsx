'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { showAuthGate } from '@/lib/torahsings/auth-gate';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import {
  bulkAddToPlaylist,
  createPlaylist,
  listMyPlaylists,
  type UserPlaylist,
} from '@/lib/playlists';
import styles from './AddToPlaylist.module.css';

/** Layout effect that stays quiet during Next's server render. */
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Distance from the trigger, and the minimum breathing room at the window edge. */
const GAP = 8;
const EDGE = 12;

/**
 * "Add album to playlist", ported from JubileePraise's AddToPlaylist.
 *
 * The caller supplies the song ids LAZILY (`getSongIds`) rather than upfront —
 * on the hover card we only know the album code, and resolving every tile's
 * tracks on hover would cost a fetch per tile. We resolve at click time instead.
 *
 * Playlists load on first open (not on mount), so an unopened menu costs
 * nothing. Guests get the shared sign-in gate rather than a dead control.
 */
export function AddToPlaylist({
  getSongIds,
  children,
  onOpenChange,
}: {
  /** Resolved when the menu opens — the album's derived song uuids. */
  getSongIds: () => string[];
  /** The trigger (the caller styles its own button). */
  children: (open: () => void) => React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  const { session } = useJubileeAccount();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<UserPlaylist[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Screen coordinates for the portalled menu (see the portal note below).
  // Null until measured, which is what keeps the first paint from flashing.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const setOpenState = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
    // Drop the old coordinates so the next open re-measures instead of flashing
    // the menu at wherever the trigger used to be.
    if (!v) setPos(null);
  };

  /**
   * Pin the menu directly under the trigger.
   *
   * The height is MEASURED, never assumed. This used to guess 330px to decide
   * above-or-below, which was wrong in the common case — an empty or one-line
   * menu is ~160px — so on a short viewport it flipped ABOVE the button and then
   * clamped to the top of the window, leaving the menu stranded next to the nav
   * while the button it belongs to sat halfway down the page.
   */
  const place = useCallback(() => {
    const t = ref.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!t || !m) return;

    // Left-aligned to the trigger, then clamped so neither edge leaves the
    // window — a tile near the right edge would otherwise overhang.
    const left = Math.min(
      Math.max(t.left, EDGE),
      Math.max(EDGE, window.innerWidth - m.width - EDGE),
    );

    // Below by default. Flip above only when the real height genuinely does not
    // fit below AND there is more room up there.
    const below = t.bottom + GAP;
    const roomBelow = window.innerHeight - below - EDGE;
    const roomAbove = t.top - GAP - EDGE;
    const top =
      m.height <= roomBelow || roomBelow >= roomAbove
        ? below
        : Math.max(EDGE, t.top - GAP - m.height);

    setPos({ left, top });
  }, []);

  // Measure once the menu is in the DOM, then keep it pinned: it grows when the
  // playlists land and when a message appears, and the trigger moves when any
  // ancestor scrolls (this page has its own scrolling columns, hence capture).
  useIsoLayoutEffect(() => {
    if (!open || !session) return;
    place();
    const ro = new ResizeObserver(place);
    if (menuRef.current) ro.observe(menuRef.current);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, session, place]);

  // Close on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portalled to <body>, so it is NOT inside ref — check both.
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpenState(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenState(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Lazy-load the caller's playlists the first time the menu opens.
  useEffect(() => {
    if (!open || !session || lists !== null) return;
    listMyPlaylists()
      .then(setLists)
      .catch(() => setLists([]));
  }, [open, session, lists]);

  const trigger = () => {
    if (!session) {
      showAuthGate();
      return;
    }
    setOpenState(!open);
  };

  const addTo = async (playlistId: string) => {
    if (busy) return;
    const ids = getSongIds();
    if (!ids.length) {
      setDone('This album has no tracks to add.');
      return;
    }
    setBusy(true);
    try {
      const res = await bulkAddToPlaylist(playlistId, ids);
      setDone(
        res.added > 0
          ? `Added ${res.added} track${res.added === 1 ? '' : 's'}.`
          : 'Already in that playlist.',
      );
      // Reflect the new count without a refetch.
      setLists((prev) =>
        prev?.map((p) =>
          p.id === playlistId ? { ...p, item_count: (p.item_count ?? 0) + res.added } : p,
        ) ?? prev,
      );
      setTimeout(() => setOpenState(false), 900);
    } catch {
      setDone('Could not add to that playlist.');
    } finally {
      setBusy(false);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const pl = await createPlaylist({ name });
      setNewName('');
      setLists((prev) => (prev ? [...prev, pl] : [pl]));
      await addTo(pl.id);
    } catch {
      setDone('Could not create that playlist.');
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap} ref={ref}>
      {children(trigger)}

      {/* Portalled to <body>: the hover-preview card is `overflow: hidden`, so a
          menu rendered inside it gets clipped (it extends past the card). Fixed
          coordinates come from the trigger's rect — see place(). It renders
          hidden for the one layout pass it takes to measure itself. */}
      {open && session && createPortal(
        <div
          ref={menuRef}
          className={styles.menu}
          style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          role="dialog"
          aria-label="Add album to playlist"
        >
          <div className={styles.head}>Add album to playlist</div>

          {lists === null && <p className={styles.state}>Loading your playlists…</p>}

          {lists !== null && (
            <>
              <div className={styles.list}>
                {lists.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={styles.row}
                    onClick={() => addTo(p.id)}
                    disabled={busy}
                  >
                    <span className={styles.name}>{p.name}</span>
                    {p.is_default && <span className={styles.badge}>Default</span>}
                    <span className={styles.count}>{p.item_count ?? 0}</span>
                  </button>
                ))}
              </div>

              {lists.length === 0 && <p className={styles.empty}>No playlists yet — create one below.</p>}

              <div className={styles.newRow}>
                <input
                  className={styles.input}
                  placeholder="New Playlist…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void createAndAdd();
                    }
                  }}
                  maxLength={200}
                />
                <button
                  type="button"
                  className={styles.add}
                  onClick={createAndAdd}
                  disabled={busy || !newName.trim()}
                >
                  Add
                </button>
              </div>
            </>
          )}

          {done && <p className={styles.done}>{done}</p>}
        </div>,
        document.body,
      )}
    </div>
  );
}
