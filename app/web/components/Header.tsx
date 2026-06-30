'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { usePlayer } from '@/stores/player';
import { getMySubscription } from '@/lib/subscription';
import { useLang, setLangCookie } from '@/lib/useLang';
import { useT } from '@/lib/useT';
import { langName, langFlagUrl, LANGUAGES } from '@/lib/languages';
import type { TKey } from '@/lib/i18n';
import LanguagePanel from './LanguagePanel';

// Primary category nav (second row). Matches JubileeVerse's nav-bar treatment.
// `key` is the i18n string key (labels are translated to the chosen language).
const NAV: { href: string; key: TKey }[] = [
  { href: '/', key: 'nav.home' },
  { href: '/inspire', key: 'nav.inspire' },
  { href: '/children', key: 'nav.children' },
  { href: '/general', key: 'nav.family' },
  { href: '/music-type', key: 'nav.musicType' },
  { href: '/christmas', key: 'nav.christmas' },
  { href: '/playlists', key: 'nav.playlists' },
  { href: '/subscription', key: 'nav.upgrade' },
];

// Cross-property quick links in the top row.
const MEDIA: { href: string; key: TKey; ext: boolean }[] = [
  { href: 'https://www.jubileeverse.com', key: 'media.articles', ext: true },
  { href: 'https://www.jubileeinspire.com', key: 'media.bibleChat', ext: true },
];

export default function Header({ defaultMusicHref, langWithContent = [] }: { defaultMusicHref: string; langWithContent?: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated, user, hasRole, logout } = useAuth();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Once a user has a PAID subscription, the "UPGRADE" link is removed from the
  // category bar — it relocates to the My Subscription page (MySubscription.tsx).
  // Free / signed-out users keep it in the nav.
  const [isPaid, setIsPaid] = useState(false);
  useEffect(() => {
    if (!authenticated) { setIsPaid(false); return; }
    let cancelled = false;
    getMySubscription()
      .then((r) => { if (!cancelled) setIsPaid(!!r.entitlement?.isPaid); })
      .catch(() => { /* default to free → keep the link */ });
    return () => { cancelled = true; };
  }, [authenticated]);

  // The category nav stays fully available in every language — labels are
  // translated via t(). Paid users drop the "UPGRADE" link (it moves to the My
  // Subscription page).
  const lang = useLang();
  const t = useT();
  const nav = isPaid ? NAV.filter((n) => n.key !== 'nav.upgrade') : NAV;

  // Language picker (right slide-out, JubileeVerse/JubileeInspire-style). The flag
  // trigger + full language list are shown to EVERYONE, signed in or not.
  const [langOpen, setLangOpen] = useState(false);
  const visibleLangs = LANGUAGES;
  const showLangPicker = true;
  const pickLang = (code: string) => {
    setLangCookie(code);
    window.location.assign('/'); // refresh to Home in the chosen language
  };

  // "Music" link → the page where music is currently playing (now-playing track's
  // source page). If nothing has started yet, fall back to the first Jubilee
  // Inspire album resolved server-side in the layout.
  const nowPlayingHref = usePlayer((s) => s.nowPlaying?.href);
  const musicHref = nowPlayingHref || defaultMusicHref;

  // Append an "Admin" link as the LAST media item — admins only (BRD: navigation).
  const mediaItems: { href: string; key: TKey; ext: boolean }[] = hasRole('admin')
    ? [...MEDIA, { href: '/admin/analytics', key: 'media.admin', ext: false }]
    : MEDIA;

  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <>
      {/* Row 1 — brand, media links, search, auth */}
      <header className="jvh-header">
        <div className="jvh-inner">
          <Link href="/" className="jvh-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/brand-logo.png" alt="JubiLujah" className="jvh-logo-icon" />
            <span className="jvh-logo-text">
              Jubi<span className="jvh-logo-lujah">Lujah</span>.com
            </span>
          </Link>

          <div className="jvh-actions">
            <nav className="jvh-media-links">
              {mediaItems.map((m, i) => {
                const label = t(m.key);
                return (
                  <span key={m.key} className="jvh-media-item">
                    {m.ext ? (
                      <a href={m.href} target="_blank" rel="noopener noreferrer">{label}</a>
                    ) : (
                      <Link href={m.href}>{label}</Link>
                    )}
                    {i < mediaItems.length - 1 && <span className="jvh-divider">|</span>}
                  </span>
                );
              })}
            </nav>

            <form className="jvh-search" onSubmit={submitSearch}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                autoComplete="off"
                aria-label={t('search.aria')}
              />
              <button type="submit" className="jvh-search-btn">{t('search.button')}</button>
            </form>

            {authenticated ? (
              <div className="jvh-profile" ref={userRef}>
                <button className="jvh-profile-btn" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="true" aria-expanded={menuOpen}>
                  {(user?.displayName || '?').charAt(0).toUpperCase()}
                </button>
                {menuOpen && (
                  <div className="jvh-dropdown open">
                    <div className="jvh-dropdown-name">{user?.displayName}</div>
                    <Link href="/account" className="jvh-dropdown-item" onClick={() => setMenuOpen(false)}>{t('menu.account')}</Link>
                    <Link href="/account/subscription" className="jvh-dropdown-item" onClick={() => setMenuOpen(false)}>{t('menu.subscription')}</Link>
                    <Link href="/liked" className="jvh-dropdown-item" onClick={() => setMenuOpen(false)}>{t('menu.liked')}</Link>
                    {hasRole('admin') && (
                      <Link href="/admin" className="jvh-dropdown-item" onClick={() => setMenuOpen(false)}>{t('menu.adminConsole')}</Link>
                    )}
                    {hasRole('admin') && (
                      <Link href="/moderation" className="jvh-dropdown-item" onClick={() => setMenuOpen(false)}>{t('menu.moderation')}</Link>
                    )}
                    <button className="jvh-dropdown-item" onClick={() => logout()}>{t('menu.signOut')}</button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/signin" className="jvh-sign-in">{t('auth.signIn')}</Link>
            )}
          </div>
        </div>
      </header>

      {/* Row 2 — category nav (collapses to HOME (<LANGUAGE>) in other languages) */}
      <div className="jvh-nav-bar">
        <div className="jvh-nav-inner">
          <nav className="jvh-nav-menu">
            {nav.map((n) => (
              <Link key={n.href + n.key} href={n.href} className={`jvh-nav-link${isActive(n.href) ? ' active' : ''}`}>
                {t(n.key)}
              </Link>
            ))}
          </nav>

          {/* Language picker trigger — right-justified on the nav row (JubileeVerse-style) */}
          {showLangPicker && (
            <button className="jvh-lang-btn" onClick={() => setLangOpen(true)} title={t('lang.choose')} aria-label={t('lang.choose')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="jvh-lang-flag" src={langFlagUrl(lang)} alt={langName(lang)} />
            </button>
          )}
        </div>
      </div>

      {/* Slide-out language picker (triggered by the header flag button) */}
      {showLangPicker && (
        <LanguagePanel
          open={langOpen}
          currentLang={lang}
          languages={visibleLangs}
          onClose={() => setLangOpen(false)}
          onSelect={pickLang}
        />
      )}
    </>
  );
}
