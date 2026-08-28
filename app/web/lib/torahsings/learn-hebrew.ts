import type { HebraicBlock } from '@/lib/torahsings/hebraic';
import { learnHebrewArticles } from '@/content/torahsings/learn-hebrew-articles';

/**
 * The Learn Hebrew word-articles (backstage-style reading room).
 *
 * Imported from J:\torahsings.com\articles\learn-hebrew by
 * scripts/build-learn-hebrew-articles.mjs. Each article teaches one Hebrew word
 * (parable → common misconception → true meaning → Paleo-Hebrew picture-letters
 * → modern traditions) and carries inline `image` blocks — Paleo-Hebrew
 * infographics placed mid-article, generated later by tools/ArticleImageStudio.
 */
export interface LearnHebrewArticle {
  order: number;
  slug: string;
  title: string;
  dek: string;
  presenter: string;
  office: string;
  readingTime: number;
  hue: number;
  glyph: string;
  /** First inline image filename — the card thumbnail (null if none). */
  thumb: string | null;
  blocks: HebraicBlock[];
}

export function getLearnHebrewArticles(): LearnHebrewArticle[] {
  return [...learnHebrewArticles].sort((a, b) => a.order - b.order);
}

export function getLearnHebrewArticle(slug: string): LearnHebrewArticle | undefined {
  return learnHebrewArticles.find((a) => a.slug === slug);
}

export function allLearnHebrewSlugs(): string[] {
  return learnHebrewArticles.map((a) => a.slug);
}

export function relatedLearnHebrew(slug: string, limit = 4): LearnHebrewArticle[] {
  return getLearnHebrewArticles().filter((a) => a.slug !== slug).slice(0, limit);
}
