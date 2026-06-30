'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import AuthHero from '@/components/AuthHero';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Always show the same confirmation (anti-enumeration) — even on error, so
    // timing/HTTP status never reveals whether the account exists.
    try { await api.post('/api/auth/forgot-password', { email }); } catch { /* ignore */ }
    setSent(true);
    setLoading(false);
  };

  return (
    <>
      <div className="auth-topbar" />
      <div className="auth-split">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-avatar" src="/images/brand-logo.png" alt="" />
            <div className="auth-brand"><span className="b1">JubiLujah</span><span className="b2">.com</span></div>
            <div className="auth-switch">Remembered it? <Link href="/signin">Sign In.</Link></div>

            {sent ? (
              <div className="auth-err" style={{ borderColor: '#1f9d57', color: '#bfe6cf' }}>
                If an account exists for that email, we&apos;ve sent a reset link. Check your inbox (and spam).
              </div>
            ) : (
              <form onSubmit={submit}>
                <p className="auth-foot" style={{ marginBottom: 14 }}>
                  Enter your account email and we&apos;ll send you a link to reset your password.
                </p>
                <div className="auth-input">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
              </form>
            )}

            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <Link className="auth-foot" style={{ color: '#f0ad4e' }} href="/signin">&larr; Back to sign in</Link>
            </div>
          </div>
          <div className="auth-foot">© 2026 JubiLujah.com</div>
        </div>

        <AuthHero>
          <div className="auth-hero-quote">
            <p>&ldquo;Come to me, all you who are weary and burdened, and I will give you rest.&rdquo;</p>
            <cite>Matthew 11:28</cite>
          </div>
        </AuthHero>
      </div>
    </>
  );
}
