'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import MyContributions from '@/components/MyContributions';
import { api, ApiError } from '@/lib/api';
import { getRefreshToken, clearTokens } from '@/lib/auth';

const EYE = 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z';
const EYE_OFF = 'M12 7a5 5 0 015 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 003 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 01-5-5c0-.79.2-1.53.53-2.2z';
const Eye = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
  <button type="button" className="acct-eye" onClick={toggle} aria-label={on ? 'Hide password' : 'Show password'}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d={on ? EYE_OFF : EYE} /></svg>
  </button>
);

export default function AccountPage() {
  const { loading, authenticated, user } = useAuth();
  const router = useRouter();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  // Delete-account state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  // Guard: bounce unauthenticated visitors to sign-in (returning here after).
  useEffect(() => {
    if (!loading && !authenticated) router.replace('/signin?returnTo=/account');
  }, [loading, authenticated, router]);

  if (loading || !authenticated) {
    return (
      <div className="account-page"><div className="container acct-shell" style={{ paddingTop: 64 }}>
        <p className="acct-msg">Loading…</p>
      </div></div>
    );
  }

  if (deleted) {
    return (
      <div className="account-page"><div className="container acct-shell" style={{ paddingTop: 64 }}>
        <p className="acct-msg ok">Your account has been deleted. Redirecting to sign in…</p>
      </div></div>
    );
  }

  const initial = (user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase();

  const doDelete = async () => {
    setDelErr(null); setDeleting(true);
    try {
      await api.del('/api/auth/account');
      clearTokens();
      setConfirmOpen(false);
      setDeleted(true);
      // Show the success message briefly, then send them to sign in.
      setTimeout(() => { window.location.href = '/signin?deleted=1'; }, 1600);
    } catch (e) {
      setDelErr(e instanceof ApiError ? e.message : 'Could not delete your account.');
      setDeleting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(false);
    if (next.length < 8) { setErr('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setErr('New passwords do not match.'); return; }
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', { current_password: current, new_password: next, refreshToken: getRefreshToken() ?? undefined });
      setOk(true);
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-page">
      <section className="acct-hero">
        <div className="container acct-shell">
          <div className="acct-id">
            <div className="acct-avatar" aria-hidden="true">{initial}</div>
            <div className="acct-id-text">
              <div className="acct-eyebrow">Account</div>
              <h1 className="acct-h1">Your account</h1>
              <p className="acct-sub">Signed in as <strong>{user?.email}</strong></p>
            </div>
          </div>
        </div>
      </section>

      <div className="container acct-shell">
        <div className="acct-card">
          <div className="acct-card-head">
            <h2 className="acct-card-title">Change password</h2>
            <p className="acct-card-note">Use at least 8 characters. Changing your password signs out your other devices.</p>
          </div>
          {ok && <p className="acct-msg ok">Password changed. Your other devices have been signed out.</p>}
          {err && <p className="acct-msg err">{err}</p>}

          <form className="acct-form" onSubmit={submit}>
            <label className="acct-field">
              <span>Current password</span>
              <div className="acct-input">
                <input type={showCur ? 'text' : 'password'} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
                <Eye on={showCur} toggle={() => setShowCur(!showCur)} />
              </div>
            </label>
            <label className="acct-field">
              <span>New password</span>
              <div className="acct-input">
                <input type={showNew ? 'text' : 'password'} autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
                <Eye on={showNew} toggle={() => setShowNew(!showNew)} />
              </div>
            </label>
            <label className="acct-field">
              <span>Confirm new password</span>
              <div className="acct-input">
                <input type={showConf ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                <Eye on={showConf} toggle={() => setShowConf(!showConf)} />
              </div>
            </label>
            <div className="acct-actions">
              <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
            </div>
          </form>
        </div>

        <div className="acct-card">
          <div className="acct-card-head">
            <h2 className="acct-card-title">Subscription</h2>
            <p className="acct-card-note">View your plan, billing history, and manage or upgrade your subscription.</p>
          </div>
          <div className="acct-actions" style={{ marginTop: 0 }}>
            <button className="btn primary" onClick={() => router.push('/account/subscription')}>Manage subscription</button>
          </div>
        </div>

        <div className="acct-card">
          <MyContributions />
        </div>

        <div className="acct-card danger">
          <div className="acct-card-head">
            <h2 className="acct-card-title danger">Danger zone</h2>
          </div>
          <div className="acct-danger">
            <div>
              <div className="acct-danger-title">Delete account</div>
              <p className="acct-danger-note">Permanently delete your account and all associated data. This action cannot be undone.</p>
            </div>
            <button className="btn danger" onClick={() => { setDelErr(null); setConfirmOpen(true); }}>Delete account</button>
          </div>
          {delErr && !confirmOpen && <p className="acct-msg err" style={{ marginTop: 16, marginBottom: 0 }}>{delErr}</p>}
        </div>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !deleting) setConfirmOpen(false); }}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="del-title">
            <h3 id="del-title" className="modal-title">Delete your account?</h3>
            <p className="modal-body">This permanently deletes your account (<strong>{user?.email}</strong>) and signs you out everywhere. This cannot be undone.</p>
            {delErr && <p className="notice pl-error" style={{ margin: '0 0 12px' }}>{delErr}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>Cancel</button>
              <button className="btn danger" onClick={doDelete} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete my account'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
