'use client';

/**
 * The shared client-side likes STORE for the Torah Sings surfaces.
 *
 * 🔴 The network calls are deliberately NOT redefined here. Torah Sings shipped
 * its own copy of `listLikeIds` / `likeTarget` / `unlikeTarget`, byte-identical
 * to JubileePraise's, and two identical copies is how they quietly stop being
 * identical. They are re-exported from @/lib/likes instead, so there is exactly
 * one definition of what a like is and where it is stored.
 *
 * What genuinely belongs to Torah Sings is the store on top: one source of
 * truth for every like button — the hover-preview thumb, the album-detail
 * heart, the Liked page — so liking in one place lights up everywhere without
 * each component fetching its own state. Module-level, no provider needed.
 *
 * (JubileePraise's own surfaces do not use this store yet. If they adopt it, this
 * file moves up to lib/likes.ts wholesale — nothing here is tenant-specific
 * except which components happen to call it.)
 */

import { useSyncExternalStore } from 'react';
import { likeTarget, unlikeTarget, listLikeIds, type LikeType } from '@/lib/likes';

export { likeTarget, unlikeTarget, listLikeIds };
export type { LikeType };

export const likeKey = (type: LikeType, id: string) => `${type}:${id}`;

let likedSet = new Set<string>();
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
// Reference is stable until a mutation swaps in a new Set, so useSyncExternalStore
// re-renders exactly when the set changes.
function snapshot() {
  return likedSet;
}
// The server has no likes to report; returning the same empty set every time
// keeps useSyncExternalStore from looping during hydration.
const SERVER_SNAPSHOT = new Set<string>();
function serverSnapshot() {
  return SERVER_SNAPSHOT;
}

export function useLikedSet(): Set<string> {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Fetch the caller's likes once (idempotent). Call when signed in. */
export async function ensureLikesLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const r = await listLikeIds();
    likedSet = new Set(r.ids);
    emit();
  } catch {
    loaded = false; // let a later mount retry
  }
}

/** Clear on sign-out so the next visitor doesn't inherit these likes. */
export function resetLikes(): void {
  likedSet = new Set();
  loaded = false;
  emit();
}

/** Optimistic toggle: flip immediately, reconcile with the API, revert on error. */
export async function toggleLikeStored(type: LikeType, id: string): Promise<void> {
  const key = likeKey(type, id);
  const wasLiked = likedSet.has(key);
  const next = new Set(likedSet);
  if (wasLiked) next.delete(key);
  else next.add(key);
  likedSet = next;
  emit();
  try {
    if (wasLiked) await unlikeTarget(type, id);
    else await likeTarget(type, id);
  } catch {
    const rev = new Set(likedSet);
    if (wasLiked) rev.add(key);
    else rev.delete(key);
    likedSet = rev;
    emit();
  }
}
