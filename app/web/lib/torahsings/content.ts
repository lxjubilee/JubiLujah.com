/**
 * Content access.
 *
 * Every read of Album / Article / Lesson goes through here, and every read is
 * filtered by `releasedAt`. Dating a release in the future withholds it until
 * its hour comes; pages revalidate hourly, so nothing needs redeploying for a
 * new album to surface. Active subscribers simply find it there.
 */

import { albums, articles, lessonAlbums } from '@/content/torahsings';
import type { Album, Article, ArticleCategory, LessonAlbum } from './types';

/** Pages that list content should re-render at least this often (seconds). */
export const CONTENT_REVALIDATE = 3600;

function isPublished(releasedAt: string, now: Date): boolean {
  const at = new Date(`${releasedAt}T00:00:00Z`).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

/* ---- Albums ------------------------------------------------------------ */

export function getAlbums(now: Date = new Date()): Album[] {
  return albums.filter((a) => isPublished(a.releasedAt, now)).sort((a, b) => a.albumNumber - b.albumNumber);
}

export function getAlbum(slug: string, now: Date = new Date()): Album | undefined {
  return getAlbums(now).find((a) => a.slug === slug);
}

/** Slugs for static generation. Includes unreleased albums so ISR can reveal them. */
export function allAlbumSlugs(): string[] {
  return albums.map((a) => a.slug);
}

/** The album the home hero leads with. */
export function getFeaturedAlbum(now: Date = new Date()): Album | undefined {
  return getAlbums(now)[0];
}

/* ---- Articles ---------------------------------------------------------- */

export function getArticles(category?: ArticleCategory | 'All', now: Date = new Date()): Article[] {
  return articles
    .filter((a) => isPublished(a.releasedAt, now))
    .filter((a) => !category || category === 'All' || a.category === category)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
}

export function getFeaturedArticle(now: Date = new Date()): Article | undefined {
  return getArticles('All', now).find((a) => a.featured);
}

export function getArticle(slug: string, now: Date = new Date()): Article | undefined {
  return getArticles('All', now).find((a) => a.slug === slug);
}

export function allArticleSlugs(): string[] {
  return articles.map((a) => a.slug);
}

/* ---- Lessons ----------------------------------------------------------- */

export function getLessonAlbums(now: Date = new Date()): LessonAlbum[] {
  return lessonAlbums.filter((l) => isPublished(l.releasedAt, now)).sort((a, b) => a.level - b.level);
}

export function getLessonAlbum(slug: string, now: Date = new Date()): LessonAlbum | undefined {
  return getLessonAlbums(now).find((l) => l.slug === slug);
}

export function allLessonSlugs(): string[] {
  return lessonAlbums.map((l) => l.slug);
}
