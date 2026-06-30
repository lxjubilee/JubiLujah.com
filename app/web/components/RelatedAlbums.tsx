'use client';
import Link from 'next/link';
import AlbumCover from './AlbumCover';

// "More from this artist" grid shown on the album detail page.
export default function RelatedAlbums({ artistName, albums }: { artistName: string; albums: { code: string; title: string }[] }) {
  if (!albums.length) return null;
  return (
    <section className="standard">
      <div className="container">
        <h2 className="section-title">More from {artistName}</h2>
        <div className="related-grid">
          {albums.map((a) => (
            <Link key={a.code} href={`/album?c=${a.code}`} className="related-card">
              <AlbumCover code={a.code} title={a.title} sizes="180px" />
              <div className="related-title">{a.title}</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
