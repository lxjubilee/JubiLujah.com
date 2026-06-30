'use client';
import Image from 'next/image';
import { useState } from 'react';

// Square album cover served from the local /cover route (optimized by next/image),
// with a gradient + title fallback when artwork is missing. `version` (when the
// cover was admin-replaced) busts the cache. The admin "replace cover" badge lives
// only in the large hover-preview popup (see HoverTile), not here.
export default function AlbumCover({ code, title, sizes = '200px', version }: { code: string; title: string; sizes?: string; version?: number }) {
  const [broken, setBroken] = useState(false);
  const src = `/cover/${code}.png${version ? `?v=${version}` : ''}`;
  return (
    <div className="album-cover">
      {!broken
        ? <Image src={src} alt={title} fill sizes={sizes} style={{ objectFit: 'cover' }} onError={() => setBroken(true)} />
        : <span className="album-cover-fallback"><span className="nf-cover-name">{title}</span></span>}
    </div>
  );
}
