'use client';
import { useLang } from '@/lib/useLang';
import { useT } from '@/lib/useT';
import { useAuth } from './AuthProvider';
import { DEFAULT_LANG, langName } from '@/lib/languages';
import MediaRow, { TileData } from './MediaRow';

// Home wrapper: in the default language (English) it renders the normal home
// (children). In another language it shows only that language's albums (and a
// "coming soon" note while the catalog has none yet). The privileged tier
// (admin/executive/reviewer) also sees in-production STUDIO drafts here so they
// can review what's being worked on per language; ordinary viewers see only
// LIVE albums (and "coming soon" when a language has only studio drafts).
export default function LanguageHome({ otherAlbums, children }: { otherAlbums: (TileData & { lang: string })[]; children: React.ReactNode }) {
  const lang = useLang();
  const t = useT();
  const { canSeeStudio } = useAuth();
  if (lang === DEFAULT_LANG) return <>{children}</>;
  const items = otherAlbums.filter((a) => a.lang === lang);
  // What THIS viewer will actually see — drives the empty/"coming soon" state.
  const userVisible = canSeeStudio ? items : items.filter((a) => a.status === 'ready');
  return (
    <div className="nf-rows">
      {userVisible.length > 0 ? (
        // Pass the FULL set (incl. studio): MediaRow gates studio to the
        // privileged tier, shows the LIVE/TOTAL count, and the yellow studio borders.
        <MediaRow title={`${t('home.title')} — ${langName(lang)}`} items={items} />
      ) : (
        <div className="lang-empty">
          <h2>{t('home.title')} — {langName(lang)}</h2>
          <p>{t('home.comingSoon', { language: langName(lang) })}</p>
        </div>
      )}
    </div>
  );
}
