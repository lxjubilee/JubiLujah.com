import Link from 'next/link';
import type { BackstagePiece } from '@/lib/backstage';
import BackstageCardImage from '@/components/BackstageCardImage';

// Article card for the Backstage grid. Markup mirrors JubileeVerse's home-page
// StoryCard (image over a body with a gold uppercase category, title and meta)
// so the two properties read as one family; the `bs-card-*` classes in
// globals.css are the JubileeVerse `content-card` rules under a namespace of
// our own.
//
// The image slot is 16:9 — the ratio every Backstage image prompt now renders
// at (core/backstage/README.md §8.1). Until those images exist, `cover` is the
// album's square cover, cropped to fill; a piece whose album has no cover at
// all falls back to a plain panel carrying the song name.
export default function BackstageCard({ piece, wide = false }: { piece: BackstagePiece; wide?: boolean }) {
  return (
    <Link href={`/backstage/${piece.slug}`} className={`bs-card${wide ? ' bs-card-wide' : ''}`}>
      <BackstageCardImage slug={piece.slug} src={piece.cover} song={piece.song} />
      <div className="bs-card-body">
        <span className="bs-card-category">{piece.format}</span>
        <h3 className="bs-card-title">{piece.title}</h3>
        <div className="bs-card-meta">
          <span>{piece.artist}</span>
          <span className="bs-card-dot">·</span>
          <span className="bs-card-song">{piece.song}</span>
        </div>
      </div>
    </Link>
  );
}
