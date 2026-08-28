import { hebraicArticles } from '@/content/torahsings/hebraic-articles';

/**
 * The Hebraic Christianity article corpus (backstage-style reading room).
 *
 * Imported from the article drive (J:\torahsings.com\articles\hebraic) into a
 * committed TS array by scripts/build-hebraic-articles.mjs — production has no
 * access to J:, so the content is baked in at build time (same pattern as the
 * angels catalog). This is a self-contained corpus, separate from the legacy
 * `Article` model in src/content/articles, so its 136 entries never have to
 * satisfy that model's editorial invariants.
 */
export interface HebraicBlock {
  /** `p` paragraph · `h` heading · `quote` blockquote · `hr` divider · `image` inline picture. */
  type: 'p' | 'h' | 'quote' | 'hr' | 'image';
  /** Raw text, may carry inline bold / italic markers. Absent for `hr`/`image`. */
  text?: string;
  /** Citation pulled from a trailing "(Reference)" on a quote, when present. */
  cite?: string;
  /** For `image`: the target webp filename (e.g. `<slug>-1.webp`). */
  src?: string;
  /** For `image`: alt text. */
  alt?: string;
}

export interface HebraicArticle {
  /** Global sort key from the corpus (contiguous). Listing order. */
  order: number;
  slug: string;
  title: string;
  /** The standfirst / excerpt shown on the card and under the headline. */
  dek: string;
  /** The author byline (e.g. "Zev Inspire"). */
  presenter: string;
  /** The author's office (e.g. "Teacher & Apostle"). */
  office: string;
  /** Estimated minutes, from the body word count. */
  readingTime: number;
  /** 0–360, tints the CelestialArt fallback when there is no hero image. */
  hue: number;
  /** A single Hebrew letter used as the fallback art watermark. */
  glyph: string;
  blocks: HebraicBlock[];
}

/** All articles in corpus order (by `order`). */
export function getHebraicArticles(): HebraicArticle[] {
  return [...hebraicArticles].sort((a, b) => a.order - b.order);
}

export function getHebraicArticle(slug: string): HebraicArticle | undefined {
  return hebraicArticles.find((a) => a.slug === slug);
}

export function allHebraicSlugs(): string[] {
  return hebraicArticles.map((a) => a.slug);
}

/** Same-author-first "keep reading" picks, excluding the current slug. */
export function relatedHebraic(slug: string, limit = 4): HebraicArticle[] {
  const all = getHebraicArticles().filter((a) => a.slug !== slug);
  const idx = all.findIndex((a) => a.slug > slug); // stable-ish spread
  const rotated = idx > 0 ? [...all.slice(idx), ...all.slice(0, idx)] : all;
  return rotated.slice(0, limit);
}
