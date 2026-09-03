import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AudioProvider } from '@/components/torahsings/audio/AudioProvider';
import { LearnHebrewReader } from '@/components/torahsings/backstage/LearnHebrewReader';
import { canonical, articleLd, breadcrumbLd, DEFAULT_OG_IMAGE } from '@/lib/seo';
import JsonLd from '@/components/JsonLd';
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
    alternates: canonical(`/learn-hebrew/${slug}`),
    openGraph: {
      title: `${article.title} · Torah Sings`,
      description: article.dek,
      type: 'article',
      url: `/learn-hebrew/${slug}`,
      // Restated, not inherited — see the artist route for why.
      images: [{ url: DEFAULT_OG_IMAGE, width: 1091, height: 1086, alt: article.title }],
    },
  };
}

export default async function LearnHebrewArticlePage({ params }: { params: Params }) {
  const { slug } = params;
  const article = getLearnHebrewArticle(slug);
  if (!article) notFound();

  /* The reader's Read-Aloud control drives the Torah Sings audio transport, and
     THIS tenant mounts no shell to provide one — which is why every article here
     answered HTTP 500. AudioProvider steps aside where the Torah Sings shell has
     already supplied a transport, so wrapping is correct on both tenants. */
  return (
    <AudioProvider>
      <JsonLd
        data={[
          articleLd({
            path: `/learn-hebrew/${slug}`,
            title: article.title,
            description: article.dek,
            author: article.presenter,
            section: 'Learn Hebrew',
          }),
          breadcrumbLd([
            { name: 'Learn Hebrew', path: '/learn-hebrew' },
            { name: article.title, path: `/learn-hebrew/${slug}` },
          ]),
        ]}
      />
      <LearnHebrewReader article={article} related={relatedLearnHebrew(slug)} />
    </AudioProvider>
  );
}
