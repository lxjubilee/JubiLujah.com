// ============================================================================
// THE ALBUM DESCRIPTION — one hand-written sentence per album (owner, 2026-09-16).
//
// public/music/album-descriptions.json holds a sentence for every album in the
// catalogue, written from each album's own lyrics and blueprint. It is what the
// home hero, the album page banner, the album's meta description and the Now
// Playing page say about a record.
//
// 🔴 THE STANDARD IS THE OWNER'S, AND IT IS STRICT. One sentence of bestseller
// marketing copy that makes a reader want to press play, about what the LISTENER
// gains. Never a song count ("12 songs of…"), never the artist's name (it is
// printed right under the title), never a list of genres, never "opening with".
// The composed line those replaced (lib/albumBlurb.ts) was called "the most
// generic, unhelpful description ever". A new album gets a sentence written for
// it here; the composed line is only a stopgap until someone does.
//
// Server-only: the JSON is ~150 KB, so it is imported by Server Components and
// route handlers and handed to client components per album, never bundled.
// ============================================================================
import data from '@/public/music/album-descriptions.json';
import { albumBlurb } from './albumBlurb';

const DESCRIPTIONS: Record<string, string> = ((data as { descriptions?: Record<string, string> }).descriptions) || {};

/** The hand-written sentence for an album, or '' when none has been written. */
export function writtenDescription(code: string): string {
  return DESCRIPTIONS[(code || '').toUpperCase()] || '';
}

/** What to say about an album: its written sentence, else the composed stopgap. */
export function albumDescription(code: string, title: string, artistName: string, trackCount: number, firstTrack?: string): string {
  return writtenDescription(code) || albumBlurb(code, title, artistName, trackCount, firstTrack);
}
