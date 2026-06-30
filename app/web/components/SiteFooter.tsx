'use client';
import Link from 'next/link';
import { useT } from '@/lib/useT';

export default function SiteFooter() {
  const t = useT();
  return (
    <footer className="site-footer">
      <div className="container">
        <div>
          Copyright &copy; 2026 <strong>JubiLujah.com</strong> &middot; {t('footer.tagline')} &middot;{' '}
          <Link href="/terms">{t('footer.terms')}</Link> &middot; <Link href="/privacy">{t('footer.privacy')}</Link>
        </div>
      </div>
    </footer>
  );
}
