'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
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

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SITE_NAME = 'JubileePraise';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

declare global {
  // eslint-disable-next-line no-var
  interface Window { turnstile?: any }
}

// The "one door" (Jubilee ID Sign-in guidelines): Screen 1 collects the EMAIL only,
// looks it up at the Jubilee ID authority, then routes —
//   welcome (2A)      : has a Jubilee ID + already uses JubileePraise → password → sign in
//   confirm (2B-1)    : has a Jubilee ID, new here → confirm password …
//   createlinked (2B-2): … then a Create-account screen (First/Last/DOB, no password)
//   form (2C)         : no Jubilee ID → create one (name/DOB/password) → 6-digit email OTP
type Step = 'email' | 'welcome' | 'confirm' | 'createlinked' | 'form' | 'code';

const doorStyles = `
  .door-h { text-align: center; font-size: 21px; font-weight: 800; color: #ffffff; margin: 2px 0 8px; line-height: 1.3; }
  .door-sub { text-align: center; font-size: 13.5px; color: #d3cdc1; line-height: 1.55; margin: 0 0 20px; }
  .door-help { text-align: center; font-size: 13px; color: #b7b1a4; margin: 0 0 22px; }
  .door-disc { text-align: center; font-size: 12.5px; color: #9a9488; margin-top: 16px; }
  .door-acct {
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    padding: 11px 13px; border: 1px solid rgba(255,255,255,0.14); border-radius: 8px;
    background: rgba(255,255,255,0.03); margin-bottom: 20px; font-size: 14px; color: #f5f3ee;
  }
  .door-acct .em { word-break: break-all; }
  .door-acct .diff {
    background: none; border: none; color: var(--brand-accent); font-size: 12.5px; cursor: pointer;
    text-decoration: underline; white-space: nowrap; padding: 0;
  }
  .door-tn { width: 100%; margin: 6px 0 16px; overflow: hidden; }
  .door-tn:empty { margin: 0; }
  .door-tn-inner { width: 300px; transform-origin: top left; }
  .door-match { font-size: 12px; margin-top: 4px; }
`;

