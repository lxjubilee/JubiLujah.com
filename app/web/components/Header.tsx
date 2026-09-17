'use client';
import Link from 'next/link';
import { goSignedIn } from '@/lib/familyGo';
import { usePathname, useRouter } from 'next/navigation';
import { useTenant } from '@/components/TenantProvider';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { usePlayer } from '@/stores/player';
import { getMySubscription } from '@/lib/subscription';
import { useLang, setLangCookie } from '@/lib/useLang';
import { useT } from '@/lib/useT';
import { langName, langFlagUrl, LANGUAGES } from '@/lib/languages';
import type { TKey } from '@/lib/i18n';
import LanguagePanel from './LanguagePanel';

// Primary category nav (second row) now comes from the TENANT, not a constant
// here — goPartyGiggles has no Inspire section to link to and no Christmas one.
// See lib/tenants.ts. `key` is the i18n string key where one exists; a tenant
// link with no translation yet carries a literal `label` instead.

// Cross-property quick links in the top row.
// "AI Bible Chat" (https://www.jubileeinspire.com) was removed at the owner's
// request on 2026-09-16; the kJubilee Radio pill beside the search box replaced
// it as the header's cross-site link. Restore by re-adding the entry here.
const MEDIA: { href: string; key: TKey; ext: boolean }[] = [];

// The radio sibling, as a pill immediately left of the search box (owner,
// 2026-09-16). Lower-case k, capital J and R: "kJubilee Radio". A signed-in reader
// arrives on kJubilee already signed in (goSignedIn, a one-time Jubilee ID ticket).
const KJUBILEE_RADIO = 'https://www.kjubilee.com/';

