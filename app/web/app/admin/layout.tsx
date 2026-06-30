'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';

const TABS = [
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/active-listeners', label: 'Active Listeners' },
  { href: '/admin', label: 'Overview' },
  { href: '/admin/music', label: 'Manage Music' },
  { href: '/admin/publish-to-production', label: 'Publish to Production' },
  { href: '/admin/pipeline', label: 'Pipeline' },
  { href: '/admin/awards', label: 'Awards' },
  { href: '/admin/production-history', label: 'Production History' },
  { href: '/admin/languages', label: 'Languages' },
  { href: '/admin/subscribers', label: 'Subscribers' },
  { href: '/admin/users', label: 'Users & Roles' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, hasRole } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !authenticated) {
      window.location.href = `/signin?returnTo=${encodeURIComponent(pathname)}`;
    }
  }, [loading, authenticated, pathname]);

  if (loading) return <section className="standard"><div className="container"><p className="notice">Checking access…</p></div></section>;
  if (!authenticated) return <section className="standard"><div className="container"><p className="notice">Redirecting to sign in…</p></div></section>;
  if (!hasRole('admin')) {
    return (
      <section className="standard"><div className="container">
        <h1>Admin</h1>
        <p className="notice">Access denied — the admin console requires the <code>admin</code> role.</p>
      </div></section>
    );
  }

  return (
    <section className="standard">
      <div className="container">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Left — Operations Console label + vertical nav menu */}
          <nav style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            flex: '0 0 200px', maxWidth: 200,
            borderRight: '1px solid var(--line)', paddingRight: 12,
            // Pin the menu below the sticky site header (48px brand + 50px nav)
            // so only the right detail content scrolls.
            position: 'sticky', top: 98, alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 110px)', overflowY: 'auto',
          }}>
            <div className="eyebrow" style={{ color: 'var(--accent)', padding: '0 14px 10px', fontWeight: 700 }}>Operations Console</div>
            {TABS.map((t) => {
              const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
              return (
                <Link key={t.href} href={t.href} style={{
                  padding: '10px 14px', textDecoration: 'none', fontWeight: 600, fontSize: 13, borderRadius: 6,
                  color: active ? 'var(--accent-gold)' : 'var(--ink-soft)',
                  background: active ? 'var(--surface)' : 'transparent',
                  borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
                }}>{t.label}</Link>
              );
            })}
          </nav>
          {/* Right — selected section content */}
          <div className="admin-detail" style={{ flex: '1 1 320px', minWidth: 0 }}>{children}</div>
        </div>
      </div>
    </section>
  );
}
