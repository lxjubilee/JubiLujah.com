/**
 * Turning content into something the audio engine can play.
 *
 * The queue is entitlement-aware: locked songs are never queued, so auto-advance
 * cannot walk a guest into a paywall mid-listen. It simply stops at the edge of
 * the free taste.
 */

import type { PlayableTrack } from '@/components/torahsings/audio/AudioProvider';
import { canPlayTrack, type Entitlement } from './access';
import { trackId } from './media';
import type { Album, Track } from './types';

export function toPlayable(album: Album, track: Track): PlayableTrack | null {
  if (!track.audioUrl) return null;
  const id = trackId(album.slug, track.n);
  return {
    id,
    title: track.title,
    subtitle: album.title,
    src: track.audioUrl,
    seed: id,
    href: `/album/${album.slug}`,
  };
}

/** Every track this visitor is allowed to hear, in order. */
export function albumQueue(album: Album, ent: Entitlement): PlayableTrack[] {
  return album.tracks
    .filter((t) => canPlayTrack(album, t, ent).allowed)
    .map((t) => toPlayable(album, t))
    .filter((t): t is PlayableTrack => t !== null);
}

/** The song the album (and the home hero) opens with. */
export function openingTrack(album: Album): Track | undefined {
  return album.tracks[0];
}
