'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import AuthHero from '@/components/AuthHero';

const EYE = 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z';
const EYE_OFF = 'M12 7a5 5 0 015 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 003 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 01-5-5c0-.79.2-1.53.53-2.2z';
const Eye = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
  <button type="button" className="auth-eye" onClick={toggle} aria-label={on ? 'Hide password' : 'Show password'}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d={on ? EYE_OFF : EYE} /></svg>
  </button>
);

function ResetInner() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      window.location.href = '/signin?reset=1';
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not reset your password.');
      setLoading(false);
    }
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
            <div className="auth-switch">Set a new password</div>

            {err && <div className="auth-err">{err}</div>}

            {!token ? (
              <div className="auth-err">
                This reset link is missing or malformed. <Link href="/forgot-password" style={{ color: '#f0ad4e' }}>Request a new link.</Link>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="auth-input">
                  <label htmlFor="password">New password</label>
                  <input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={show} toggle={() => setShow(!show)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="confirm">Confirm new password</label>
                  <input id="confirm" type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Reset password'}</button>
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
            <p>&ldquo;Create in me a pure heart, O God, and renew a steadfast spirit within me.&rdquo;</p>
            <cite>Psalm 51:10</cite>
          </div>
        </AuthHero>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="auth-split" />}><ResetInner /></Suspense>;
}
