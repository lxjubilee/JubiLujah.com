'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePlayer } from '@/stores/player';

// ============================================================================
// /now-playing: the album on the footer bar, large, in the middle of the screen.
//
// Nothing here owns playback. The <audio> element and every control live in the
// footer player (components/FooterPlayer.tsx), which stays underneath this page.
//
// 🔴 THE COVER AND ONE SENTENCE, NOTHING ELSE (owner, 2026-09-16, second pass).
//   · No transport, progress bar or like/favorite: "remove this player from the
//     page itself because it's already in the footer. We don't need it twice."
//   · No Up Next list: it made the page read as a loaded playlist, when what is
//     playing is an album.
//   · No song title or artist line: the cover art already carries both. Under it,
//     the album's own description (lib/albumDescriptions.ts).
//   · The cover is the way back to the album page.
//   · No site footer and no scrolling: the page fits between the header and the
//     player bar (SiteFooter hides itself here; see now-playing.css).
// ============================================================================

const NOTE = 'M12 3v10.55A4 4 0 1014 17V7h4V3h-6z';
const Note = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true"><path d={NOTE} /></svg>
);

/** The album code in a song's album link, "/album?c=JEIM1043EN" -> "JEIM1043EN". */
function albumCodeOf(href?: string | null): string {
  if (!href) return '';
  const m = /[?&](?:c|code)=([A-Za-z0-9]+)/.exec(href);
  return m ? m[1].toUpperCase() : '';
}

const aboutCache = new Map<string, Promise<string>>();
function aboutAlbum(code: string): Promise<string> {
  let p = aboutCache.get(code);
  if (!p) {
    p = fetch(`/now-playing/about?c=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { description?: string } | null) => d?.description || '')
      .catch(() => '');
    aboutCache.set(code, p);
  }
  return p;
}

export default function NowPlayingView() {
  const song = usePlayer((s) => s.nowPlaying);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const code = albumCodeOf(song?.href);
  const [about, setAbout] = useState<{ code: string; text: string }>({ code: '', text: '' });

  useEffect(() => {
    if (!code) return;
    let live = true;
    aboutAlbum(code).then((text) => { if (live) setAbout({ code, text }); });
    return () => { live = false; };
  }, [code]);

  if (!song) {
    return (
      <section className="np-stage np-empty">
        <div className="np-empty-inner">
          <div className="np-empty-glyph"><Note size={44} /></div>
          <h1 className="np-title">Nothing is playing yet</h1>
          <p className="np-sub">Press play on the bar below, or pick any album.</p>
          <div className="np-links">
            <Link href="/" className="np-link">Browse Albums</Link>
          </div>
        </div>
      </section>
    );
  }

  const art = song.cover || null;
  const cover = art
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={art} alt={song.album ? `${song.album} cover` : ''} />
    : <div className="np-cover-blank"><Note size={64} /></div>;
  const description = about.code === code ? about.text : '';

  return (
    <section className={`np-stage${isPlaying ? ' is-playing' : ''}`}>
      {art && <div className="np-backdrop" style={{ backgroundImage: `url('${art}')` }} aria-hidden="true" />}
      <div className="np-veil" aria-hidden="true" />

      <div className="np-center">
        {song.href
          ? <Link href={song.href} className="np-cover" title={song.album ? `Open ${song.album}` : 'Open the album'}>{cover}</Link>
          : <div className="np-cover">{cover}</div>}
        {/* Always in the layout, so the cover does not jump when the sentence arrives. */}
        <p className={`np-desc${description ? ' is-in' : ''}`}>{description || ' '}</p>
      </div>
    </section>
  );
}
