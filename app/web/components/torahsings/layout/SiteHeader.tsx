'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useJubileeAccount } from '@/lib/torahsings/jubilee-account';
import { useTenant } from '@/components/TenantProvider';
import { useT } from '@/lib/useT';
import type { TKey } from '@/lib/i18n';
import styles from './SiteHeader.module.css';

// The nav — the three prongs, then membership — is NOT declared here. It lives
// in the tenant registry (lib/tenants.ts) alongside every other property's, so
// there is one list to change and one place to read it. Items carry either an
// i18n `key` (translated, like JubileePraise's own nav) or a literal `label` for
// the links that have no translation yet; this resolves them the same way
// components/Header.tsx does.

/** The ecosystem's AI Bible Chat (same destination JubileePraise links to). */
const AI_BIBLE_CHAT_URL = 'https://www.jubileeinspire.com';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/album');
  return pathname.startsWith(href);
}

/**
 * Two-row header, JubileePraise-style. Top bar: logo, then the AI Bible Chat link,
 * a search bar, Sign in, and Subscribe. Nav bar beneath scrolls horizontally
 * rather than wrapping, so it stays one clean line at any zoom or width.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, status, signOut, isAdmin } = useJubileeAccount();
  const tenant = useTenant();
  const t = useT();
  const [query, setQuery] = useState('');

  const signedIn = status === 'ready' && session !== null;

  return (
    <header className={styles.header}>
      {/* Row 1 — logo · AI Bible Chat · search · account actions */}
      <div className={styles.topbar}>
        <div className={`wrap ${styles.topInner}`}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.icon} src="/zev-circle.png" alt="" width={34} height={34} aria-hidden="true" />
            <span className={styles.text}>
              Torah<span className={styles.accent}>Sings</span>.com
            </span>
          </Link>

          <div className={styles.actions}>
            <a
              className={styles.medialink}
              href={AI_BIBLE_CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              AI Bible Chat
            </a>

            {/* Admins only. Rendered after `status === 'ready'` so it appears
                once, on a known session, rather than flickering in on load. */}
            {signedIn && isAdmin && (
              <Link className={`${styles.medialink} ${styles.adminlink}`} href="/admin">
                Admin
              </Link>
            )}

            <form
              className={styles.search}
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = query.trim();
                if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
              }}
            >
              <svg
                className={styles.searchIcon}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                className={styles.searchInput}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search albums…"
                aria-label="Search the catalog"
                autoComplete="off"
              />
              <button type="submit" className={styles.searchBtn}>
                SEARCH
              </button>
            </form>

            {signedIn && session ? (
              <AccountMenu name={session.displayName} email={session.email} onSignOut={signOut} />
            ) : (
              <Link href="/signin" className={styles.signin}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Row 2 — primary navigation (scrolls sideways, never wraps) */}
      <div className={styles.navbar}>
        <nav className={`wrap ${styles.navInner}`} aria-label="Primary">
          {tenant.nav.map((item) => (
            <Link
              key={item.href + (item.key || item.label)}
              href={item.href}
              className={[styles.link, isActive(pathname, item.href) ? styles.active : ''].filter(Boolean).join(' ')}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
            >
              {item.key ? t(item.key as TKey) : item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

/**
 * Signed-in account control, JubileePraise-style: the initial in a gold disc, which
 * opens a dropdown card of account destinations.
 *
 * Only routes that exist here are listed. JubileePraise's menu also carries Liked
 * albums / Admin console / Review moderation; TorahSings has no such pages yet,
 * and linking to a 404 is worse than omitting the row. Add them here (behind a
 * role check, for the two admin ones) when those routes land.
 */
function AccountMenu({ name, email, onSignOut }: { name: string; email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initial = (name || email || '?').trim().charAt(0).toUpperCase();

  // Dismiss on outside click or Escape — bound only while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.account} ref={ref}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {initial}
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHead}>
            <div className={styles.menuName}>{name}</div>
            <div className={styles.menuEmail}>{email}</div>
          </div>

          <div className={styles.menuList}>
            <Link href="/account" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              Account
            </Link>
            <Link href="/liked" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              Liked albums
            </Link>
            <Link href="/playlists" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              Playlists
            </Link>
            <Link href="/membership" className={styles.menuItem} role="menuitem" onClick={() => setOpen(false)}>
              My subscription
            </Link>
            <button
              type="button"
              className={`${styles.menuItem} ${styles.menuSignout}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
