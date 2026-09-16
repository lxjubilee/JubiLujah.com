import type { Metadata } from 'next';
import { BACKSTAGE_SECTIONS, listBackstage } from '@/lib/backstage';
import BackstageCard from '@/components/BackstageCard';

// Backstage Access — the article library, grouped into the three formats the
// content library is built around (interviews / testimonies / stories). Laid
// out as a JubileeVerse-style card grid: a section header per format, then a
// wrapping row of fixed-width article cards.
//
// Server-rendered from the compiled content file; no client JS beyond the
// Next.js link prefetch.

// Render per request so a regenerated card image (Image Studio → gen-backstage
// rewrites backstage.json) shows on the next reload without a site rebuild.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Backstage Access',
  description:
    'Interviews, testimonies and stories, every piece built on one specific song from the JubileePraise.com catalog.',
};

export default function BackstagePage() {
  const sections = BACKSTAGE_SECTIONS.map((s) => ({ ...s, pieces: listBackstage(s.format) })).filter(
    (s) => s.pieces.length > 0,
  );

  return (
    <div className="bs-page">
      {sections.length === 0 ? (
        <div className="bs-empty">No Backstage pieces are published yet. Please check back soon.</div>
      ) : (
        sections.map((section) => (
          <section key={section.format} className="bs-section">
            {section.label ? (
              <div className="bs-section-header">
                <h2 className="bs-section-title">{section.label}</h2>
                {section.blurb ? <span className="bs-section-blurb">{section.blurb}</span> : null}
              </div>
            ) : null}
            <div className="bs-grid">
              {section.pieces.map((p, i) => (
                // Featured "wide" cards (2 columns) at the 5-per-row layout, walking across
                // the grid on a 3-row cycle: row 1 → cols 1-2, row 2 → cols 3-4, row 3 →
                // cols 4-5 (every 3rd row, the last two cards combined). That's index 0, 6
                // & 11 within each 12-card (3-row) block. Pure CSS activates the width only
                // at ≥1568px; below that the class is inert and every card is normal.
                <BackstageCard key={p.slug} piece={p} wide={i % 12 === 0 || i % 12 === 6 || i % 12 === 11} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
