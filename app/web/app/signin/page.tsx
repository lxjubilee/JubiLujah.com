'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
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

declare global {
  // eslint-disable-next-line no-var
  interface Window { turnstile?: any }
}

function SignInInner() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo') || '/';
  const justReset = params.get('reset') === '1';
  const justDeleted = params.get('deleted') === '1';

  // Step 1 (password) state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [tnToken, setTnToken] = useState('');

  // Step 2 (OTP) state
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [guid, setGuid] = useState('');
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [locked, setLocked] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ---- Cloudflare Turnstile (only when a site key is configured) ----
  // Turnstile's smallest widget is a FIXED 300px wide. To make it match the
  // input/button width at ANY viewport (incl. responsive widths < 300px), we
  // render it at its native size into an inner box and CSS-scale that box to the
  // container width — so the captcha is always exactly as wide as the textboxes.
  const TN_W = 300, TN_H = 65;          // Turnstile 'normal' native dimensions
  const tnRef = useRef<HTMLDivElement>(null);       // inner render target (300px, scaled)
  const tnBoxRef = useRef<HTMLDivElement>(null);    // outer full-width wrapper (measured)
  const widgetId = useRef<string | null>(null);
  const renderTurnstile = useCallback(() => {
    if (!SITE_KEY || !tnRef.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(tnRef.current, {
      sitekey: SITE_KEY,
      theme: 'dark',        // match the dark auth panel
      size: 'normal',       // fixed 300x65; we scale it ourselves below
      callback: (t: string) => setTnToken(t),
      'error-callback': () => setTnToken(''),
      'expired-callback': () => setTnToken(''),
    });
  }, []);
  useEffect(() => { renderTurnstile(); }, [renderTurnstile]);

  // Scale the fixed-size widget to the container width (responsive parity with inputs).
  useEffect(() => {
    if (!SITE_KEY) return;
    const box = tnBoxRef.current, inner = tnRef.current;
    if (!box || !inner) return;
    const apply = () => {
      const s = box.clientWidth / TN_W;     // match textbox width exactly (up or down)
      inner.style.transform = `scale(${s})`;
      box.style.height = `${TN_H * s}px`;    // reserve the scaled height, no extra gap
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);
  const resetTurnstile = () => {
    setTnToken('');
    if (SITE_KEY && window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
  };

  // ---- Resend cooldown ticker ----
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

  // ---- Step 1: submit email + password ----
  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (SITE_KEY && !tnToken) { setErr('Please complete the human verification.'); return; }
    setLoading(true);
    try {
      const res: any = await api.post('/api/auth/signin', {
        email, password, rememberMe,
        cfTurnstileToken: SITE_KEY ? tnToken : undefined,
      });
      if (res?.requires2FA) {
        setGuid(res.verificationGuid);
        setStep('code');
        setCooldown(60);
        setInfo('We emailed you a 6-digit code. Enter it below to finish signing in.');
        // Land on the code step idle — only show "Verifying…" once the user
        // actually submits the code (otherwise the button looks stuck verifying).
        setLoading(false);
      } else {
        setTokens(res?.tokens);
        window.location.href = returnTo;
      }
    } catch (e) {
      setErr(errMsg(e, 'Sign in failed'));
      resetTurnstile();
      setLoading(false);
    }
  };

  // ---- Step 2: submit the OTP code ----
  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    setLoading(true);
    try {
      // 2FA completion re-submits to /signin with the password + code. In JI mode
      // this maps to JubileeInspire's documented flow (re-POST /api/auth/login with
      // verificationCode, no CAPTCHA); in local mode it's the inline-code path. The
      // password is still in component state from step 1.
      const res: any = await api.post('/api/auth/signin', { email, password, verificationGuid: guid, verificationCode: code, rememberMe });
      setTokens(res?.tokens);
      window.location.href = returnTo;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 423 || e.body?.locked)) setLocked(true);
      setErr(errMsg(e, 'Could not verify the code'));
      setLoading(false);
    }
  };

  // ---- Step 2: resend ----
  const resend = async () => {
    if (cooldown > 0 || locked) return;
    setErr(null); setInfo(null);
    try {
      const res: any = await api.post('/api/auth/send-login-verification', { email, verificationGuid: guid });
      setCooldown(60);
      const left = typeof res?.resendsRemaining === 'number' ? ` (${res.resendsRemaining} resend${res.resendsRemaining === 1 ? '' : 's'} left)` : '';
      setInfo(`A new code is on its way${left}.`);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 423 || e.body?.locked) { setLocked(true); }
        else if (e.status === 429 && typeof e.body?.cooldownSeconds === 'number') { setCooldown(e.body.cooldownSeconds); }
      }
      setErr(errMsg(e, 'Could not resend the code'));
    }
  };

  const backToPassword = () => {
    setStep('password'); setCode(''); setErr(null); setInfo(null); setLocked(false);
    resetTurnstile();
  };

  return (
    <>
      {SITE_KEY && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" onLoad={renderTurnstile} />}
      <div className="auth-topbar" />
      <div className="auth-split">
        <div className="auth-panel">
          <div className="auth-panel-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="auth-avatar" src="/images/brand-logo.png" alt="" />
            <div className="auth-brand"><span className="b1">JubiLujah</span><span className="b2">.com</span></div>
            <div className="auth-switch">Don&apos;t have an account? <Link href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Sign Up.</Link></div>

            {justReset && step === 'password' && (
              <div className="auth-err" style={{ borderColor: '#1f9d57', color: '#bfe6cf' }}>Your password was updated. Please sign in.</div>
            )}
            {justDeleted && step === 'password' && (
              <div className="auth-err" style={{ borderColor: '#7a8290', color: '#cfd6e2' }}>Your account has been deleted.</div>
            )}
            {info && <div className="auth-err" style={{ borderColor: '#1f9d57', color: '#bfe6cf' }}>{info}</div>}
            {err && <div className="auth-err">{err}</div>}

            {step === 'password' ? (
              <form onSubmit={submitPassword}>
                <div className="auth-input">
                  <label htmlFor="email">Email</label>
                  <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="auth-input">
                  <label htmlFor="password">Password</label>
                  <input id="password" type={show ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <Eye on={show} toggle={() => setShow(!show)} />
                </div>
                <div className="auth-forgot"><Link href="/forgot-password">Forgot password?</Link></div>
                <label className="auth-check">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Keep me signed in on this device</span>
                </label>
                {SITE_KEY ? (
                  <div className="auth-turnstile" ref={tnBoxRef}>
                    <div className="auth-turnstile-inner" ref={tnRef} />
                  </div>
                ) : null}
                <button className="auth-submit" type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign In'}</button>
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <div className="auth-input">
                  <label htmlFor="code">6-digit code</label>
                  <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required
                    value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
                </div>
                <button className="auth-submit" type="submit" disabled={loading || locked || code.length !== 6}>{loading ? 'Verifying…' : 'Verify & sign in'}</button>
                <div className="auth-forgot" style={{ justifyContent: 'space-between', display: 'flex' }}>
                  <button type="button" className="auth-linkbtn" onClick={resend} disabled={cooldown > 0 || locked}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                  <button type="button" className="auth-linkbtn" onClick={backToPassword}>Use a different account</button>
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

export default function SignInPage() {
  return <Suspense fallback={<div className="auth-split" />}><SignInInner /></Suspense>;
}
