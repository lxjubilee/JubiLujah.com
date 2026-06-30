'use client';
import HoverTile, { TileData } from './HoverTile';
import { useAuth } from './AuthProvider';
import { useLang } from '@/lib/useLang';
import { albumVisibleInLang } from '@/lib/languages';

// A content row: a persona name + a wrapping grid of square album-cover tiles
// (each with a hover preview). Tiles wrap to the next line rather than scroll.
//
// In-production ("studio") albums are hidden from signed-out visitors and plain
// viewers — only admins/reviewers see them. The filter runs client-side: the
// server render (and a guest's session) shows READY only; studio tiles appear
// for an authorized session after auth resolves. A row whose tiles are all
// filtered out collapses entirely.
//
// `showAll` opts a row out of that gating (every tile shown to everyone) — used
// where a full discography is intentionally surfaced (e.g. Melody on Family
// Friendly).
//
// `requireCover` adds a second, independent gate: albums WITHOUT a published
// cover image are shown only to admins. Normal users (and guests) never see a
// cover-less album. Runs client-side after auth resolves, like the studio gate.
export default function MediaRow({ title, items, showAll = false, requireCover = false }:
  { title: string; items: TileData[]; showAll?: boolean; requireCover?: boolean }) {
  const { canSeeStudio } = useAuth();
  const lang = useLang();
  let visible = (showAll || canSeeStudio) ? items : items.filter((it) => it.status === 'ready');
  // Cover gate: hide cover-less albums from ordinary viewers. The privileged tier
  // (admin/executive/reviewer = canSeeStudio) sees them — work-in-progress studio
  // albums are typically cover-less and should be visible to that tier.
  if (requireCover && !canSeeStudio) visible = visible.filter((it) => it.hasCover !== false);
  // Language gate: the default English site shows English + legacy albums and
  // hides foreign-language translations; a selected language shows only its own.
  visible = visible.filter((it) => albumVisibleInLang(it.code, lang));
  if (!visible.length) return null;

  // Live/total album counts shown beside the section title for the privileged
  // tier only (admin/executive/reviewer = canSeeStudio). Status-based and
  // language-scoped; independent of the cover/studio DISPLAY filters above, so
  // X = LIVE (ready) and Y = LIVE + STUDIO for this section in the current language.
  const inLang = items.filter((it) => albumVisibleInLang(it.code, lang));
  const liveCount = inLang.filter((it) => it.status === 'ready').length;
  const totalCount = inLang.length;

  return (
    <section className="nf-row">
      <h2 className="nf-row-title">
        {title}
        {canSeeStudio && <span className="nf-row-count">{liveCount}/{totalCount} Albums</span>}
      </h2>
      <div className="nf-row-track">
        {visible.map((it) => <HoverTile key={it.code} data={it} />)}
      </div>
    </section>
  );
}

export type { TileData };
