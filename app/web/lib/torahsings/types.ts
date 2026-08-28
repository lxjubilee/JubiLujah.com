/**
 * First-class content types.
 *
 * Album, Article, and Lesson are the three publishable entities. Everything
 * downstream (routing, gating, the library grids) reads from these shapes, so
 * new releases drop in as data and flow automatically to active subscribers.
 *
 * `releasedAt` is an ISO date. Anything dated in the future is withheld until
 * its hour comes — see `lib/content.ts`.
 */

import type { ModeId } from './derivation';

/** A block of rich text. Article bodies are arrays of these. */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'quote'; text: string; cite: string };

/** Celestial art. Hue varies per album so the motif stays iconic, not repetitive. */
export interface Art {
  /** 0–360. Tints the top radial glow and the orb. */
  hue: number;
  /** A single Hebrew letter used as a faint watermark. */
  glyph: string;
}

export interface Track {
  n: number;
  title: string;
  /** Display duration, e.g. "4:12". */
  duration: string;
  /** Jubilee CDN URL. Null until the master lands. */
  audioUrl: string | null;
  /** Streams without a membership. */
  freeTier: boolean;
}

/** The Scripture a song was surfaced from. */
export interface Source {
  /** e.g. "Job 38:7" */
  reference: string;
  /** Unpointed Hebrew — the derivation reads this symbol by symbol. */
  hebrew: string;
  transliteration: string;
  english: string;
}

export interface Album {
  slug: string;
  title: string;
  /** Albums are organized around themes, not books and not artists. */
  topic: string;
  /** 1-based. Rendered as a Roman numeral in the hero. */
  albumNumber: number;
  /** One line, for the card. */
  oneLiner: string;
  /** Fuller description, for the album hero. */
  description: string;
  /** Rotating Inspire Family presenter. */
  presenter: string;
  art: Art;
  /** The mode this album sings in. */
  mode: ModeId;
  source: Source;
  article: {
    headline: string;
    blocks: Block[];
    /** Pre-rendered Inspire-voice read-aloud. Null falls back to browser speech. */
    audioUrl: string | null;
    voice: string;
    minutes: number;
  };
  lyrics: {
    /** Each stanza is an array of lines. */
    stanzas: string[][];
    /** Source verses, noted beneath. */
    note: string;
  };
  derivation: {
    intro: string;
    /** The disclosed steps, in order. */
    steps: string[];
    closing: string;
    /** What stays proprietary. Stated plainly, without apology. */
    withheld: string;
  };
  /**
   * However many songs the narrative yields. Albums are grouped by biblical
   * narrative/theme and the story determines the count — no fixed number.
   */
  tracks: Track[];
  /** The whole album streams free — part of "the taste." */
  freeTier: boolean;
  releasedAt: string;
}

export const ARTICLE_CATEGORIES = [
  'The Names',
  'Feasts & Times',
  'Letters & Symbols',
  'Covenant',
  'The Ruach Kodesh',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export interface Article {
  slug: string;
  title: string;
  /** The standfirst under the headline. */
  dek: string;
  category: ArticleCategory;
  presenter: string;
  readingTime: number;
  art: Art;
  blocks: Block[];
  audioUrl: string | null;
  freeTier: boolean;
  /** At most one. Renders as the large horizontal card. */
  featured?: boolean;
  releasedAt: string;
}

export interface Exercise {
  prompt: string;
  choices: string[];
  answerIndex: number;
  /** Shown after answering. */
  note: string;
}

export interface Lesson {
  n: number;
  title: string;
  summary: string;
  durationMinutes: number;
  /** Video or audio, from the Jubilee pipeline. */
  mediaUrl: string | null;
  exercises: Exercise[];
}

export interface LessonAlbum {
  slug: string;
  title: string;
  subtitle: string;
  level: 1 | 2 | 3;
  /** Zev and Zariah lead. Others may join. */
  presenters: string[];
  /** The tile glyph. */
  glyph: string;
  hue: number;
  intro: string;
  lessons: Lesson[];
  freeTier: boolean;
  releasedAt: string;
}
