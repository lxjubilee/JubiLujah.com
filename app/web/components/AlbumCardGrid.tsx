'use client';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import { useLang } from '@/lib/useLang';
import { albumVisibleInLang, albumBcp47 } from '@/lib/languages';

// A grid of text "entity-card" album tiles (artist profile, search results).
// Like MediaRow, it hides in-production ("studio") albums from signed-out
// visitors and plain viewers — only admins/reviewers see them. It ALSO hides
// albums without a published cover image from everyone except admins (matching
// the cover gate on the browse-grid pages). Filtering runs client-side, so the
// server render and a guest's session show READY + cover-published only.
export interface AlbumCard {
  code: string;
  title: string;
  status: 'ready' | 'studio';
  subtitle?: string; // optional second line, e.g. the artist name on search
  hasCover?: boolean; // false => cover-less; shown to admins only
}

export default function AlbumCardGrid({
  items,
  heading,
  headingStyle,
  emptyText,
}: {
  items: AlbumCard[];
  heading?: string;
  headingStyle?: CSSProperties;
  emptyText?: string;
}) {
  const { canSeeStudio, hasRole } = useAuth();
  const lang = useLang();
  let visible = canSeeStudio ? items : items.filter((a) => a.status === 'ready');
  if (!hasRole('admin')) visible = visible.filter((a) => a.hasCover !== false);
  // Language gate: default English site hides foreign-language translations.
  visible = visible.filter((a) => albumVisibleInLang(a.code, lang));

  if (!visible.length) return emptyText ? <p className="notice">{emptyText}</p> : null;

  return (
    <>
      {heading && <h2 className="section-title" style={headingStyle}>{heading}</h2>}
      <div className="card-grid">
        {visible.map((al) => (
          <Link key={al.code} href={`/album?c=${al.code}`} className={`entity-card${al.status === 'studio' && canSeeStudio ? ' entity-card--studio' : ''}`}>
            <h3 lang={albumBcp47(al.code)}>{al.title}</h3>
            {al.subtitle && <div className="role">{al.subtitle}</div>}
            <div className="meta">
              <span className="muted">{al.code}</span>
              <span className={`status-pill ${al.status}`}>{al.status === 'ready' ? 'Ready' : 'Studio'}</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
