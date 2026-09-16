'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { getTokens, setTokens } from '@/lib/auth';
import { useTenant } from '@/components/TenantProvider';
import { DEFAULT_SLIDES } from '@/components/AuthHero';
import '@/app/jubilee-door.css';

// ============================================================================
// The Jubilee ID door — JubileeInspire's sign-in page, carried over screen for
// screen: the same headings, the same copy, the same sizes and type (see
// app/jubilee-door.css for the measurements and the two deliberate differences).
// Source of truth: W:\JubileeInspire.com\src\app\(auth)\JubileeIdDoor.tsx.
//
// The FLOW underneath is still JubileePraise's own API, which already speaks to the
// Jubilee ID authority (api/src/routes/auth.js, loginMode 'sso'):
//   email (1)          GET /api/auth/lookup → which second screen
//   welcome (2A)       has a Jubilee ID + already uses this site → password → in
//   confirm (2B-1)     has a Jubilee ID, new here → confirm the password …
//   createlinked (2B-2) … then Create account (first/last/DOB, no password)
//   form (2C)          no Jubilee ID → create one → 6-digit email code (code)
//   success            after an account is created, as on JubileeInspire
// ============================================================================

type Step = 'email' | 'welcome' | 'confirm' | 'createlinked' | 'form' | 'code' | 'success';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

declare global {
  // eslint-disable-next-line no-var
  interface Window { turnstile?: any }
}

// ── Eye toggle SVGs (JubileeInspire's) ──────────────────────────────────────
const EyeOpen = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeClosed = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

// ── Password + date-of-birth helpers (JubileeInspire's) ─────────────────────
function calcStrength(pw: string): 'weak' | 'fair' | 'strong' {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (score <= 2) return 'weak';
  if (score <= 4) return 'fair';
  return 'strong';
}
const STRENGTH_LABELS = { weak: 'Weak password', fair: 'Fair password', strong: 'Strong password' };
const STRENGTH_COLORS = { weak: '#f87171', fair: '#fbbf24', strong: '#4ade80' };

function validateDob(dob: string): string | null {
  if (!dob) return 'Please enter your date of birth.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be a valid date.';
  const dobDate = new Date(dob + 'T00:00:00Z');
  if (isNaN(dobDate.getTime())) return 'Date of birth is not a valid date.';
  const now = new Date();
  if (dobDate > now) return 'Date of birth cannot be in the future.';
  const thirteenYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 13, now.getUTCMonth(), now.getUTCDate()));
  if (dobDate > thirteenYearsAgo) return 'Accounts require a minimum age of 13.';
  return null;
}

// ── Right panel (JubileeInspire's AuthBgPanel, on this site's own pictures) ─
function AuthBgPanel() {
  const [bgIdx, setBgIdx] = useState(0);
  useEffect(() => {
    setBgIdx(Math.floor(Math.random() * DEFAULT_SLIDES.length));
    // 5000ms is kJubilee's interval for this same panel (its BackdropPanel in
    // app/_auth-shell.js), paired with the 1.5s cross-fade in the CSS below.
    const interval = setInterval(() => setBgIdx((prev) => (prev + 1) % DEFAULT_SLIDES.length), 5000);
    return () => clearInterval(interval);
  }, []);

  /* Belt and braces against the flash this panel used to show. Stacking the
     slides (below) is what actually fixes it — a background-image on a rendered
     element is fetched even at opacity 0 — but the first slide is chosen at
     random on mount, so warming all ten costs nothing and removes any doubt
     about the very first transition. components/AuthHero.tsx does the same,
     and its comment says why: "so the cross-fade never flashes an unloaded
     image". */
  useEffect(() => {
    DEFAULT_SLIDES.forEach((src) => { const im = new window.Image(); im.src = src; });
  }, []);

  return (
    <div className="auth-bg-panel">
      {/* 🔴 EVERY SLIDE IS IN THE MARKUP AND THEY TRADE OPACITY — a dissolve,
          not a swap. This panel used to be ONE element whose backgroundImage
          was rewritten every few seconds, which meant the browser had to fetch
          and decode the next picture at the moment it was asked to show it, and
          painted the bare panel until it arrived. That is the blank frame
          between slides reported on 2026-09-15.

          Stacked and cross-faded is kJubilee's arrangement for this exact panel
          (.bg-slide / .active there), and it is also what AuthHero.tsx in this
          repo already did — the naive version here reintroduced a bug the
          codebase had already solved.

          FIRST IN THE DOM, deliberately: .bg-overlay and .bg-bubbles below
          carry no z-index, so paint order is document order, and the pictures
          have to be underneath both. */}
      {DEFAULT_SLIDES.map((src, i) => (
        <div
          key={src}
          className={`bg-slide${i === bgIdx ? ' active' : ''}`}
          style={{ backgroundImage: `url('${src}')` }}
          aria-hidden="true"
        />
      ))}
      <div className="bg-overlay" />
      <ul className="bg-bubbles">
        {Array.from({ length: 10 }).map((_, i) => <li key={i} />)}
      </ul>
      <div className="bg-content">
        <div className="bg-quote">
          <blockquote>
            &ldquo;All Scripture is God-breathed and is useful for teaching, rebuking, correcting and training in righteousness.&rdquo;
          </blockquote>
          <cite>2 Timothy 3:16</cite>
        </div>
      </div>
    </div>
  );
}

