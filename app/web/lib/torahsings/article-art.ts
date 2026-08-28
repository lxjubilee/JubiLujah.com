import { articleImages } from '@/content/torahsings/article-images';
import { learnHebrewImages } from '@/content/torahsings/learn-hebrew-images';

/**
 * Article hero images.
 *
 * Generated locally by tools/ArticleImageStudio into
 * J:\torahsings.com\articles\hebraic\images\<slug>.webp, deployed to Cloudflare
 * R2 and served from the CDN. The set of slugs that actually have an image is
 * the generated manifest in src/content/article-images.ts (refreshed by
 * scripts/wire-article-images.mjs); anything not listed falls back to the
 * procedural CelestialArt placeholder.
 */
// Article hero images live in the proven R2 bucket (jubileeverse-cdn) under the
// torahsings/ prefix, served via cdn.jubileeverse.com — the same infrastructure
// as album covers and audio. Override with NEXT_PUBLIC_ARTICLE_IMAGE_BASE.
const BASE = (process.env.NEXT_PUBLIC_ARTICLE_IMAGE_BASE || 'https://cdn.jubileeverse.com/torahsings').replace(/\/+$/, '');

/** The CDN URL of an article's hero image, or null when none has been generated. */
export function articleImageUrl(slug: string): string | null {
  const file = articleImages[slug];
  return file ? `${BASE}/articles/hebraic/images/${file}` : null;
}

export function hasArticleImage(slug: string): boolean {
  return Boolean(articleImages[slug]);
}

/**
 * A Learn Hebrew inline infographic URL, or null when it hasn't been generated
 * yet (the reader/card then shows an "image coming" placeholder / fallback).
 */
export function learnHebrewImageUrl(file: string | null | undefined): string | null {
  if (!file) return null;
  return learnHebrewImages[file] ? `${BASE}/articles/learn-hebrew/images/${file}` : null;
}
