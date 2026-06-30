import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { searchCatalog } from '@/lib/manifest';
import { musicTypes, musicTypeLabel } from '@/lib/musicTypes';
import { translate } from '@/lib/i18n';
import { LANG_COOKIE, DEFAULT_LANG, isSupportedLang } from '@/lib/languages';
import SearchResults, { type SR } from '@/components/SearchResults';

export const dynamic = 'force-dynamic';

export function generateMetadata({ searchParams }: { searchParams: { q?: string } }): Metadata {
  const q = searchParams.q || '';
  return { title: q ? `Search: ${q}` : 'Search', robots: { index: false } };
}

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q || '';
  const term = q.trim().toLowerCase();
  const { artists, albums, songs } = searchCatalog(q);

  // Music Types matching the query (server-only; reads the manifest/genres).
  const types: SR['types'] = term
    ? musicTypes()
        .map((t) => ({ type: t.type, slug: t.slug, label: musicTypeLabel(t.type), count: t.count, cover: t.cover }))
        .filter((t) => t.label.toLowerCase().includes(term) || t.type.toLowerCase().includes(term) || t.slug.includes(term))
    : [];

  const data: SR = { query: q, artists, albums, songs, types };

  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang = cookieLang && isSupportedLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const title = q ? `${translate(lang, 'search.resultsFor')} “${q}”` : translate(lang, 'search.title');

  return (
    <section className="standard sr-page">
      <div className="container">
        <h1 className="sr-title">{title}</h1>
        <SearchResults data={data} />
      </div>
    </section>
  );
}