function JubileeDoor() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') || params.get('redirect') || '/';
  const tenant = useTenant();
  // "JubileePraise" — the door's own name. The Jubilee ID behind it is family-wide,
  // which is why the create screen still says "everything else across Jubilee".
  const siteName = `${tenant.brandLead}${tenant.brandTail}`;

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(params.get('email') || '');
  const [emailLocked, setEmailLocked] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [existingPassword, setExistingPassword] = useState('');   // Jubilee ID password (2A / 2B-1)
  const [showExistingPw, setShowExistingPw] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastNameVal, setLastNameVal] = useState('');
  const [dob, setDob] = useState('');
  const [password, setPassword] = useState('');                   // create-a-password (2C)
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<'weak' | 'fair' | 'strong' | null>(null);

  // Emailed code — a new-account signup code, or a login code in local/ji mode.
  const [codeMode, setCodeMode] = useState<'signup' | 'login'>('signup');
  const [guid, setGuid] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [locked, setLocked] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [emailStepLoading, setEmailStepLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Cloudflare Turnstile (Screen 1) ──────────────────────────────────────
  // Client-side gate only: in SSO mode the credential is verified at the Jubilee
  // ID authority. tnFailed stops the wait (set by the 8s timer even when the
  // widget is healthy, so the gate can never wedge); tnErrored is Turnstile's
  // own "cannot run" callback, the one case where the box is hidden rather than
  // left showing Cloudflare's un-actionable error panel.
  const [tnToken, setTnToken] = useState('');
  const [tnFailed, setTnFailed] = useState(false);
  const [tnErrored, setTnErrored] = useState(false);
  const tnRef = useRef<HTMLDivElement>(null);
  const tnBoxRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  const renderTurnstile = useCallback(() => {
    if (!SITE_KEY || !tnRef.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(tnRef.current, {
      sitekey: SITE_KEY, theme: 'dark', size: 'normal',
      callback: (t: string) => { setTnToken(t); setTnFailed(false); },
      'error-callback': () => { setTnToken(''); setTnFailed(true); setTnErrored(true); },
      'expired-callback': () => setTnToken(''),
    });
  }, []);

  useEffect(() => {
    if (step === 'email') {
      renderTurnstile();
      const t = setTimeout(() => setTnFailed(true), 8000);
      return () => clearTimeout(t);
    }
    if (SITE_KEY && window.turnstile && widgetId.current) {
      try { window.turnstile.remove(widgetId.current); } catch { /* widget gone */ }
    }
    widgetId.current = null;
    setTnToken(''); setTnFailed(false); setTnErrored(false);
  }, [step, renderTurnstile]);

  // The 'normal' widget is a fixed 300px; scale it to the email field's width.
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

  useEffect(() => { setPasswordStrength(password ? calcStrength(password) : null); }, [password]);

  /* ALREADY SIGNED IN? THEN THIS IS NOT THE PAGE (owner, 2026-09-16, every
     family site). Signed in on one tab, a new tab opened straight on /signin
     showed the form again although the session was sitting in localStorage,
     shared by every tab. JubileeInspire's door checks on arrival and sends the
     reader on; this does the same. getTokens() counts a session whose access
     token has lapsed but can still be renewed — lib/api.ts refreshes it on the
     next call. replace(), so Back does not bring the form back; and only to a
     path on this site that is not the door itself, or ?returnTo=/signin would
     loop and an absolute returnTo would leave the site. */
  useEffect(() => {
    if (!getTokens()) return;
    const path = returnTo.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
    const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') && !['/signin', '/signup', '/login'].includes(path);
    window.location.replace(safe ? returnTo : '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError && e.message ? e.message : fallback);
  // A full navigation, not router.push: the header and player read the session
  // from a fresh AuthProvider, and the next page load is also where this browser
  // is introduced to the Jubilee ID authority (lib/familySso.ts plantFamily).
  const goOn = () => { window.location.href = returnTo; };
  const signedIn = (res: any) => { setTokens(res?.tokens); goOn(); };
  const created = (res: any) => { setTokens(res?.tokens); setError(''); setInfo(''); setStep('success'); };

  function useDifferentEmail() {
    setStep('email'); setError(''); setInfo(''); setEmailLocked(false);
    setExistingPassword(''); setPassword(''); setConfirmPassword('');
    setFirstName(''); setLastNameVal(''); setDob('');
  }

  // ── Screen 1: email → look up the Jubilee ID, then route ─────────────────
  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr) { setError('Please enter your email address to continue.'); return; }
    if (!EMAIL_RE.test(addr)) { setError('That does not look like a complete email address. Please check it.'); return; }
    if (SITE_KEY && !tnToken && !tnFailed) { setError('Please complete the human verification.'); return; }
    setEmailStepLoading(true); setError(''); setInfo('');
    try {
      const look: any = await api.get(`/api/auth/lookup?email=${encodeURIComponent(addr)}`);
      // THE API FAILS OPEN, THE DOOR MUST NOT. /lookup answers exists:false with
      // available:false when the Jubilee ID authority could not be reached, so
      // routing on `exists` alone told a returning member "Let's create your
      // Jubilee ID" during any SSO blip. Say what actually happened, as
      // JubileeInspire's door does, and let them try again.
      if (look?.available === false) {
        setError('We are having trouble reaching your account right now. Please try again in a moment.');
        return;
      }
      setEmailLocked(true);
      if (look?.existsLocally) setStep('welcome');        // Outcome A — returning member
      else if (look?.existsInSso) setStep('confirm');     // Outcome B — has a Jubilee ID, new here
      else setStep('form');                               // Outcome C — brand new
    } catch {
      setError('We are having trouble reaching your account right now. Please try again in a moment.');
    } finally { setEmailStepLoading(false); }
  }

  // ── Screen 2A: returning member → verify password → sign in ──────────────
  async function handleWelcomePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!existingPassword) { setError('Please enter your password.'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      const res: any = await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, rememberMe });
      if (res?.requires2FA) {   // local/ji mode only — the SSO is trusted and skips this
        setCodeMode('login'); setGuid(res.verificationGuid); setOtp('');
        setStep('code'); setCooldown(60);
        setInfo('We emailed you a 6-digit code. Enter it below to finish signing in.');
        return;
      }
      if (res?.needsProfile) {  // no local account after all → create it
        setFirstName(res.profile?.first_name || ''); setLastNameVal(res.profile?.last_name || '');
        setDob(String(res.profile?.date_of_birth || '').slice(0, 10));
        setStep('createlinked');
        return;
      }
      signedIn(res);
    } catch (err) {
      setError(errMsg(err, 'That password does not match. Try again, or reset it below.'));
    } finally { setLoading(false); }
  }

  // ── Screen 2B-1: confirm the Jubilee ID password ─────────────────────────
  async function handleConfirmPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!existingPassword) { setError('Please enter your password.'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      // preview verifies at the SSO WITHOUT provisioning and returns the profile
      // (or signs straight in when a local account turns out to exist).
      const res: any = await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, rememberMe, preview: true });
      if (res?.success && res?.tokens) { signedIn(res); return; }
      if (res?.needsProfile) {
        setFirstName(res.profile?.first_name || ''); setLastNameVal(res.profile?.last_name || '');
        setDob(String(res.profile?.date_of_birth || '').slice(0, 10));
        setStep('createlinked');
        return;
      }
      setStep('form');   // no Jubilee ID after all → full create
    } catch (err) {
      setError(errMsg(err, 'That password does not match. Try again, or reset it below.'));
    } finally { setLoading(false); }
  }

  // ── Screen 2B-2: create the linked account (no password) ─────────────────
  async function handleCreateLinked(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastNameVal.trim()) { setError('Please enter your first and last name.'); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      const res: any = await api.post('/api/auth/signin', {
        email: email.trim(), password: existingPassword, rememberMe, provision: true,
        first_name: firstName.trim(), last_name: lastNameVal.trim(), date_of_birth: dob || undefined,
      });
      if (res?.tokens) created(res);
      else setError('Could not create your account. Please try again.');
    } catch (err) {
      setError(errMsg(err, 'Could not create your account. Please try again.'));
    } finally { setLoading(false); }
  }

  // ── Screen 2C: create the Jubilee ID → email a verification code ─────────
  function validateForm(): string | null {
    if (!firstName.trim() || !lastNameVal.trim()) return 'Please enter your first and last name.';
    const dobErr = validateDob(dob);
    if (dobErr) return dobErr;
    if (!email.trim() || !EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = validateForm();
    if (invalid) { setModalMessage(invalid); return; }
    setLoading(true); setError(''); setInfo('');
    try {
      const res: any = await api.post('/api/auth/signup', {
        name: `${firstName.trim()} ${lastNameVal.trim()}`.trim(), email: email.trim(), password,
      });
      if (res?.requiresVerification) {
        setCodeMode('signup'); setGuid(res.verificationGuid); setOtp('');
        setStep('code'); setCooldown(60);
        setInfo('We emailed a 6-digit code to verify your email. Enter it below to finish creating your account.');
      } else if (res?.tokens) {
        created(res);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setModalMessage('Your account already exists! Enter your email to sign in.');
        setStep('email'); setEmailLocked(false);
      } else {
        setModalMessage(errMsg(err, 'Could not create your account. Please try again.'));
      }
    } finally { setLoading(false); }
  }

  // ── Emailed code ─────────────────────────────────────────────────────────
  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(''); setInfo('');
    try {
      if (codeMode === 'login') {
        const res: any = await api.post('/api/auth/signin', { email: email.trim(), password: existingPassword, verificationGuid: guid, verificationCode: otp, rememberMe });
        signedIn(res);
      } else {
        const res: any = await api.post('/api/auth/verify-signup', { verificationGuid: guid, verificationCode: otp, rememberMe, date_of_birth: dob || undefined });
        created(res);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 423 || err.body?.locked)) setLocked(true);
      setError(errMsg(err, 'Could not verify the code'));
    } finally { setLoading(false); }
  }

  async function resend() {
    if (cooldown > 0 || locked) return;
    setError(''); setInfo('');
    try {
      const res: any = codeMode === 'login'
        ? await api.post('/api/auth/send-login-verification', { email: email.trim(), verificationGuid: guid })
        : await api.post('/api/auth/send-signup-verification', { verificationGuid: guid });
      setCooldown(60);
      const left = typeof res?.resendsRemaining === 'number' ? ` (${res.resendsRemaining} left)` : '';
      setInfo(`A new code is on its way${left}.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429 && typeof err.body?.cooldownSeconds === 'number') setCooldown(err.body.cooldownSeconds);
      setError(errMsg(err, 'Could not resend the code'));
    }
  }

  // Account row (read-only email + "Use a different email"), shared by 2A / 2B-1 / 2C.
  const accountRow = (
    <div className="account-row">
      <span className="account-email" title={email}>{email}</span>
      <button type="button" className="use-different" onClick={useDifferentEmail}>Use a different email</button>
    </div>
  );

  const rememberRow = (
    <div className="remember-row">
      <label className="checkbox-wrapper">
        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
        <span className="checkmark" />
        <span className="checkbox-label">Keep me signed in on this device</span>
      </label>
    </div>
  );

  const alerts = (
    <>
      {info && <div className="auth-alert auth-alert--success">{info}</div>}
      {error && <div className="auth-alert auth-alert--error">{error}</div>}
    </>
  );

  return (
    <div className="jid-door">
      {SITE_KEY && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderTurnstile} />}

      <div className="wave-bar" />
      <div className="auth-row">
        {/* Left panel */}
        <div className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-form-inner" style={step === 'success' ? { minHeight: 'auto' } : undefined}>
              <div className="door-screen" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Link href="/" className="auth-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tenant.logo} alt={tenant.name} className="auth-logo-img" />
                  <div className="auth-logo-text">{tenant.brandLead}<span className="inspire">{tenant.brandTail}</span>.com</div>
                </Link>

                {/* ── Screen 1: the one door — email only ── */}
                {step === 'email' && (
                  <>
                    <div className="door-heading door-heading--caps">Sign in with your Jubilee ID</div>
                    <p className="door-helper">One Jubilee ID works across all our sites</p>
                    {alerts}
                    <form onSubmit={handleEmailContinue} noValidate>
                      <div className="floating-label-group">
                        <span className="floating-label">Email address</span>
                        <input
                          type="email" className="form-control" value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required maxLength={254} autoComplete="email" autoFocus
                        />
                      </div>
                      {SITE_KEY && !tnErrored && (
                        <div className="door-turnstile" ref={tnBoxRef}>
                          <div className="door-turnstile-inner" ref={tnRef} />
                        </div>
                      )}
                      <button type="submit" className="btn-login" disabled={emailStepLoading}>
                        {emailStepLoading && <span className="spinner" />}
                        {emailStepLoading ? 'Checking…' : 'Continue'}
                      </button>
                      <p className="door-disclaimer">No account yet? We&apos;ll set one up for you.</p>
                    </form>
                  </>
                )}

                {/* ── Screen 2A: Welcome back (returning member) ── */}
                {step === 'welcome' && (
                  <>
                    <div className="door-heading door-heading--caps">Welcome back</div>
                    {alerts}
                    {accountRow}
                    <form onSubmit={handleWelcomePassword} noValidate>
                      <div className="floating-label-group">
                        <div className="password-wrapper">
                          <span className="floating-label">Password</span>
                          <input
                            type={showExistingPw ? 'text' : 'password'}
                            className="form-control" value={existingPassword}
                            onChange={(e) => setExistingPassword(e.target.value)}
                            required autoComplete="current-password" autoFocus
                          />
                          <button type="button" className="btn-eye" onClick={() => setShowExistingPw((v) => !v)} tabIndex={-1} aria-label={showExistingPw ? 'Hide password' : 'Show password'}>
                            {showExistingPw ? <EyeClosed /> : <EyeOpen />}
                          </button>
                        </div>
                      </div>
                      <div className="forgot-row">
                        <Link href={`/forgot-password?email=${encodeURIComponent(email.trim())}`} className="forgot-link">Forgot your password?</Link>
                      </div>
                      {rememberRow}
                      <button type="submit" className="btn-login" disabled={loading}>
                        {loading && <span className="spinner" />}
                        {loading ? 'Signing in…' : 'Continue'}
                      </button>
                    </form>
                  </>
                )}

                {/* ── Screen 2B-1: Confirm it's you (existing Jubilee ID, new here) ── */}
                {step === 'confirm' && (
                  <>
                    <div className="door-heading">Confirm it&apos;s you</div>
                    <p className="door-subtext">
                      This email already has a Jubilee ID. Enter your password to continue and create your account on {siteName}.
                    </p>
                    {alerts}
                    {accountRow}
                    <form onSubmit={handleConfirmPassword} noValidate>
                      <div className="floating-label-group">
                        <div className="password-wrapper">
                          <span className="floating-label">Jubilee ID password</span>
                          <input
                            type={showExistingPw ? 'text' : 'password'}
                            className="form-control" value={existingPassword}
                            onChange={(e) => setExistingPassword(e.target.value)}
                            required autoComplete="current-password" autoFocus
                          />
                          <button type="button" className="btn-eye" onClick={() => setShowExistingPw((v) => !v)} tabIndex={-1} aria-label={showExistingPw ? 'Hide password' : 'Show password'}>
                            {showExistingPw ? <EyeClosed /> : <EyeOpen />}
                          </button>
                        </div>
                      </div>
                      <div className="forgot-row">
                        <Link href={`/forgot-password?email=${encodeURIComponent(email.trim())}`} className="forgot-link">Forgot your password?</Link>
                      </div>
                      <button type="submit" className="btn-login" disabled={loading}>
                        {loading && <span className="spinner" />}
                        {loading ? 'Checking…' : 'Continue'}
                      </button>
                    </form>
                  </>
                )}

                {/* ── Screen 2B-2: Create your [Site] account (no password) ── */}
                {step === 'createlinked' && (
                  <>
                    <div className="door-heading">Create your {siteName} account</div>
                    <p className="door-subtext">Your Jubilee ID is confirmed. Add a few details to finish creating your account here.</p>
                    {alerts}
                    <form onSubmit={handleCreateLinked} noValidate>
                      <div className="signup-form-row">
                        <div className="floating-label-group">
                          <span className="floating-label">First name</span>
                          <input type="text" className="form-control" value={firstName}
                            onChange={(e) => setFirstName(e.target.value)} maxLength={50} autoComplete="given-name" />
                        </div>
                        <div className="floating-label-group">
                          <span className="floating-label">Last name</span>
                          <input type="text" className="form-control" value={lastNameVal}
                            onChange={(e) => setLastNameVal(e.target.value)} maxLength={50} autoComplete="family-name" />
                        </div>
                      </div>
                      <div className="floating-label-group">
                        <span className="floating-label">Date of birth</span>
                        <input type="date" className="form-control" value={dob}
                          onChange={(e) => setDob(e.target.value)} autoComplete="bday" placeholder=" " />
                      </div>
                      {rememberRow}
                      <button type="submit" className="btn-login" disabled={loading}>
                        {loading && <span className="spinner" />}
                        {loading ? 'Creating…' : 'Create Account'}
                      </button>
                    </form>
                    <div className="back-link-signup">
                      <button type="button" onClick={useDifferentEmail}>Use a different email</button>
                    </div>
                  </>
                )}

                {/* ── Screen 2C: Let's create your Jubilee ID ── */}
                {step === 'form' && (
                  <>
                    <div className="door-heading">Let&apos;s create your Jubilee ID</div>
                    <p className="door-subtext">
                      One account gives you access to {siteName} and everything else across Jubilee. It only takes a moment.
                    </p>
                    {alerts}
                    {emailLocked && accountRow}
                    <form onSubmit={handleSubmit} noValidate>
                      <div className="signup-form-row">
                        <div className="floating-label-group">
                          <span className="floating-label">First name</span>
                          <input type="text" className="form-control" value={firstName}
                            onChange={(e) => setFirstName(e.target.value)} required maxLength={50} autoComplete="given-name" tabIndex={1} />
                        </div>
                        <div className="floating-label-group">
                          <span className="floating-label">Last name</span>
                          <input type="text" className="form-control" value={lastNameVal}
                            onChange={(e) => setLastNameVal(e.target.value)} required maxLength={50} autoComplete="family-name" tabIndex={2} />
                        </div>
                      </div>

                      <div className="floating-label-group">
                        <span className="floating-label">Date of birth</span>
                        <input type="date" className="form-control" value={dob}
                          onChange={(e) => setDob(e.target.value)} required autoComplete="bday" tabIndex={3} placeholder=" " />
                      </div>

                      <div className="floating-label-group">
                        <div className="password-wrapper">
                          <span className="floating-label">Create a password</span>
                          <input type={showPassword ? 'text' : 'password'} className="form-control" value={password}
                            onChange={(e) => setPassword(e.target.value)} required minLength={8}
                            autoComplete="new-password" tabIndex={5} />
                          <button type="button" className="btn-eye" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                            {showPassword ? <EyeClosed /> : <EyeOpen />}
                          </button>
                        </div>
                        {passwordStrength ? (
                          <div className="password-strength">
                            <div className="strength-bar"><div className={`strength-fill ${passwordStrength}`} /></div>
                            <div className="strength-text" style={{ color: STRENGTH_COLORS[passwordStrength] }}>
                              {STRENGTH_LABELS[passwordStrength]}
                            </div>
                          </div>
                        ) : (
                          <div className="password-hint">At least 8 characters</div>
                        )}
                      </div>

                      <div className="floating-label-group">
                        <div className="password-wrapper">
                          <span className="floating-label">Confirm password</span>
                          <input type={showConfirm ? 'text' : 'password'} className="form-control" value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8}
                            autoComplete="new-password" tabIndex={6} />
                          <button type="button" className="btn-eye" tabIndex={-1} onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                            {showConfirm ? <EyeClosed /> : <EyeOpen />}
                          </button>
                        </div>
                        {confirmPassword && (
                          <div className={`password-match-status ${password === confirmPassword ? 'matched' : 'not-matched'}`}>
                            {password === confirmPassword ? 'Passwords Matched' : 'Passwords Don’t Match'}
                          </div>
                        )}
                      </div>

                      {rememberRow}

                      <p className="consent-line">
                        By continuing, you agree to our{' '}
                        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                        {' '}and{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
                      </p>

                      <button type="submit" className="btn-login" disabled={loading} tabIndex={7}>
                        {loading && <span className="spinner" />}
                        {loading ? 'Creating your Jubilee ID…' : 'Create my Jubilee ID'}
                      </button>
                    </form>
                  </>
                )}

                {/* ── Emailed code (new-account verification, or login 2FA) ── */}
                {step === 'code' && (
                  <>
                    <div className="door-heading">Check your email</div>
                    <p className="door-subtext">Enter the 6-digit code we sent to {email}.</p>
                    {alerts}
                    <form onSubmit={handleCode} noValidate>
                      <div className="floating-label-group">
                        <span className="floating-label">6-digit code</span>
                        <input
                          className="form-control" inputMode="numeric" autoComplete="one-time-code"
                          maxLength={6} required autoFocus value={otp}
                          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                      <button type="submit" className="btn-login" disabled={loading || locked || otp.length !== 6}>
                        {loading && <span className="spinner" />}
                        {loading ? 'Verifying…' : (codeMode === 'login' ? 'Verify & sign in' : 'Verify & create account')}
                      </button>
                    </form>
                    <div className="back-link-signup code-row">
                      <button type="button" onClick={resend} disabled={cooldown > 0 || locked}>
                        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                      </button>
                      <button type="button" onClick={() => { setStep(codeMode === 'login' ? 'welcome' : 'form'); setOtp(''); setError(''); setInfo(''); setLocked(false); }}>
                        {codeMode === 'login' ? 'Use a different account' : 'Edit details'}
                      </button>
                    </div>
                  </>
                )}

                {/* ── Success ── */}
                {step === 'success' && (
                  <div className="success-state-signup">
                    <div className="success-icon-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <h2>You&apos;re all set!</h2>
                    <p>Welcome to {tenant.name}. You&apos;re ready to begin.</p>
                    <button type="button" className="btn-login" onClick={goOn}>Get Started</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <AuthBgPanel />
      </div>

      <div className="auth-footer">
        <p className="copyright">
          &copy; {new Date().getFullYear()} {tenant.name} |{' '}
          <a href="/terms">Terms of Use</a> |{' '}
          <a href="/privacy">Privacy Policy</a>
        </p>
      </div>

      {/* Validation modal */}
      {modalMessage && (
        <div className="validation-modal-overlay" onClick={() => setModalMessage('')}>
          <div className="validation-modal">
            <div className="validation-modal-icon">
              <svg viewBox="0 0 24 24" width="60" height="60" fill="none" stroke="var(--ji-accent)" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <p>{modalMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default JubileeDoor;
