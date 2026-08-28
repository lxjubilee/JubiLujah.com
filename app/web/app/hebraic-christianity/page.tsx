import type { Metadata } from 'next';

import { BackstageCard } from '@/components/torahsings/backstage/BackstageCard';
import { getHebraicArticles } from '@/lib/torahsings/hebraic';
import styles from './page.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Hebraic Christianity',
  description:
    'The rooms behind the songs — ancient Hebraic concepts, the symbols behind the letters, and the gems hidden in the Hebrew Scriptures, read from the Paleo-Hebrew perspective.',
};

export default function HebraicChristianityPage() {
  const articles = getHebraicArticles();

  return (
    <div className={`bsHebraic ${styles.page}`}>
      <div className={styles.grid}>
        {articles.map((article) => (
          <BackstageCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  );
}