function JubileeDoor() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') || '/';

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.get('email') || '');
  const [emailLocked, setEmailLocked] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Jubilee ID password (Screens 2A / 2B-1)
  const [existingPassword, setExistingPassword] = useState('');
  const [showExisting, setShowExisting] = useState(false);

  // Create-account fields (2B-2 / 2C)
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [agree, setAgree] = useState(false);

  // OTP (verification) — reused for a new-account signup code AND a login 2FA code
  const [codeMode, setCodeMode] = useState<'signup' | 'login'>('signup');
  const [guid, setGuid] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [locked, setLocked] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // ---- Cloudflare Turnstile (Screen 1, human verification) ----
  // Client-side gate only: in SSO mode the sign-in credential is verified at the
  // trusted Jubilee ID authority, which does not require this token. Fail-safe —
  // if the widget can't render (e.g. domain not allow-listed) it never blocks.
  const [tnToken, setTnToken] = useState('');
  const [tnFailed, setTnFailed] = useState(false);
  /*
   * tnErrored IS NOT tnFailed, AND THE DIFFERENCE MATTERS.
   *
   * tnFailed means "stop waiting for a token" and is set by the 8s timer BELOW
   * EVEN WHEN THE WIDGET IS WORKING FINE — it exists only so the submit gate can
   * never wedge. Hiding the widget on tnFailed would therefore make a perfectly
   * good captcha vanish 8 seconds after it appeared.
   *
   * tnErrored is set ONLY by Turnstile's error-callback, i.e. the widget itself
   * reporting it cannot run. That is the one case where the box should go away:
   * Cloudflare paints its own "Unable to connect to website / Troubleshoot" panel
   * in that box, which tells a visitor nothing they can act on and makes a
   * working sign-in page look broken. Verification is already being skipped at
   * that point (see the gate in submitEmail), so the honest thing is to show
   * nothing rather than an error the visitor cannot fix.
   *
   * THE UNDERLYING CAUSE IS NOT IN THIS FILE. A Turnstile site key is bound to an
   * allow-list of hostnames in the Cloudflare dashboard; a host that is not on it
   * gets exactly this error. When jubileepraise.com was added to the widget's
   * hostnames this stopped firing on its own — nothing here needed changing.
   */
  const [tnErrored, setTnErrored] = useState(false);
  const tnRef = useRef<HTMLDivElement>(null);       // inner 300px render target (scaled)
  const tnBoxRef = useRef<HTMLDivElement>(null);    // outer full-width wrapper (measured)
  const widgetId = useRef<string | null>(null);
  const renderTurnstile = useCallback(() => {
    if (!SITE_KEY || !tnRef.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(tnRef.current, {
      sitekey: SITE_KEY,
      theme: 'dark',
      size: 'normal',
      callback: (t: string) => { setTnToken(t); setTnFailed(false); },
      'error-callback': () => { setTnToken(''); setTnFailed(true); setTnErrored(true); },
      'expired-callback': () => setTnToken(''),
    });
  }, []);

  // Render on Screen 1; tear down on leave so it re-renders cleanly on return.
  useEffect(() => {
    if (step === 'email') {
      renderTurnstile();
      const t = setTimeout(() => setTnFailed(true), 8000); // never block sign-in forever
      return () => clearTimeout(t);
    }
    if (SITE_KEY && window.turnstile && widgetId.current) {
      try { window.turnstile.remove(widgetId.current); } catch { /* widget gone */ }
    }
    widgetId.current = null;
    setTnToken(''); setTnFailed(false); setTnErrored(false);
  }, [step, renderTurnstile]);

  // The 'normal' widget is a fixed 300px; CSS-scale it to the measured container
  // width so the captcha is exactly as wide as the email textbox at any viewport.
  useEffect(() => {
    if (!SITE_KEY || step !== 'email') return;
    const box = tnBoxRef.current, inner = tnRef.current;
    if (!box || !inner) return;
    const TN_W = 300, TN_H = 65;
    const apply = () => {
      const s = box.clientWidth / TN_W;
      inner.style.transform = `scale(${s})`;
      box.style.height = `${TN_H * s}px`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, [step]);

  // ---- Resend cooldown ticker ----
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
  const finish = (res: any) => { setTokens(res?.tokens); window.location.href = returnTo; };

  function useDifferentEmail() {
    setStep('email'); setErr(null); setInfo(null); setEmailLocked(false);
    setExistingPassword(''); setPassword(''); setConfirm('');
    setFirst(''); setLast(''); setDob('');
  }

  // ---- Screen 1: email → look up the Jubilee ID, then route ----
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    const addr = email.trim();
    if (!addr) { setErr('Please enter your email address to continue.'); return; }
    if (!EMAIL_RE.test(addr)) { setErr('That does not look like a complete email address. Please check it.'); return; }
    if (SITE_KEY && !tnToken && !tnFailed) { setErr('Please complete the human verification.'); return; }
    setEmailLoading(true);
    try {
      const look: any = await api.get(`/api/auth/lookup?email=${encodeURIComponent(addr)}`);
      setEmailLocked(true);
      if (look?.existsLocally) setStep('welcome');        // Outcome A — returning member
      else if (look?.existsInSso) setStep('confirm');     // Outcome B — has a Jubilee ID, new here
      else setStep('form');                               // Outcome C — brand new
    } catch {
      setErr('We are having trouble reaching your account right now. Please try again in a moment.');
    } finally { setEmailLoading(false); }
  }

  // ---- Screen 2A: returning member → verify password → sign in ----
  async function submitWelcome(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!existingPassword) { setErr('Please enter your password.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, rememberMe });
      if (res?.requires2FA) {   // local/ji mode only — SSO is trusted and skips this
        setCodeMode('login'); setGuid(res.verificationGuid); setOtp('');
        setStep('code'); setCooldown(60);
        setInfo('We emailed you a 6-digit code. Enter it below to finish signing in.');
        setLoading(false); return;
      }
      if (res?.needsProfile) {  // defensive: no local account after all → create it
        setFirst(res.profile?.first_name || ''); setLast(res.profile?.last_name || '');
        setDob(String(res.profile?.date_of_birth || '').slice(0, 10));
        setStep('createlinked'); setLoading(false); return;
      }
      finish(res);
    } catch (e) {
      setErr(errMsg(e, 'That password does not match. Try again, or reset it below.'));
      setLoading(false);
    }
  }

  // ---- Screen 2B-1: existing Jubilee ID, new here → confirm password ----
  async function submitConfirm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!existingPassword) { setErr('Please enter your password.'); return; }
    setLoading(true);
    try {
      // preview verifies the credential at the SSO WITHOUT provisioning, and returns
      // the pre-filled profile (or signs in if a local account already exists).
      const res: any = await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, rememberMe, preview: true });
      if (res?.success && res?.tokens) { finish(res); return; }   // edge: local exists
      if (res?.needsProfile) {
        setFirst(res.profile?.first_name || ''); setLast(res.profile?.last_name || '');
        setDob(String(res.profile?.date_of_birth || '').slice(0, 10));
        setStep('createlinked'); setLoading(false); return;
      }
      // No Jubilee ID (shouldn't happen after existsInSso) → fall through to full create.
      setStep('form'); setLoading(false);
    } catch (e) {
      setErr(errMsg(e, 'That password does not match. Try again, or reset it below.'));
      setLoading(false);
    }
  }

  // ---- Screen 2B-2: create the linked account (no password; edits sync to SSO) ----
  async function submitCreateLinked(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!first.trim() || !last.trim()) { setErr('Please enter your first and last name.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signin', {
        email: email.trim(), password: existingPassword, rememberMe, provision: true,
        first_name: first.trim(), last_name: last.trim(), date_of_birth: dob || undefined,
      });
      finish(res);
    } catch (e) {
      setErr(errMsg(e, 'Could not create your account. Please try again.'));
      setLoading(false);
    }
  }

  // ---- Screen 2C: create a brand-new Jubilee ID → email a verification code ----
  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (!first.trim() || !last.trim()) { setErr('Please enter your first and last name.'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setErr('Passwords do not match.'); return; }
    if (!agree) { setErr('Please agree to the Terms of Service and Privacy Policy.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signup', { name: `${first.trim()} ${last.trim()}`.trim(), email: email.trim(), password });
      if (res?.requiresVerification) {
        setCodeMode('signup'); setGuid(res.verificationGuid); setOtp('');
        setStep('code'); setCooldown(60);
        setInfo('We emailed a 6-digit code to verify your email. Enter it below to finish creating your account.');
        setLoading(false);
      } else {
        finish(res);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { setStep('email'); setErr('You already have an account — enter your email to sign in.'); }
      else setErr(errMsg(e, 'Sign up failed'));
      setLoading(false);
    }
  }

  // ---- OTP step: verify the code ----
  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setInfo(null);
    setLoading(true);
    try {
      const res: any = codeMode === 'login'
        ? await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, verificationGuid: guid, verificationCode: otp, rememberMe })
        : await api.post('/api/auth/verify-signup', { verificationGuid: guid, verificationCode: otp });
      finish(res);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 423 || e.body?.locked)) setLocked(true);
      setErr(errMsg(e, 'Could not verify the code'));
      setLoading(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || locked) return;
    setErr(null); setInfo(null);
    try {
      const res: any = codeMode === 'login'
        ? await api.post('/api/auth/send-login-verification', { email: email.trim(), verificationGuid: guid })
        : await api.post('/api/auth/send-signup-verification', { verificationGuid: guid });
      setCooldown(60);
      const left = typeof res?.resendsRemaining === 'number' ? ` (${res.resendsRemaining} left)` : '';
      setInfo(`A new code is on its way${left}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && typeof e.body?.cooldownSeconds === 'number') setCooldown(e.body.cooldownSeconds);
      setErr(errMsg(e, 'Could not resend the code'));
    }
  }

  const accountRow = (
    <div className="door-acct">
      <span className="em">{email}</span>
      <button type="button" className="diff" onClick={useDifferentEmail}>Use a different email</button>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: doorStyles }} />
      {SITE_KEY && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderTurnstile} />}
      <div className="auth-topbar" />
      <div className="auth-split">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-avatar" src="/images/brand-logo.png" alt="" />
            <div className="auth-brand"><span className="b1">JubileePraise</span><span className="b2">.com</span></div>

            {info && <div className="auth-err" style={{ borderColor: '#1f9d57', color: '#bfe6cf', marginTop: 18 }}>{info}</div>}
            {err && <div className="auth-err" style={{ marginTop: 18 }}>{err}</div>}

            {/* ── Screen 1: the one door — email only ── */}
            {step === 'email' && (
              <form onSubmit={submitEmail} style={{ marginTop: 22 }}>
                <div className="door-h">Sign in with your Jubilee ID</div>
                <p className="door-help">One Jubilee ID works across all our sites.</p>
                <div className="auth-input">
                  <label htmlFor="email">Email Address</label>
                  <input id="email" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {/* Hidden once the widget reports it cannot run — see tnErrored above. */}
                {SITE_KEY && !tnErrored && (
                  <div className="door-tn" ref={tnBoxRef}>
                    <div className="door-tn-inner" ref={tnRef} />
                  </div>
                )}
                <button className="auth-submit" type="submit" disabled={emailLoading}>{emailLoading ? 'Checking…' : 'Continue'}</button>
                <p className="door-disc">No account yet? We&apos;ll set one up for you.</p>
              </form>
            )}

            {/* ── Screen 2A: Welcome back (returning member) ── */}
            {step === 'welcome' && (
              <form onSubmit={submitWelcome} style={{ marginTop: 22 }}>
                <div className="door-h">Welcome back</div>
                {accountRow}
                <div className="auth-input">
                  <label htmlFor="w-pw">Password</label>
                  <input id="w-pw" type={showExisting ? 'text' : 'password'} autoComplete="current-password" autoFocus required value={existingPassword} onChange={(e) => setExistingPassword(e.target.value)} />
                  <Eye on={showExisting} toggle={() => setShowExisting(!showExisting)} />
                </div>
                <div className="auth-forgot"><Link href={`/forgot-password?email=${encodeURIComponent(email.trim())}`}>Forgot your password?</Link></div>
                <label className="auth-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Keep me signed in on this device</span>
                </label>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Continue'}</button>
              </form>
            )}

            {/* ── Screen 2B-1: Confirm it's you (existing Jubilee ID, new here) ── */}
            {step === 'confirm' && (
              <form onSubmit={submitConfirm} style={{ marginTop: 22 }}>
                <div className="door-h">Confirm it&apos;s you</div>
                <p className="door-sub">This email already has a Jubilee ID. Enter your password to continue and create your account on {SITE_NAME}.</p>
                {accountRow}
                <div className="auth-input">
                  <label htmlFor="c-pw">Jubilee ID password</label>
                  <input id="c-pw" type={showExisting ? 'text' : 'password'} autoComplete="current-password" autoFocus required value={existingPassword} onChange={(e) => setExistingPassword(e.target.value)} />
                  <Eye on={showExisting} toggle={() => setShowExisting(!showExisting)} />
                </div>
                <div className="auth-forgot"><Link href={`/forgot-password?email=${encodeURIComponent(email.trim())}`}>Forgot your password?</Link></div>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Checking…' : 'Continue'}</button>
              </form>
            )}

            {/* ── Screen 2B-2: Create your JubileePraise account (no password) ── */}
            {step === 'createlinked' && (
              <form onSubmit={submitCreateLinked} style={{ marginTop: 22 }}>
                <div className="door-h">Create your {SITE_NAME} account</div>
                <p className="door-sub">Your Jubilee ID is confirmed. Add a few details to finish creating your account here.</p>
                <div className="auth-name-row">
                  <div className="auth-input">
                    <label htmlFor="cl-first">First Name</label>
                    <input id="cl-first" type="text" autoComplete="given-name" required value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className="auth-input">
                    <label htmlFor="cl-last">Last Name</label>
                    <input id="cl-last" type="text" autoComplete="family-name" required value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className="auth-input">
                  <label htmlFor="cl-dob">Date of Birth</label>
                  <input id="cl-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <label className="auth-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Keep me signed in on this device</span>
                </label>
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create Account'}</button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="button" className="auth-linkbtn" onClick={useDifferentEmail}>Use a different email</button>
                </div>
              </form>
            )}

            {/* ── Screen 2C: Let's create your Jubilee ID ── */}
            {step === 'form' && (
              <form onSubmit={submitForm} style={{ marginTop: 22 }}>
                <div className="door-h">Let&apos;s create your Jubilee ID</div>
                <p className="door-sub">One account gives you access to {SITE_NAME} and everything else across Jubilee. It only takes a moment.</p>
                <div className="auth-name-row">
                  <div className="auth-input">
                    <label htmlFor="f-first">First Name</label>
                    <input id="f-first" type="text" autoComplete="given-name" autoFocus required value={first} onChange={(e) => setFirst(e.target.value)} />
                  </div>
                  <div className="auth-input">
                    <label htmlFor="f-last">Last Name</label>
                    <input id="f-last" type="text" autoComplete="family-name" required value={last} onChange={(e) => setLast(e.target.value)} />
                  </div>
                </div>
                <div className="auth-input">
                  <label htmlFor="f-dob">Date of Birth</label>
                  <input id="f-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="f-email">Email Address</label>
                  <input id="f-email" type="email" value={email} readOnly style={{ opacity: 0.7 }} />
                </div>
                <div className="auth-input">
                  <label htmlFor="f-pw">Create a Password</label>
                  <input id="f-pw" type={showPw ? 'text' : 'password'} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={showPw} toggle={() => setShowPw(!showPw)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="f-cf">Confirm Password</label>
                  <input id="f-cf" type={showCf ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  <Eye on={showCf} toggle={() => setShowCf(!showCf)} />
                  {confirm && (
                    <div className="door-match" style={{ color: password === confirm ? '#4ade80' : '#ff6b6b' }}>
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
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Sending code…' : 'Create my Jubilee ID'}</button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <button type="button" className="auth-linkbtn" onClick={useDifferentEmail}>Use a different email</button>
                </div>
              </form>
            )}

            {/* ── OTP verification (new-account signup code or login 2FA) ── */}
            {step === 'code' && (
              <form onSubmit={submitCode} style={{ marginTop: 22 }}>
                <div className="door-h">Check your email</div>
                <p className="door-sub">Enter the 6-digit code we sent to <strong style={{ color: 'var(--brand-accent)' }}>{email}</strong>.</p>
                <div className="auth-input">
                  <label htmlFor="otp">6-digit code</label>
                  <input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading || locked || otp.length !== 6}>
                  {loading ? 'Verifying…' : (codeMode === 'login' ? 'Verify & sign in' : 'Verify & create account')}
                </button>
                <div className="auth-forgot auth-forgot-below" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <button type="button" className="auth-linkbtn" onClick={resend} disabled={cooldown > 0 || locked}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="auth-linkbtn" onClick={() => { setStep(codeMode === 'login' ? 'welcome' : 'form'); setOtp(''); setErr(null); setInfo(null); setLocked(false); }}>
                    {codeMode === 'login' ? 'Use a different account' : 'Edit details'}
                  </button>
                </div>
              </form>
            )}
          </div>
          <div className="auth-foot">© 2026 JubileePraise.com &nbsp;|&nbsp; <Link href="/terms">Terms of Use</Link> &nbsp;|&nbsp; <Link href="/privacy">Privacy Policy</Link></div>
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

export default JubileeDoor;
