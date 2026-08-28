import type { Metadata } from 'next';

import { LearnHebrewCard } from '@/components/torahsings/backstage/LearnHebrewCard';
import { getLearnHebrewArticles } from '@/lib/torahsings/learn-hebrew';
import styles from './page.module.css';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Learn Hebrew',
  description:
    'One Hebrew word at a time — the story behind it, what it really means, the ancient picture-letters that built it, and the living traditions around it today. Taught by Zev Inspire.',
};

export default function LearnHebrewPage() {
  const articles = getLearnHebrewArticles();

  return (
    <div className={`bsHebraic ${styles.page}`}>
      <div className={styles.grid}>
        {articles.map((article) => (
          <LearnHebrewCard key={article.slug} article={article} />
        ))}
      </div>
    </div>
  );
}
