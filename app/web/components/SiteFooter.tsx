'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/lib/useT';

export default function SiteFooter() {
  const t = useT();
  // No footer on Now Playing (owner, 2026-09-16): that page fits the screen
  // between the header and the player bar, with nothing to scroll to.
  if (usePathname() === '/now-playing') return null;
  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          Copyright &copy; 2026 <strong>JubileePraise.com</strong> &middot; {t('footer.tagline')} &middot;{' '}
          <Link href="/terms">{t('footer.terms')}</Link> &middot; <Link href="/privacy">{t('footer.privacy')}</Link>
        </div>
      </div>
    </footer>
  );
}
