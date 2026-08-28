import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LearnHebrewReader } from '@/components/torahsings/backstage/LearnHebrewReader';
import { allLearnHebrewSlugs, getLearnHebrewArticle, relatedLearnHebrew } from '@/lib/torahsings/learn-hebrew';

export const revalidate = 3600;

type Params = { slug: string };

export function generateStaticParams() {
  return allLearnHebrewSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = params;
  const article = getLearnHebrewArticle(slug);
  if (!article) return { title: 'Article not found' };

  return {
    title: article.title,
    description: article.dek,
    openGraph: { title: `${article.title} · Torah Sings`, description: article.dek },
  };
}

export default async function LearnHebrewArticlePage({ params }: { params: Params }) {
  const { slug } = params;
  const article = getLearnHebrewArticle(slug);
  if (!article) notFound();

  return <LearnHebrewReader article={article} related={relatedLearnHebrew(slug)} />;
}
