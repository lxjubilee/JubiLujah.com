import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BackstageReader } from '@/components/torahsings/backstage/BackstageReader';
import { allHebraicSlugs, getHebraicArticle, relatedHebraic } from '@/lib/torahsings/hebraic';

export const revalidate = 3600;

type Params = { slug: string };

export function generateStaticParams() {
  return allHebraicSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = params;
  const article = getHebraicArticle(slug);
  if (!article) return { title: 'Article not found' };

  return {
    title: article.title,
    description: article.dek,
    openGraph: { title: `${article.title} · Torah Sings`, description: article.dek },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = params;
  const article = getHebraicArticle(slug);
  if (!article) notFound();

  return <BackstageReader article={article} related={relatedHebraic(slug)} />;
}
