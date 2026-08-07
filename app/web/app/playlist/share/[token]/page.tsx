'use client';
// Recipient view for a sent playlist — spec §14.2. Resolves the share token to
// its theme + note + artist selection and plays inside the ecosystem. No account
// is required to listen (account creation is offered elsewhere, never forced).
import { useEffect, useState } from 'react';
import ThemePlaylistApp from '@/components/ThemePlaylistApp';
import { getShare, type SharedPlaylist, type Arc } from '@/lib/themePlaylist';

export default function SharePage({ params }: { params: { token: string } }) {
  const [share, setShare] = useState<SharedPlaylist | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getShare(params.token).then((s) => { if (!cancelled) setShare(s); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [params.token]);

  if (error) {
    return (
      <section className="tpl-hero">
        <div className="tpl-hero-inner">
          <h1 className="tpl-title">This link isn’t available</h1>
          <p className="tpl-statement">The shared playlist may have expired or the link is incomplete.</p>
          <p className="tpl-meta"><a className="tpl-btn" href="/playlists">Browse playlists</a></p>
        </div>
      </section>
    );
  }
  if (!share) {
    return <section className="tpl-hero"><div className="tpl-hero-inner"><p className="tpl-meta">Opening the playlist…</p></div></section>;
  }

  return (
    <ThemePlaylistApp
      themeId={share.themeId}
      initial={{
        name: 'Shared playlist', statement: '', accent: null, heroImage: null,
        supportedArcs: (share.arc ? [share.arc] : ['steady']) as Arc[],
        defaultArc: (share.arc || 'steady') as Arc, targetTrackCount: 120,
      }}
      shared={{ personas: share.personas, language: share.language, arc: share.arc, note: share.note, senderName: share.senderName }}
    />
  );
}
