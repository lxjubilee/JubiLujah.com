'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import AuthHero from '@/components/AuthHero';

const EYE = 'M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5C21.3 7.6 17 4.5 12 4.5zm0 12.5a5 5 0 110-10 5 5 0 010 10zm0-8a3 3 0 100 6 3 3 0 000-6z';
const EYE_OFF = 'M12 7a5 5 0 015 5c0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65a3 3 0 003 3c.22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53a5 5 0 01-5-5c0-.79.2-1.53.53-2.2z';
const Eye = ({ on, toggle }: { on: boolean; toggle: () => void }) => (
  <button type="button" className="auth-eye" onClick={toggle} aria-label={on ? 'Hide password' : 'Show password'}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d={on ? EYE_OFF : EYE} /></svg>
  </button>
);

function SignUpInner() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') || '/';

  // Step 1 (details)
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [agree, setAgree] = useState(false);

  // Step 2 (email verification code)
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [guid, setGuid] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

  // ---- Step 1: submit details -> email a verification code ----
  const submitDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    if (!agree) { setErr('Please agree to the Terms of Service and Privacy Policy.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signup', { name: `${first} ${last}`.trim(), email, password });
      if (res?.requiresVerification) {
        setGuid(res.verificationGuid);
        setStep('code');
        setCooldown(60);
        setInfo('We emailed a 6-digit code to verify your email. Enter it below to finish creating your account.');
        setLoading(false); // land on the code step idle, not mid-"Verifying…"
      } else {
        window.location.href = returnTo;
      }
    } catch (e) {
      setErr(errMsg(e, 'Sign up failed'));
      setLoading(false);
    }
  };

  // ---- Step 2: verify the code -> create the account ----
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/verify-signup', { verificationGuid: guid, verificationCode: otp });
      setTokens(res?.tokens);
      window.location.href = returnTo;
    } catch (e) {
      setErr(errMsg(e, 'Could not verify the code'));
      setLoading(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setErr(null); setInfo(null);
    try {
      const res: any = await api.post('/api/auth/send-signup-verification', { verificationGuid: guid });
      setCooldown(60);
      const left = typeof res?.resendsRemaining === 'number' ? ` (${res.resendsRemaining} left)` : '';
      setInfo(`A new code is on its way${left}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.cooldownSeconds === 'number') setCooldown(e.body.cooldownSeconds);
      setErr(errMsg(e, 'Could not resend the code'));
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
            <div className="auth-switch">Already have an account? <Link href={`/signin?returnTo=${encodeURIComponent(returnTo)}`}>Sign In.</Link></div>

            {info && <div className="auth-err" style={{ borderColor: '#1f9d57', color: '#bfe6cf' }}>{info}</div>}
            {err && <div className="auth-err">{err}</div>}

            {step === 'details' ? (
              <form onSubmit={submitDetails}>
                <div className="auth-name-row">
                  <div className="auth-input">
                    <label htmlFor="first">First Name</label>
                    <input id="first" type="text" autoComplete="given-name" required value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className="auth-input">
                    <label htmlFor="last">Last Name</label>
                    <input id="last" type="text" autoComplete="family-name" required value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className="auth-input">
                  <label htmlFor="dob">Date of Birth</label>
                  <input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="password">Password</label>
                  <input id="password" type={showPw ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={showPw} toggle={() => setShowPw(!showPw)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="confirm">Confirm Password</label>
                  <input id="confirm" type={showCf ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  <Eye on={showCf} toggle={() => setShowCf(!showCf)} />
                </div>
                <label className="auth-check">
                  <input type="checkbox" defaultChecked />
                  <span>Keep me signed in on this device</span>
                </label>
                <label className="auth-check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></span>
                </label>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Sending code…' : 'Sign Up for Free'}</button>
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <p className="auth-foot" style={{ marginBottom: 8 }}>Verifying <strong>{email}</strong></p>
                <div className="auth-input">
                  <label htmlFor="otp">6-digit code</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading || otp.length !== 6}>{loading ? 'Verifying…' : 'Verify & create account'}</button>
                <div className="auth-forgot" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="auth-linkbtn" onClick={resend} disabled={cooldown > 0}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="auth-linkbtn" onClick={() => { setStep('details'); setOtp(''); setErr(null); setInfo(null); }}>Edit details</button>
                </div>
              </form>
            )}
          </div>
          <div className="auth-foot">© 2026 JubiLujah.com &nbsp;|&nbsp; <Link href="/terms">Terms of Use</Link> &nbsp;|&nbsp; <Link href="/privacy">Privacy Policy</Link></div>
        </div>

        <AuthHero>
          <div className="auth-hero-quote">
            <p>&ldquo;All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness.&rdquo;</p>
            <cite>2 Timothy 3:16</cite>
          </div>
        </AuthHero>
      </div>
    </>
  );
}

export default function SignUpPage() {
  return <Suspense fallback={<div className="auth-split" />}><SignUpInner /></Suspense>;
}
