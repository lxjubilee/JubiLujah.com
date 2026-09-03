import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AudioProvider } from '@/components/torahsings/audio/AudioProvider';
import { BackstageReader } from '@/components/torahsings/backstage/BackstageReader';
import { canonical, articleLd, breadcrumbLd, DEFAULT_OG_IMAGE } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
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
    alternates: canonical(`/hebraic-christianity/${slug}`),
    openGraph: {
      title: `${article.title} · Torah Sings`,
      description: article.dek,
      type: 'article',
      url: `/hebraic-christianity/${slug}`,
      // Restated, not inherited — see the artist route for why.
      images: [{ url: DEFAULT_OG_IMAGE, width: 1091, height: 1086, alt: article.title }],
    },
  };
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { slug } = params;
  const article = getHebraicArticle(slug);
  if (!article) notFound();

  /* Same as /learn-hebrew/[slug]: the reader drives the Torah Sings transport
     and this tenant mounts no shell to provide one. */
  return (
    <AudioProvider>
      <JsonLd
        data={[
          articleLd({
            path: `/hebraic-christianity/${slug}`,
            title: article.title,
            description: article.dek,
            author: article.presenter,
            section: 'Hebraic Christianity',
          }),
          breadcrumbLd([
            { name: 'Hebraic Christianity', path: '/hebraic-christianity' },
            { name: article.title, path: `/hebraic-christianity/${slug}` },
          ]),
        ]}
      />
      <BackstageReader article={article} related={relatedHebraic(slug)} />
    </AudioProvider>
  );
}
