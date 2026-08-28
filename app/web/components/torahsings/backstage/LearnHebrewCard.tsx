import Link from 'next/link';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { learnHebrewImageUrl } from '@/lib/torahsings/article-art';
import type { LearnHebrewArticle } from '@/lib/torahsings/learn-hebrew';
import styles from './BackstageCard.module.css';

/** A backstage card for a Learn Hebrew word-article; thumbnail = first inline
 *  infographic (CelestialArt fallback until it's generated). */
export function LearnHebrewCard({ article }: { article: LearnHebrewArticle }) {
  // The main image is the hero (<slug>.webp), like the Hebraic Christianity cards.
  const url = learnHebrewImageUrl(`${article.slug}.webp`);
  return (
    <Link href={`/learn-hebrew/${article.slug}`} className={styles.card}>
      <div className={styles.image}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.img} src={url} alt="" loading="lazy" decoding="async" />
        ) : (
          <CelestialArt
            className={styles.img}
            seed={article.slug}
            hue={article.hue}
            glyph={article.glyph}
            topic="Learn Hebrew"
            ratio="16 / 9"
          />
        )}
      </div>
      <div className={styles.body}>
        <span className={styles.category}>Learn Hebrew</span>
        <h3 className={styles.title}>{article.title}</h3>
        <span className={styles.meta}>
          {article.presenter} · {article.readingTime} min
        </span>
      </div>
    </Link>
  );
}