// Two initials, as kJubilee's circle shows ("Gabriel Ungureanu" → "GU"): one
// letter is not an identity. Falls back to one letter, then the address.
// TWO LETTERS, ALWAYS (owner, 2026-09-17), and the same rule on every family
// site: first + last name; else the first and last words of the display name;
// else the first two letters of a one-word name ("Gabe" -> "GA"); else the
// address before the @ ("gabe.example" -> "GE", "gabe" -> "GA").
function twoInitials(first?: string | null, last?: string | null, name?: string | null, email?: string | null): string {
  const f = String(first || '').trim();
  const l = String(last || '').trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  const single = f || l || words[0] || '';
  if (single.length >= 2) return single.slice(0, 2).toUpperCase();
  const local = String(email || '').split('@')[0].trim();
  const parts = local.split(/[._+-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (local.length >= 2) return local.slice(0, 2).toUpperCase();
  const domain = String(email || '').split('@')[1] || '';
  return ((single || local) + (domain || '?')).slice(0, 2).toUpperCase();
}
function initialsOf(name?: string, email?: string): string {
  return twoInitials('', '', name, email);
}

/*
 * WHEN THE CATEGORIES STOP FITTING, THEY BECOME A HAMBURGER.
 *
 * MEASURED, NOT A BREAKPOINT — and here that is not a refinement, it is the
 * only thing that can work. The labels in this bar are `t('nav.*')` in ONE OF
 * FORTY LANGUAGES, and the tenant decides how many of them there are:
 * JubileePraise carries seven, goPartyGiggles carries three. "CHILDREN MUSIC"
 * is "MUSIQUE POUR ENFANTS" in French. Any width hard-coded today is wrong for
 * some language on some tenant, and wrong SILENTLY — the bar would either fold
 * away while there was room to spare, or run its last category off the edge
 * and never fold at all.
 *
 * So a hidden one-line copy of the same links, in the same class, is measured
 * against the room actually left in row 2 once the tail (Backstage + the flag,
 * which never fold) has taken its share. The copy has to keep existing while
 * collapsed: the real nav is display:none by then, and a bar with nothing to
 * measure could never decide to open back up as the window widens.
 *
 * Ported from kJubilee's `useNavCollapse` (w:/kJubilee.com/app/_site-header.js)
 * so the two properties behave identically. The one difference: kJubilee's nav
 * is written into the DOM by a per-page script, so it needs a MutationObserver
 * to notice; ours is React-rendered, so re-rendering the ghost IS the
 * notification and the ResizeObserver on it catches the new width.
 */
function useNavCollapse() {
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    const ghost = ghostRef.current;
    if (!row || !ghost) return undefined;

    const measure = () => {
      const cs = getComputedStyle(row);
      const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
      const room =
        row.clientWidth
        - parseFloat(cs.paddingLeft || '0')
        - parseFloat(cs.paddingRight || '0')
        - (tailRef.current ? tailRef.current.offsetWidth : 0)
        - gap;
      // The hamburger costs room too, so a bar that only just fits is not left
      // flipping back and forth across a single pixel as the window is dragged.
      setCollapsed(ghost.scrollWidth > room - 8);

      /* Publish where the sticky header stack ENDS, for the panel that hangs
         below it. Computed from the bar's own sticky offset plus its height
         rather than written down as 98px: row 1 is 48px today and the panel
         must not need editing the day it is not. */
      const bar = barRef.current;
      if (bar) {
        const h = Math.ceil(parseFloat(getComputedStyle(bar).top || '0') + bar.offsetHeight);
        if (h) document.documentElement.style.setProperty('--jvh-hdr-h', `${h}px`);
      }
    };

    measure();

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(row);
      ro.observe(ghost);
    }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, []);

  // Nothing may leave the menu open behind the reader — a window dragged wide
  // again puts the links back in the bar, and the panel has to go with them.
  useEffect(() => { if (!collapsed) setOpen(false); }, [collapsed]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return { collapsed, open, setOpen, barRef, rowRef, ghostRef, tailRef };
}

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
  const tenant = useTenant();
  const nav = isPaid ? tenant.nav.filter((n) => n.key !== 'nav.upgrade') : tenant.nav;

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

  /* Admin is NO LONGER a media item. It used to be appended to this run, which
     made it the last link in .jvh-media-links — so it inherited the run's grey
     link styling and picked up a "|" divider in front of it, reading as one
     more cross-property link rather than as the operator control it is.
     kJubilee keeps it out of that run for the same reason: there it is
     .nav-textlink--admin, a gold pill sitting between the text links and the
     search box. It is rendered separately below, immediately before the search
     form, which is that same position. */
  const mediaItems: { href: string; key: TKey; ext: boolean }[] = MEDIA;
  const isAdmin = hasRole('admin');

  const [q, setQ] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);

  // Row 2 folds into a hamburger the moment its categories stop fitting.
  const { collapsed, open: navOpen, setOpen: setNavOpen, barRef, rowRef, ghostRef, tailRef } = useNavCollapse();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (userRef.current && !userRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    // Escape closes it too, as kJubilee's does.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
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
            <img src={tenant.logo} alt={tenant.name} className="jvh-logo-icon" />
            <span className="jvh-logo-text">
              {tenant.brandLead}
              <span className="jvh-logo-praise" style={{ color: tenant.accent }}>{tenant.brandTail}</span>.com
            </span>
          </Link>

          <div className="jvh-actions">
            <nav className="jvh-media-links">
              {mediaItems.map((m, i) => {
                const label = t(m.key);
                return (
                  <span key={m.key} className="jvh-media-item">
                    {m.ext ? (
                      <a href={m.href} target="_blank" rel="noopener noreferrer" onClick={(e) => { void goSignedIn(e, m.href, true); }}>{label}</a>
                    ) : (
                      <Link href={m.href}>{label}</Link>
                    )}
                    {i < mediaItems.length - 1 && <span className="jvh-divider">|</span>}
                  </span>
                );
              })}
            </nav>

            {/* kJubilee Radio: the family's radio site. Opens in a new tab so the
                music here keeps playing. */}
            <a
              href={KJUBILEE_RADIO}
              className="jvh-radio-link"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { void goSignedIn(e, KJUBILEE_RADIO, true); }}
            >
              kJubilee Radio
            </a>

            {/* ADMIN IS ALWAYS THE LAST PILL (owner, 2026-09-17), on every family
                header: after the cross-site pills, immediately left of the search
                box. Outside the media run above so no "|" divider precedes it. */}
            {isAdmin && (
              <Link href="/admin/analytics" className="jvh-admin-link">
                {t('media.admin')}
              </Link>
            )}

            {/* ONE MAGNIFYING GLASS, ON THE RIGHT, AND IT IS THE BUTTON —
                kJubilee's arrangement (.searchbar / .search-go there).

                This row used to say the same thing three times in the tightest
                strip of the header: a decorative glass on the left, "Search..."
                as the placeholder, and a filled "SEARCH" button on the right.
                The filled button is gone at the Founder's request; rather than
                leave the field with no click target, the glass moved to where
                that button was and became the control. The row now reads
                field-then-action instead of icon-field-word.

                Still a real submit <button> with an aria-label: once the visible
                word is gone the accessible name is all a screen reader has, and
                an icon with no name is an unlabelled control. type="submit"
                keeps the form's onSubmit as the single path, so Enter in the
                field and a click on the glass do the same thing. */}
            <form className="jvh-search" onSubmit={submitSearch}>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                autoComplete="off"
                aria-label={t('search.aria')}
              />
              <button type="submit" className="jvh-search-go" aria-label={t('search.aria')} title={t('search.title')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.2-3.2" />
                </svg>
              </button>
            </form>

            {authenticated ? (
              <div className="jvh-profile" ref={userRef}>
                {/* kJubilee's circle and menu (owner, 2026-09-16): two initials;
                    the name and the address on top; "Your Profile" first, this
                    site's own entries after it, Sign out last — all one style. */}
                <button className="jvh-profile-btn" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen}
                  aria-label="Account menu" title={user?.email}>
                  {initialsOf(user?.displayName, user?.email)}
                </button>
                {menuOpen && (
                  <div className="jvh-dropdown open" role="menu">
                    <div className="jvh-dropdown-who">
                      <div className="jvh-dropdown-name">{user?.displayName || user?.email}</div>
                      {user?.email && <div className="jvh-dropdown-email" title={user.email}>{user.email}</div>}
                    </div>
                    <Link href="/account" className="jvh-dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>{t('menu.account')}</Link>
                    <Link href="/account/subscription" className="jvh-dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>{t('menu.subscription')}</Link>
                    <Link href="/liked" className="jvh-dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>{t('menu.liked')}</Link>
                    {hasRole('admin') && (
                      <Link href="/admin" className="jvh-dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>{t('menu.adminConsole')}</Link>
                    )}
                    {hasRole('admin') && (
                      <Link href="/moderation" className="jvh-dropdown-item" role="menuitem" onClick={() => setMenuOpen(false)}>{t('menu.moderation')}</Link>
                    )}
                    <button type="button" className="jvh-dropdown-item" role="menuitem" onClick={() => logout()}>{t('menu.signOut')}</button>
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
      <div className={`jvh-nav-bar${collapsed ? ' is-nav-collapsed' : ''}`} ref={barRef}>
        <div className="jvh-nav-inner" ref={rowRef}>
          {/* FIRST IN THE ROW so it paints on the left — and first in the DOM
              rather than moved there with `order`, because tab order and
              screen-reader order follow the DOM, not the paint. On a phone this
              is the only way into the categories; it must not be the last thing
              a keyboard reaches. display:none until the bar collapses, so it
              costs the wide layout nothing. */}
          <button
            type="button"
            className={`jvh-nav-burger${navOpen ? ' is-open' : ''}`}
            aria-expanded={navOpen ? 'true' : 'false'}
            aria-controls="jvh-nav-panel"
            aria-label={t('nav.menu')}
            onClick={() => setNavOpen((v) => !v)}
          >
            <span className="jvh-nav-burger-bars" aria-hidden="true">
              <span /><span /><span />
            </span>
            <span className="jvh-nav-burger-label">{t('nav.menu')}</span>
          </button>

          <nav className="jvh-nav-menu">
            {nav.map((n) => (
              <Link key={n.href + (n.key || n.label)} href={n.href} className={`jvh-nav-link${isActive(n.href) ? ' active' : ''}`}>
                {n.key ? t(n.key as TKey) : n.label}
              </Link>
            ))}
          </nav>

          {/* THE RULER. Off-canvas rather than display:none — a box that is not
              laid out has no width to measure. Inert: aria-hidden, unfocusable
              spans, pointer-events:none in the CSS. It carries .jvh-nav-link so
              the widths it reports are the real widths, and it keeps rendering
              while collapsed so the bar can decide to unfold again. */}
          <div className="jvh-nav-measure" aria-hidden="true" ref={ghostRef}>
            {nav.map((n) => (
              <span key={n.href + (n.key || n.label)} className="jvh-nav-link">
                {n.key ? t(n.key as TKey) : n.label}
              </span>
            ))}
          </div>

          {/* Right side of the nav row: Backstage, then the language flag.
              This is the tail — it never folds, so the measurement above
              subtracts it as room already spoken for. */}
          <div className="jvh-nav-right" ref={tailRef}>
            <Link
              href="/backstage"
              className={`jvh-backstage${isActive('/backstage') ? ' active' : ''}`}
            >
              {t('nav.backstage')}
            </Link>

            {/* Language picker trigger — right-justified on the nav row (JubileeVerse-style) */}
            {showLangPicker && (
              <button className="jvh-lang-btn" onClick={() => setLangOpen(true)} title={t('lang.choose')} aria-label={t('lang.choose')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="jvh-lang-flag" src={langFlagUrl(lang)} alt={langName(lang)} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* The folded-away categories. Full width under the bar rather than a
          narrow dropdown: these are the things the site is for, on the screen
          where they had to be folded, and they should still be a list you can
          hit with a thumb. It tucks UNDER the sticky header (z-index below both
          rows) so the reader can still see the control they just pressed. */}
      {collapsed && navOpen ? (
        <>
          <div className="jvh-nav-overlay" onClick={() => setNavOpen(false)} />
          <nav className="jvh-nav-panel" id="jvh-nav-panel" aria-label={t('nav.menu')}>
            {nav.map((n) => (
              <Link
                key={n.href + (n.key || n.label)}
                href={n.href}
                className={`jvh-nav-panel-link${isActive(n.href) ? ' active' : ''}`}
                {...(isActive(n.href) ? { 'aria-current': 'page' as const } : {})}
                onClick={() => setNavOpen(false)}
              >
                {n.key ? t(n.key as TKey) : n.label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}

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
