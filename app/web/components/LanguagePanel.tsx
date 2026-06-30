'use client';
import { useMemo, useState } from 'react';
import { DEFAULT_LANG, type Lang } from '@/lib/languages';
import { useT } from '@/lib/useT';

interface Props {
  open: boolean;
  currentLang: string;
  languages: Lang[];
  onClose: () => void;
  onSelect: (code: string) => void;
}

const flagUrl = (cc: string) => `https://flagcdn.com/w80/${cc}.png`;

// Right slide-out language picker, mirroring JubileeVerse.com / JubileeInspire.com:
// an overlay + drawer with a search box, a "Recently used" row (the current
// language) and the full "All languages" list. Picking a language sets the
// jv_lang cookie and reloads Home in that language (handled by onSelect).
export default function LanguagePanel({ open, currentLang, languages, onClose, onSelect }: Props) {
  const [filter, setFilter] = useState('');
  const t = useT();

  const current = useMemo(
    () => languages.find((l) => l.code === currentLang) || languages[0],
    [languages, currentLang],
  );

  // English pinned at the top, everything else alphabetical by name (A→Z).
  const sorted = useMemo(
    () => [...languages].sort((a, b) => {
      if (a.code === DEFAULT_LANG) return -1;
      if (b.code === DEFAULT_LANG) return 1;
      return a.name.localeCompare(b.name);
    }),
    [languages],
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q),
    );
  }, [sorted, filter]);

  return (
    <>
      <div className={`lang-panel-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`lang-panel${open ? ' open' : ''}`} aria-hidden={!open} role="dialog" aria-label="Languages">
        <div className="lang-panel-header">
          <h3>{t('lang.title')}</h3>
          <button className="lang-panel-close" onClick={onClose} title="Close" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="lang-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="lang-search"
            placeholder={t('lang.search')}
            autoComplete="off"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="lang-options">
          {!filter && current && (
            <>
              <div className="lang-section-label">{t('lang.recentlyUsed')}</div>
              <div className="lang-option active" onClick={() => onSelect(current.code)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="lang-option-flag" src={flagUrl(current.cc)} alt={current.name} loading="lazy" />
                <span>{current.name}</span>
              </div>
              <div className="lang-section-label">{t('lang.allLanguages')}</div>
            </>
          )}
          {filtered.length === 0 ? (
            <div className="lang-no-results">{t('lang.noResults')}</div>
          ) : (
            filtered.map((lang) => (
              <div
                key={lang.code}
                className={`lang-option${lang.code === currentLang ? ' active' : ''}`}
                onClick={() => onSelect(lang.code)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="lang-option-flag" src={flagUrl(lang.cc)} alt={lang.name} loading="lazy" />
                <span>{lang.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
