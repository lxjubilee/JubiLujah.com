import Link from 'next/link';
import { ArticleArt } from '@/components/torahsings/system/ArticleArt';
import type { HebraicArticle } from '@/lib/torahsings/hebraic';
import styles from './BackstageCard.module.css';

/** A backstage-style article card: 16:9 art on top, gold tag, title, byline. */
export function BackstageCard({ article }: { article: HebraicArticle }) {
  return (
    <Link href={`/hebraic-christianity/${article.slug}`} className={styles.card}>
      <div className={styles.image}>
        <ArticleArt
          className={styles.img}
          slug={article.slug}
          hue={article.hue}
          glyph={article.glyph}
          topic="Hebraic Christianity"
          ratio="16 / 9"
        />
      </div>
      <div className={styles.body}>
        <span className={styles.category}>Hebraic Christianity</span>
        <h3 className={styles.title}>{article.title}</h3>
        <span className={styles.meta}>
          {article.presenter} · {article.readingTime} min
        </span>
      </div>
    </Link>
  );
}
