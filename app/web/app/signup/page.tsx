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

// Combined-entry signup (JI parity): email + password →
//   already a member    → sign in
//   existing Jubilee ID → 'confirm' : pre-filled First/Last/DOB, just create the local account
//   new                 → 'form'    : full details, then the email-verification 'code' step
type Step = 'email' | 'confirm' | 'form' | 'code';

function SignUpInner() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') || '/';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.get('email') || '');
  const [rememberMe, setRememberMe] = useState(true);

  // Existing-account confirm-screen password visibility
  const [showExisting, setShowExisting] = useState(false);

  // New-account form (Screen 2B) state
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [agree, setAgree] = useState(false);

  // OTP (email verification) state
  const [guid, setGuid] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
  const finish = (res: any) => { setTokens(res?.tokens); window.location.href = returnTo; };

  // ---- Step 1: email + password → verify at the SSO, then route (JI parity) ----
  //   already a Jubilujah member    → sign in
  //   existing Jubilee ID, new here → pre-filled create form ('confirm')
  //   no Jubilee ID for this email  → full registration ('form')
  //   wrong password                → error
  const submitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { setErr('Please enter a valid email address.'); return; }
    if (!password) { setErr('Please enter your password.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signin', { email: addr, password, rememberMe, preview: true });
      if (res?.success && res?.tokens) { finish(res); return; }   // already a member → signed in
      if (res?.needsProfile) {                                     // existing Jubilee ID, new here
        setFirst(res.profile?.first_name || '');
        setLast(res.profile?.last_name || '');
        setDob(String(res.profile?.date_of_birth || '').slice(0, 10));
        setStep('confirm');
      } else {                                                     // no Jubilee ID → full registration
        setConfirm(password);
        setStep('form');
      }
      setLoading(false);
    } catch (e) {
      setErr(errMsg(e, "That password doesn't match. Try again."));
      setLoading(false);
    }
  };

  // ---- Step 2A: existing Jubilee ID → confirm pre-filled details → create ----
  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!first.trim() || !last.trim()) { setErr('Please enter your first and last name.'); return; }
    setLoading(true);
    try {
      // provision:true creates the local JubiLujah account; the edited First/Last/DOB
      // sync to the shared Jubilee ID server-side.
      const res: any = await api.post('/api/auth/signin', {
        email: email.trim(), password, rememberMe, provision: true,
        first_name: first.trim(), last_name: last.trim(), date_of_birth: dob || undefined,
      });
      finish(res);
    } catch (e) {
      setErr(errMsg(e, "That password doesn't match. Try again."));
      setLoading(false);
    }
  };

  // ---- Step 2B: new account → email a verification code ----
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!first.trim() || !last.trim()) { setErr('Please enter your full name.'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    if (!agree) { setErr('Please agree to the Terms of Service and Privacy Policy.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signup', { name: `${first} ${last}`.trim(), email: email.trim(), password });
      if (res?.requiresVerification) {
        setGuid(res.verificationGuid);
        setStep('code');
        setCooldown(60);
        setInfo('We emailed a 6-digit code to verify your email. Enter it below to finish creating your account.');
        setLoading(false);
      } else {
        finish(res);
      }
    } catch (e) {
      // Race: the email was taken between the lookup and here → send them to sign in.
      if (e instanceof ApiError && e.status === 409) { setStep('email'); setErr('You already have an account — enter your password to sign in.'); }
      else setErr(errMsg(e, 'Sign up failed'));
      setLoading(false);
    }
  };

  // ---- Step 3: verify the OTP → create the account ----
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/verify-signup', { verificationGuid: guid, verificationCode: otp });
      finish(res);
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

            {/* ── Step 1: email + password ── */}
            {step === 'email' && (
              <form onSubmit={submitEntry}>
                <p className="auth-foot" style={{ marginBottom: 10 }}>Enter your email and password to get started.</p>
                <div className="auth-input">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="entry-pw">Password</label>
                  <input id="entry-pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={showPw} toggle={() => setShowPw(!showPw)} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Checking…' : 'Continue'}</button>
              </form>
            )}

            {/* ── Step 2A: existing Jubilee ID → pre-filled create form ── */}
            {step === 'confirm' && (
              <form onSubmit={submitConfirm}>
                <p className="auth-foot" style={{ marginBottom: 10 }}>You already have a Jubilee ID — confirm your details to set up JubiLujah.</p>
                <div className="auth-name-row">
                  <div className="auth-input">
                    <label htmlFor="c-first">First Name</label>
                    <input id="c-first" type="text" autoComplete="given-name" required value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className="auth-input">
                    <label htmlFor="c-last">Last Name</label>
                    <input id="c-last" type="text" autoComplete="family-name" required value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className="auth-input">
                  <label htmlFor="c-dob">Date of Birth</label>
                  <input id="c-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="c-email">Email Address</label>
                  <input id="c-email" type="email" value={email} readOnly style={{ opacity: 0.7 }} />
                </div>
                <div className="auth-input">
                  <label htmlFor="c-pw">Jubilee ID password</label>
                  <input id="c-pw" type={showExisting ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={showExisting} toggle={() => setShowExisting(!showExisting)} />
                </div>
                <label className="auth-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Keep me signed in on this device</span>
                </label>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="button" className="auth-linkbtn" onClick={() => { setStep('email'); setErr(null); }}>Use a different email</button>
                </div>
              </form>
            )}

            {/* ── Step 2B: new account → full form ── */}
            {step === 'form' && (
              <form onSubmit={submitForm}>
                <div className="auth-name-row">
                  <div className="auth-input">
                    <label htmlFor="first">First Name</label>
                    <input id="first" type="text" autoComplete="given-name" autoFocus required value={first} onChange={(e) => setFirst(e.target.value)} />
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
                  <label htmlFor="new-email">Email Address</label>
                  <input id="new-email" type="email" value={email} readOnly style={{ opacity: 0.7 }} />
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
                  {confirm && (
                    <div style={{ fontSize: 12, marginTop: 4, color: password === confirm ? '#4ade80' : '#ff6b6b' }}>
                      {password === confirm ? 'Passwords matched' : "Passwords don't match"}
                    </div>
                  )}
                </div>
                <label className="auth-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Keep me signed in on this device</span>
                </label>
                <label className="auth-check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></span>
                </label>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Sending code…' : 'Sign Up for Free'}</button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="button" className="auth-linkbtn" onClick={() => { setStep('email'); setErr(null); }}>Use a different email</button>
                </div>
              </form>
            )}

            {/* ── Step 3: OTP verification ── */}
            {step === 'code' && (
              <form onSubmit={submitCode}>
                <p className="auth-foot" style={{ marginBottom: 8 }}>Verifying <strong>{email}</strong></p>
                <div className="auth-input">
                  <label htmlFor="otp">6-digit code</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading || otp.length !== 6}>{loading ? 'Verifying…' : 'Verify & create account'}</button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="auth-linkbtn" onClick={resend} disabled={cooldown > 0}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="auth-linkbtn" onClick={() => { setStep('form'); setOtp(''); setErr(null); setInfo(null); }}>Edit details</button>
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
