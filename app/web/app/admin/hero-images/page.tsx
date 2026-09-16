import { heroPool } from '@/lib/heroes';
import HeroImagePreview, { type PreviewHero } from '@/components/HeroImagePreview';

// ============================================================================
// ADMIN · HERO IMAGE PREVIEW (owner, 2026-09-16). Every album hero the site can
// show, grouped by artist, and a step-through previewer that frames the ones no
// admin has positioned yet. The framing is the same value the red arrows on the
// live hero set (stores/heroPositions.ts -> content/hero-positions.json).
//
// A Server Component under the client admin layout: the pool is a directory walk
// (lib/heroes.ts is server-only), so it is read here and handed down. The role
// gate is the layout's; the pictures and titles are public on the home page.
// ============================================================================

export const dynamic = 'force-dynamic';

export default function AdminHeroImages() {
  const pool: PreviewHero[] = heroPool().map((s) => ({
    code: s.code,
    title: s.title,
    artistName: s.artistName,
    image: s.image,
    href: s.href,
    blurb: s.blurb,
  }));
  return <HeroImagePreview pool={pool} />;
}
