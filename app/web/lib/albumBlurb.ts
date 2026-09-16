// ============================================================================
// One sentence about an album, built from what the catalogue already knows.
//
// Shared by the home hero (lib/heroes.ts) and the album page banner
// (components/AlbumApp.tsx), so an album is described the same way everywhere.
// Pure and client-safe: albumTheme and genrePair read bundled JSON, not the disk.
//
// 🔴 COMPOSED, NOT STORED, because there is nothing to store it from: the
// Inspire albums carry no prose anywhere in this repo (Torah Sings has its own
// `oneLiner`; these do not). The two facts that do exist per album are its
// THEME — a hand-derived 1-5 word line about what the record is about, in
// public/music/album-themes.json — and its GENRES, derived from its lyrics.
// Those are the same two facts the hover card shows, so a description cannot say
// something the rest of the site disagrees with.
//
// Written by hand later, if these ever read too samey: give an album a real
// sentence and this becomes the fallback for the ones that have none.
// ============================================================================
import { albumTheme, genrePair } from './genres';

export function albumBlurb(code: string, title: string, artistName: string, trackCount: number, firstTrack?: string): string {
  const theme = albumTheme(code);
  // title, not the theme: genrePair falls back to classifyTheme(title) for the
  // albums whose genres were never derived, and that reads the TITLE.
  const { primary, secondary } = genrePair(code, artistName, title);

  const styles = [primary, secondary].filter(Boolean).map((s) => s.toLowerCase());
  const style = styles.length === 2 ? `${styles[0]} and ${styles[1]}` : styles[0] || 'worship';
  const songs = trackCount === 1 ? '1 song' : `${trackCount} songs`;

  // With a theme: what the record is ABOUT, then what it sounds like. A colon,
  // not an em dash: no em dashes anywhere on the site (lib/text.ts).
  if (theme) return `${theme}: ${songs} of ${style} from ${artistName}.`;

  // Without one (91 albums), a genre alone does not describe an album —
  // "12 songs of gospel soul from Caleb Inspire" is true of a dozen of his records.
  // Its opening song is this album's own words, and concrete.
  if (firstTrack) return `${songs} of ${style} from ${artistName}, opening with “${firstTrack}”.`;

  return `${songs} of ${style} from ${artistName}.`;
}
