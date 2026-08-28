'use client';

import { memo } from 'react';
import Link from 'next/link';
import { CelestialArt } from '@/components/torahsings/system/CelestialArt';
import { artUrl, hasAudio, type CatalogAlbum } from '@/lib/torahsings/angels';
import { useHoverPreview } from './HoverPreview';
import styles from './CatalogAlbumTile.module.css';

/**
 * A square catalog tile in the JubileePraise "nf-tile" style: a cover image with its
 * title on a dark gradient. Hovering (or focusing) a tile opens the shared
 * "nf-preview" popup (HoverPreview.tsx) with the enlarged art and controls.
 * Clicking a tile navigates to the album's details page (/album/CODE); playback
 * starts from there or from the popup's play button.
 *
 * Memoised, so a category of ~100 tiles never re-renders while a song is playing
 * or a popup opens elsewhere.
 */
function CatalogAlbumTileBase({ album }: { album: CatalogAlbum }) {
  const preview = useHoverPreview();
  const playable = hasAudio(album);

  return (
    <Link
      href={`/album/${album.code}`}
      className={styles.tile}
      data-audio={playable ? 'yes' : 'no'}
      title={album.title}
      aria-label={album.title}
      onMouseEnter={(e) => preview?.show(album, e.currentTarget)}
      onMouseLeave={() => preview?.hide()}
      onFocus={(e) => preview?.show(album, e.currentTarget)}
      onBlur={() => preview?.hide()}
    >
      {/* Cover only — the title/book now lives on the hover preview card. */}
      {album.art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={artUrl(album.art)} alt="" loading="lazy" decoding="async" />
      ) : (
        <CelestialArt
          className={styles.art}
          seed={album.code}
          hue={album.hue}
          topic={album.book}
          glyph={album.glyph}
          ratio="1 / 1"
        />
      )}
    </Link>
  );
}

export const CatalogAlbumTile = memo(CatalogAlbumTileBase);
