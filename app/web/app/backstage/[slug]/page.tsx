import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBackstagePiece, relatedBackstage } from '@/lib/backstage';
import BackstageProse, { BackstageInline } from '@/components/BackstageProse';
import BackstageCard from '@/components/BackstageCard';
import BackstageReadAloud from '@/components/BackstageReadAloud';
import BackstageTranslate from '@/components/BackstageTranslate';
import BackstageShare from '@/components/BackstageShare';
import BackstageBackButton from '@/components/BackstageBackButton';
import BackstageHeroImage from '@/components/BackstageHeroImage';

// A single Backstage piece — laid out like JubileeVerse's long-form article
// template: a full-bleed hero image whose bottom gradient carries the category,
// headline and meta, then a two-column body (prose + a sticky "The Song"
// sidebar), and a "More from Backstage" card row underneath.
//
// The representative-account banner (§9.2) is rendered ABOVE the article body
// and is not optional: a testimony composed from the kind of moment a song is
// built for must never be presented as a real named listener. The generator
// carries `banner` through from the source file for exactly this reason — if a
// piece is marked representative it says so on the page, every time.

// Render per request so a regenerated hero image (Image Studio → gen-backstage
// rewrites backstage.json) shows on the next reload without a site rebuild.
export const dynamic = 'force-dynamic';

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const piece = getBackstagePiece(params.slug);
  if (!piece) return { title: 'Backstage Access' };
  return {
    title: piece.title,
    description: piece.excerpt,
    openGraph: {
      title: piece.title,
      description: piece.excerpt,
      type: 'article',
      images: piece.cover ? [piece.cover] : undefined,
    },
  };
}

export default function BackstagePiecePage({ params }: { params: { slug: string } }) {
  const piece = getBackstagePiece(params.slug);
  if (!piece) notFound();

  const related = relatedBackstage(piece.slug, 4);

  // Plain text for the Read Aloud widget: the headline, then every prose block
  // with markdown emphasis stripped (so the voice doesn't read "asterisk").
  const readText = [
    piece.title,
    ...piece.body
      .filter((b) => b.text)
      .map((b) => (b.text as string).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')),
  ].join('. ');

  return (
    <article className="bsa-article">
      {/* ---- Hero: full-bleed image with the headline over a bottom gradient -- */}
      <section className="bsa-hero">
        <BackstageHeroImage slug={piece.slug} src={piece.cover} song={piece.song} initialY={piece.heroY} />

        <BackstageBackButton />

        <div className="bsa-hero-overlay">
          <div className="bsa-hero-content">
            <div className="bsa-meta-bottom">
              <span className="bsa-meta-item">{piece.artist}</span>
            </div>
            <h1 className="bsa-hero-title">{piece.title}</h1>
          </div>
        </div>
      </section>

      {/* ---- Body: prose + sticky sidebar ------------------------------------ */}
      <div className="bsa-container">
        <div className="bsa-main">
          {/* §9.2 — never dropped, never softened. */}
          {piece.banner ? (
            <aside className="bsa-banner">
              <BackstageInline text={piece.banner} />
            </aside>
          ) : null}

          <BackstageProse blocks={piece.body} className="bsa-body" />

          {/* The biblical principle the piece is built on — set apart as a callout. */}
          {piece.principle ? (
            <div className="bsa-callout">
              <div className="bsa-callout-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
                The Principle
              </div>
              <p className="bsa-callout-text">
                <BackstageInline text={piece.principle} />
              </p>
            </div>
          ) : null}
        </div>

        <aside className="bsa-sidebar">
          <BackstageReadAloud text={readText} />

          <BackstageTranslate title={piece.title} blocks={piece.body} />

          <div className="bsa-widget">
            <h2 className="bsa-widget-title">The Song</h2>
            <dl className="bsa-facts">
              <dt>Song</dt>
              <dd>{piece.song}</dd>
              {piece.albumTitle ? (
                <>
                  <dt>Album</dt>
                  <dd>{piece.albumTitle}</dd>
                </>
              ) : null}
              <dt>Artist</dt>
              <dd>{piece.artist}</dd>
              <dt>Format</dt>
              <dd>{piece.format}</dd>
            </dl>
            {piece.albumHref ? (
              <Link href={piece.albumHref} className="bsa-listen">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Listen to {piece.albumTitle || piece.song}
              </Link>
            ) : null}
          </div>

          <BackstageShare title={piece.title} />
        </aside>
      </div>

      {/* ---- Listen CTA — a big play prompt at the foot of the article, so the
           reader ends the piece by hearing the song it's about. ------------- */}
      {piece.albumHref ? (
        <Link href={piece.albumHref} className="bsa-listen-cta">
          <span className="bsa-listen-cta-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="bsa-listen-cta-text">
            <span className="bsa-listen-cta-label">Now listen the song</span>
            <span className="bsa-listen-cta-title">Listen to {piece.albumTitle || piece.song}</span>
            <span className="bsa-listen-cta-sub">
              Press play and let “{piece.song}” by {piece.artist} speak for itself.
            </span>
          </span>
          <svg className="bsa-listen-cta-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </Link>
      ) : null}

      {/* ---- More from Backstage --------------------------------------------- */}
      {related.length > 0 ? (
        <section className="bsa-more">
          <div className="bsa-more-header">
            <h2 className="bsa-more-title">More from Backstage</h2>
            <Link href="/backstage" className="bsa-more-all">
              View all →
            </Link>
          </div>
          <div className="bs-grid">
            {related.map((p) => (
              <BackstageCard key={p.slug} piece={p} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}
