/**
 * Free-tier gating.
 *
 * The taste has to be real. A visitor gets whole albums — not thirty-second
 * clips — plus the opening songs of everything else, selected articles, and the
 * doorway into Learn Hebrew. Then the treasury.
 *
 * NOTE ON A SPEC CONFLICT: the Album Detail page specifies "Songs 1–2 stream
 * free"; the Membership page copy says "first song of every album." Both are
 * honored through the per-track `freeTier` flag, which is the single source of
 * truth. The seed data marks tracks 1–2, and the membership copy follows the
 * data. Change the flags and every surface follows.
 */

import type { Album, Article, LessonAlbum, Track } from './types';

export type Entitlement = 'guest' | 'member';

export interface AccessResult {
  allowed: boolean;
  /** Why it is locked, phrased for the reader. Empty when allowed. */
  reason: string;
}

const OPEN: AccessResult = { allowed: true, reason: '' };

const locked = (reason: string): AccessResult => ({ allowed: false, reason });

export function canPlayTrack(album: Album, track: Track, ent: Entitlement): AccessResult {
  if (ent === 'member') return OPEN;
  if (album.freeTier) return OPEN;
  if (track.freeTier) return OPEN;
  return locked('This song unlocks with membership.');
}

export function canReadAlbumArticle(album: Album, ent: Entitlement): AccessResult {
  // The article and derivation are always open. They are the invitation.
  void album;
  void ent;
  return OPEN;
}

export function canReadArticle(article: Article, ent: Entitlement): AccessResult {
  if (ent === 'member') return OPEN;
  if (article.freeTier) return OPEN;
  return locked('This article unlocks with membership.');
}

export function canOpenLessonAlbum(lessonAlbum: LessonAlbum, ent: Entitlement): AccessResult {
  if (ent === 'member') return OPEN;
  if (lessonAlbum.freeTier) return OPEN;
  return locked('This level unlocks with membership.');
}

/** Lesson 1 of every level is open — the doorway is never locked. */
export function canOpenLesson(
  lessonAlbum: LessonAlbum,
  lessonNumber: number,
  ent: Entitlement,
): AccessResult {
  if (ent === 'member') return OPEN;
  if (lessonAlbum.freeTier) return OPEN;
  if (lessonNumber === 1) return OPEN;
  return locked('This lesson unlocks with membership.');
}

/** How the "free taste" note reads on an album page. */
export function freeTasteNote(album: Album): string {
  if (album.freeTier) return 'This album streams free, in full. The rest of the library unlocks with membership.';
  const free = album.tracks.filter((t) => t.freeTier).map((t) => t.n);
  if (free.length === 0) return 'Full album unlocks with membership.';
  if (free.length === 1) return `Song ${free[0]} streams free. Full album unlocks with membership.`;
  const first = free[0];
  const last = free[free.length - 1];
  const contiguous = last - first + 1 === free.length;
  const range = contiguous ? `${first}–${last}` : free.join(', ');
  return `Songs ${range} stream free. Full album unlocks with membership.`;
}
