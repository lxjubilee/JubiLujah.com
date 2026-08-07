'use client';
// Artist selector — spec §3. The 12 Inspire musical personas as multi-select
// cards. Default: all eligible selected. Floor of one (deselecting the last is
// blocked with an inline message). Every change re-shuffles upstream. On mobile
// it collapses into a bottom sheet toggled from the playlist header.
import { useState } from 'react';
import type { EligiblePersona } from '@/lib/themePlaylist';

// Genre anchor per persona (spec §3.4 card shows the anchor). Mirrors
// lib/genres.ts PERSONA_GENRE; kept inline so the client bundle stays lean.
const ANCHOR: Record<string, string> = {
  'jubilee-inspire': 'Worship', 'melody-inspire': 'Bridal Worship', 'zariah-inspire': 'Intercession',
  'elias-inspire': 'Declaration', 'eliana-inspire': 'Morning Worship', 'caleb-inspire': 'Breakthrough',
  'imani-inspire': 'Gospel Soul', 'zev-inspire': 'Hebrew Worship', 'amir-inspire': 'Levantine Worship',
  'nova-inspire': 'Pop Worship', 'santiago-inspire': 'Latin Worship', 'tahoma-inspire': 'Cinematic Worship',
};

export function personaName(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function ArtistSelector({
  personas, selected, onChange,
}: {
  personas: EligiblePersona[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const sel = new Set(selected);

  function toggle(slug: string) {
    if (sel.has(slug)) {
      if (sel.size <= 1) { // §3.3 floor of one
        setNotice('Keep at least one artist — a playlist needs a voice.');
        setTimeout(() => setNotice(null), 2600);
        return;
      }
      sel.delete(slug);
    } else {
      sel.add(slug);
    }
    onChange(personas.map((p) => p.slug).filter((s) => sel.has(s)));
  }

  const allSlugs = personas.map((p) => p.slug);
  const allOn = selected.length === personas.length;

  return (
    <div className="tpl-artists" aria-label="Choose artists">
      <div className="tpl-artists-head">
        <span className="tpl-artists-title">Artists</span>
        <div className="tpl-artists-actions">
          <button type="button" className="tpl-chip" disabled={allOn} onClick={() => onChange(allSlugs)}>Select all</button>
          <button type="button" className="tpl-chip" onClick={() => onChange(allSlugs)}>Reset to default</button>
        </div>
      </div>
      {notice && <p className="tpl-artists-notice" role="status">{notice}</p>}
      <ul className="tpl-artist-grid">
        {personas.map((p) => {
          const on = sel.has(p.slug);
          return (
            <li key={p.slug}>
              <button
                type="button"
                className={`tpl-artist-card${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(p.slug)}
                title={`${personaName(p.slug)} · ${ANCHOR[p.slug] || ''} · ${p.count} tracks`}
              >
                <span className="tpl-artist-art" style={p.image ? { backgroundImage: `url(${p.image})` } : undefined}>
                  {!p.image && <span className="tpl-artist-initial">{personaName(p.slug).charAt(0)}</span>}
                  <span className="tpl-artist-check" aria-hidden>{on ? '✓' : ''}</span>
                </span>
                <span className="tpl-artist-name">{personaName(p.slug)}</span>
                <span className="tpl-artist-anchor">{ANCHOR[p.slug] || ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
