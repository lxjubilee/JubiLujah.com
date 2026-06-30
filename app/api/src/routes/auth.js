import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config, ROLE_ORDER } from '../config.js';
import { ah } from '../util/async.js';
import { HttpError, requireAuth } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { query, withTransaction } from '../db.js';
import {
  upsertUserFromJI, issueAccessToken, purgeUserAccount,
  createRefreshToken, redeemRefreshToken, revokeRefreshToken, revokeAllRefreshTokens,
} from '../auth/session.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { sendPasswordResetEmail, sendLoginVerificationEmail, sendSignupVerificationEmail } from '../services/email.js';
import { syncPasswordToJI, provisionUserToJI } from '../services/jiSync.js';
import { jiLogin } from '../services/jiLogin.js';
import { logger } from '../logger.js';

// Default role for self-service sign-ups (configurable). content_editor lets a
// new user use the editorial features; lower to 'viewer' for read-only signups.
const DEFAULT_SIGNUP_ROLE = ROLE_ORDER.includes(process.env.DEFAULT_SIGNUP_ROLE)
  ? process.env.DEFAULT_SIGNUP_ROLE : 'content_editor';

// Token payload echoed in auth responses so the Bearer client (localStorage web
// client + native/mobile) can store it and send it back as `Authorization:
// Bearer`. The access token is a JubileeInspire-format token (auth/token.js;
// 1h TTL); the refresh token (DB-backed + revocable) is redeemed at
// POST /api/auth/refresh to mint a fresh access token without re-entering
// credentials. `expiresAt` is the ACCESS token's expiry.
function tokenPayload(accessToken, refreshToken, expiresAt) {
  return { accessToken, refreshToken, expiresAt };
}

// Mint a fresh access + refresh token pair for a user. Shared by every login
// path (password, OTP verify, signup, refresh, JI delegation). `extended` maps to
// "keep me signed in" (rememberMe) -> the 1-year refresh lifetime (JI parity).
async function issueTokens({ userId, extended = false }) {
  const access = await issueAccessToken({ userId });
  const refresh = await createRefreshToken({ userId, extended });
  return { accessToken: access.token, refreshToken: refresh.token, expiresAt: access.expiresAt };
}

const router = Router();

// ---- Sign-in hardening: constants + helpers --------------------------------
const LOGIN_CODE_EXPIRY_MS = 15 * 60 * 1000;  // OTP code lifetime
const LOGIN_CODE_ATTEMPTS  = 5;               // wrong-code tries per code
const RESEND_COOLDOWN_MS   = 60 * 1000;       // min gap between resends
const MAX_LOGIN_RESENDS    = 2;               // 2 resends => 3 codes total, then lockout
const LOGIN_LOCKOUT_MS     = 60 * 60 * 1000;  // lockout duration once the cap is hit
const SIGNUP_CODE_EXPIRY_MS = 30 * 60 * 1000; // email-verification code lifetime (signup)

const sha256hex = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const genOtpCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

function codeMatches(input, stored) {
  const a = Buffer.from(String(input));
  const b = Buffer.from(String(stored));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Verify a Cloudflare Turnstile token. Skips (returns true) when no secret is
// configured — the dev default. Fails closed on a network/parse error.
async function verifyTurnstile(token, remoteip) {
  if (!config.turnstile.secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: config.turnstile.secret, response: token });
  if (remoteip) body.set('remoteip', remoteip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = await r.json();
    return j.success === true;
  } catch (err) {
    logger.warn({ err }, 'Turnstile siteverify failed');
    return false;
  }
}

// Append an identity audit row (same shape as session.js). `db` may be a pg
// transaction client (call client.query) or null (use the pooled query()).
async function writeAudit(db, actorId, action, payload) {
  const exec = db ? db.query.bind(db) : query;
  await exec(
    `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
       VALUES ($1, $2, 'user', $3, $4)`,
    [actorId, action, actorId, JSON.stringify(payload || {})]
  );
}

// Validate + consume a pending OTP challenge. Throws HttpError on any failure;
// marks verified_at on success. Row-locked to prevent concurrent double-use.
async function consumeVerification({ userId, verificationGuid, verificationCode }) {
  return withTransaction(async (client) => {
    const v = await client.query(
      `SELECT id, code, attempts, max_attempts, expires_at, verified_at
         FROM identity.login_verifications
        WHERE verification_guid = $1 AND user_id = $2
        FOR UPDATE`,
      [verificationGuid, userId]
    );
    if (!v.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
    const row = v.rows[0];
    if (row.verified_at) throw new HttpError(400, 'This code was already used.');
    if (new Date(row.expires_at) <= new Date()) throw new HttpError(400, 'Verification code expired. Request a new one.');
    if (row.attempts >= row.max_attempts) throw new HttpError(429, 'Too many attempts. Request a new code.');
    if (!codeMatches(verificationCode, row.code)) {
      await client.query('UPDATE identity.login_verifications SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      const left = Math.max(0, row.max_attempts - row.attempts - 1);
      throw new HttpError(400, `Incorrect code. ${left} attempt(s) left.`, { attemptsRemaining: left });
    }
    await client.query('UPDATE identity.login_verifications SET verified_at = NOW() WHERE id = $1', [row.id]);
  });
}

// Finalize a successful login: clear the first-signin gate + lockout, bump
// last_login_at, mint the access JWT + refresh token, and audit.
async function finalizeLogin(user, { extended = false } = {}) {
  await query(
    `UPDATE identity.users
        SET first_signin_completed = TRUE, locked_until = NULL, last_login_at = NOW()
      WHERE id = $1`,
    [user.id]
  );
  const tokens = await issueTokens({ userId: user.id, extended });
  await writeAudit(null, user.id, 'login_success', {});
  return tokens;
}

// ---- JI delegation (config.loginMode === 'ji') -----------------------------
// JubileeInspire is the credential authority in production; Jubilujah stays the
// SESSION authority. After JI validates, we upsert the returned user locally and
// mint our OWN tokens (same JI token format, our local userId) — JI's own tokens
// are discarded since they carry JI's userId, which our DB lookup wouldn't resolve.
async function establishSessionFromJI(req, res, jiUser) {
  const { user } = await upsertUserFromJI(jiUser);

  // Mirror the (JI-verified) password into our local credentials so JI-only users
  // gain a credential anchor: this makes /change-password (verifies the current
  // password) and /forgot-password (only emails password-capable accounts) usable
  // for them — and those flows then sync the change back to JI. Refreshed on every
  // login so it self-heals if the password was changed directly on JI. Best-effort:
  // JI already authenticated, so a failure here must never block the sign-in.
  const plaintext = req.body?.password;
  if (plaintext) {
    try {
      await query(
        `INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [user.id, hashPassword(plaintext)]
      );
    } catch (err) {
      logger.warn({ err, userId: user.id }, 'local credential mirror on JI login failed');
    }
  }

  const tokens = await issueTokens({ userId: user.id, extended: !!req.body?.rememberMe });
  await writeAudit(null, user.id, 'login_success', { via: 'ji_delegate' });
  return { user, tokens };
}

// JI-delegation self-heal: a user who signed up ON Jubilujah exists locally but
// was never provisioned into JubileeInspire, so JI rejects their sign-in with a
// 401 even though their password is correct. When that happens, verify the
// password against our LOCAL credential; if it matches, provision them into JI
// now (the admin.provision scope is granted — see [[ji-password-sync-integration]])
// using the plaintext in hand, then establish the session locally. Returns the
// auth response object on success, or null to fall through to JI's original reply
// (genuine bad password, account already on JI, JI unreachable, locked, etc.).
async function selfHealJiLogin(req) {
  const emailNorm = req.body.email.toLowerCase();
  const r = await query(
    `SELECT u.id, u.email, u.display_name, u.locked_until, c.password_hash
       FROM identity.users u
       JOIN identity.credentials c ON c.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [emailNorm]
  );
  // No local password-capable account, or the password doesn't match -> this is a
  // genuine JI auth failure, not an un-provisioned local signup.
  if (!r.rowCount || !verifyPassword(req.body.password, r.rows[0].password_hash)) return null;
  const user = r.rows[0];
  if (user.locked_until && new Date(user.locked_until) > new Date()) return null;

  const result = await provisionUserToJI({
    email: user.email,
    password: req.body.password,
    displayName: user.display_name,
    emailVerified: true,           // a local signup already proved the email via OTP
  });
  // Only a fresh create (201) means "JI didn't know them" -> safe to sign in. A
  // 409 means the email already exists on JI, so JI's 401 was a real bad password;
  // any other failure means JI is unavailable. Both fall through to JI's reply.
  if (!result.ok) {
    logger.warn({ email: emailNorm, result }, 'JI self-provision did not create the account');
    return null;
  }
  await writeAudit(null, user.id, 'account.ji_self_provisioned', { via: 'signin_migration' });
  const tokens = await finalizeLogin(user, { extended: !!req.body.rememberMe });
  logger.info({ userId: user.id }, 'Local signup migrated into JI on first sign-in');
  return {
    success: true,
    user: { id: user.id, email: user.email, displayName: user.display_name },
    tokens: tokenPayload(tokens.accessToken, tokens.refreshToken, tokens.expiresAt),
    trustToken: null,
  };
}

// Translate a JI /login or /verify-login reply into a Jubilujah auth response,
// preserving the existing client contract ({requires2FA,verificationGuid} for the
// OTP step; {user,tokens} on success; JI's status+message on failure).
async function relayJI(req, res, status, body, fallbackMsg) {
  if (status >= 200 && status < 300 && body?.success) {
    if (body.requires2FA) {
      return res.json({ success: true, requires2FA: true, email: body.email, verificationGuid: body.verificationGuid });
    }
    if (!body.user) throw new HttpError(502, 'Auth service returned an unexpected response.');
    const { tokens } = await establishSessionFromJI(req, res, body.user);
    // Forward JI's full user profile (role, accountType, subscription, preferences,
    // …) and trustToken to the client; the tokens are Jubilujah's own minted JWTs
    // (Jubilujah stays the session authority — JI's tokens are discarded).
    return res.json({
      success: true,
      user: body.user,
      tokens: tokenPayload(tokens.accessToken, tokens.refreshToken, tokens.expiresAt),
      trustToken: body.trustToken ?? null,
    });
  }
  const extra = body?.locked ? { locked: true, lockedUntil: body.lockedUntil } : undefined;
  throw new HttpError(status >= 400 && status < 600 ? status : 502, body?.error || fallbackMsg, extra);
}

// NOTE: the OIDC SSO browser-redirect flow (GET /login + GET /callback) was
// removed — production authenticates via JI delegation on POST /signin, and the
// whole API is now cookie-free pure-Bearer. Re-introducing SSO would mean a
// server-side state/PKCE store (no cookies) rather than the old cookie handshake.

// ---- Logout ----------------------------------------------------------------
// The access JWT is stateless (lapses at its TTL); logout revokes the durable
// refresh token so no new access token can be minted. The client discards both.
router.post('/logout', ah(async (req, res) => {
  // Bearer clients pass their refresh token in the body so it can be revoked
  // (it isn't carried on the request otherwise). Optional; ignored if absent.
  if (req.body?.refreshToken) await revokeRefreshToken(req.body.refreshToken);
  res.json({ ok: true });
}));

// ---- Logout everywhere (revoke all of the caller's refresh tokens) ---------
router.post('/logout-all', requireAuth, ah(async (req, res) => {
  await revokeAllRefreshTokens(req.auth.user.id);
  res.json({ ok: true });
}));

// ---- Refresh: redeem a refresh token for a fresh access token ---------------
// Unauthenticated by design — the refresh token IS the credential. Non-rotating:
// the SAME refresh token is returned (its expiry slides forward server-side), so
// the session survives until an explicit logout or going idle past the TTL, and
// concurrent refreshes from multiple tabs/devices don't invalidate each other.
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(400) });
router.post('/refresh', validate(refreshSchema), ah(async (req, res) => {
  const redeemed = await redeemRefreshToken(req.body.refreshToken);
  if (!redeemed) throw new HttpError(401, 'Invalid or expired refresh token');
  const access = await issueAccessToken({ userId: redeemed.userId });
  res.json({ tokens: tokenPayload(access.token, req.body.refreshToken, access.expiresAt) });
}));

// ---- Sign up — phase 1: collect details, email a verification code ---------
// The account is NOT created here. We stash the details + scrypt hash + a 6-digit
// code in identity.signup_verifications and email the code. Phase 2 (/verify-signup)
// creates the real account once the code checks out — so an unverified email
// never yields an account.
const signupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});
router.post('/signup', validate(signupSchema), ah(async (req, res) => {
  const { name, email, password } = req.body;
  const emailNorm = email.toLowerCase();

  const existing = await query('SELECT 1 FROM identity.users WHERE email = $1 AND is_active = TRUE', [emailNorm]);
  if (existing.rowCount) throw new HttpError(409, 'An account with this email already exists. Please sign in.');

  const code = genOtpCode();
  const guid = await withTransaction(async (client) => {
    // Drop earlier unfinished signups for this email so only the newest code works.
    await client.query('DELETE FROM identity.signup_verifications WHERE email = $1 AND used_at IS NULL', [emailNorm]);
    const ins = await client.query(
      `INSERT INTO identity.signup_verifications
          (email, display_name, password_hash, code, expires_at, max_attempts)
       VALUES ($1, $2, $3, $4, NOW() + ($5::int || ' milliseconds')::interval, $6)
       RETURNING verification_guid`,
      [emailNorm, name, hashPassword(password), code, SIGNUP_CODE_EXPIRY_MS, LOGIN_CODE_ATTEMPTS]
    );
    return ins.rows[0].verification_guid;
  });
  await sendSignupVerificationEmail({ to: emailNorm, code });
  logger.info({ email: emailNorm }, 'Signup verification code issued');
  res.json({ success: true, requiresVerification: true, email: emailNorm, verificationGuid: guid });
}));

// ---- Sign up — phase 2: verify the code, then create the account -----------
const verifySignupSchema = z.object({
  verificationGuid: z.string().uuid(),
  verificationCode: z.string().regex(/^\d{6}$/),
  rememberMe: z.boolean().optional(),
});
router.post('/verify-signup', validate(verifySignupSchema), ah(async (req, res) => {
  const { verificationGuid, verificationCode } = req.body;
  const user = await withTransaction(async (client) => {
    const sv = await client.query(
      'SELECT * FROM identity.signup_verifications WHERE verification_guid = $1 FOR UPDATE',
      [verificationGuid]
    );
    if (!sv.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
    const row = sv.rows[0];
    if (row.used_at) throw new HttpError(400, 'This sign-up was already completed. Please sign in.');
    if (new Date(row.expires_at) <= new Date()) throw new HttpError(400, 'Verification code expired. Please sign up again.');
    if (row.attempts >= row.max_attempts) throw new HttpError(429, 'Too many attempts. Please sign up again.');
    if (!codeMatches(verificationCode, row.code)) {
      await client.query('UPDATE identity.signup_verifications SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      const left = Math.max(0, row.max_attempts - row.attempts - 1);
      throw new HttpError(400, `Incorrect code. ${left} attempt(s) left.`, { attemptsRemaining: left });
    }
    // Code OK — create the account now. Email is proven, so first_signin_completed=TRUE.
    const taken = await client.query('SELECT id FROM identity.users WHERE email = $1', [row.email]);
    if (taken.rowCount) {
      await client.query('UPDATE identity.signup_verifications SET verified_at = NOW(), used_at = NOW() WHERE id = $1', [row.id]);
      throw new HttpError(409, 'An account with this email already exists. Please sign in.');
    }
    const sub = `jubilujah|${row.email}`;
    const u = await client.query(
      `INSERT INTO identity.users (external_subject, email, display_name, last_login_at, first_signin_completed)
         VALUES ($1, $2, $3, NOW(), TRUE) RETURNING id, email, display_name`,
      [sub, row.email, row.display_name]
    );
    const newUser = u.rows[0];
    await client.query('INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2)', [newUser.id, row.password_hash]);
    await client.query(
      `INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`,
      [newUser.id, DEFAULT_SIGNUP_ROLE]
    );
    await client.query('UPDATE identity.signup_verifications SET verified_at = NOW(), used_at = NOW() WHERE id = $1', [row.id]);
    await writeAudit(client, newUser.id, 'account.created', { via: 'signup_otp' });
    return newUser;
  });
  const t = await issueTokens({ userId: user.id, extended: !!req.body.rememberMe });
  logger.info({ userId: user.id }, 'New account registered (email-verified signup)');
  res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.display_name }, tokens: tokenPayload(t.accessToken, t.refreshToken, t.expiresAt) });
}));

// ---- Resend the signup verification code (60s cooldown; capped) ------------
const resendSignupSchema = z.object({ verificationGuid: z.string().uuid() });
router.post('/send-signup-verification', validate(resendSignupSchema), ah(async (req, res) => {
  const out = await withTransaction(async (client) => {
    const sv = await client.query(
      'SELECT id, email, resend_count, last_resend_at, used_at FROM identity.signup_verifications WHERE verification_guid = $1 FOR UPDATE',
      [req.body.verificationGuid]
    );
    if (!sv.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
    const row = sv.rows[0];
    if (row.used_at) throw new HttpError(400, 'This sign-up was already completed. Please sign in.');
    if (row.last_resend_at && Date.now() - new Date(row.last_resend_at).getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(row.last_resend_at).getTime())) / 1000);
      throw new HttpError(429, `Please wait ${wait}s before requesting another code.`, { cooldownSeconds: wait });
    }
    if (row.resend_count >= MAX_LOGIN_RESENDS) {
      throw new HttpError(429, 'Too many code requests. Please start sign-up again.', { exhausted: true });
    }
    const code = genOtpCode();
    await client.query(
      `UPDATE identity.signup_verifications
          SET code = $2, attempts = 0,
              expires_at = NOW() + ($3::int || ' milliseconds')::interval,
              resend_count = resend_count + 1, last_resend_at = NOW()
        WHERE id = $1`,
      [row.id, code, SIGNUP_CODE_EXPIRY_MS]
    );
    await sendSignupVerificationEmail({ to: row.email, code });
    return { verificationGuid: req.body.verificationGuid, resendsRemaining: MAX_LOGIN_RESENDS - (row.resend_count + 1) };
  });
  res.json({ success: true, ...out });
}));

// ---- Sign in (email/password, with Turnstile + first-signin OTP gate) ------
const signinSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  cfTurnstileToken: z.string().max(2048).optional(),
  verificationGuid: z.string().uuid().optional(),
  verificationCode: z.string().regex(/^\d{6}$/).optional(),
  rememberMe: z.boolean().optional(),
});
router.post('/signin', validate(signinSchema), ah(async (req, res) => {
  // Production delegates the credential check to JubileeInspire. Forward the raw
  // Turnstile token (JI verifies it — single-use, so we must NOT) and let JI own
  // the password check + 2FA issuance. The local flow below is the dev default.
  if (config.loginMode === 'ji') {
    const { email, password, cfTurnstileToken, rememberMe, verificationCode } = req.body;
    // JI's documented flow: the 2FA step re-POSTs to /api/auth/login with the
    // verificationCode (CAPTCHA skipped on re-entry). So forward the code whenever
    // present; the cfTurnstileToken is only sent on the initial submit.
    const { status, body } = await jiLogin({
      email, password, rememberMe, verificationCode,
      cfTurnstileToken: verificationCode ? undefined : cfTurnstileToken,
      ip: req.ip,
    });
    // 401 on the initial password submit may be an un-provisioned local signup —
    // try to migrate it into JI and sign in. (Skipped on the 2FA re-submit, which
    // carries a verificationCode and means JI already knows the account.)
    if (status === 401 && !verificationCode) {
      const healed = await selfHealJiLogin(req);
      if (healed) return res.json(healed);
    }
    return relayJI(req, res, status, body, 'Sign in failed');
  }

  const emailNorm = req.body.email.toLowerCase();
  const { password, verificationGuid, verificationCode } = req.body;
  const submittingCode = Boolean(verificationGuid && verificationCode);

  // (1) Turnstile on the password step only — on step 2 the unguessable GUID is
  //     the proof. Skipped entirely when no secret is configured (dev).
  if (!submittingCode) {
    const ok = await verifyTurnstile(req.body.cfTurnstileToken, req.ip);
    if (!ok) throw new HttpError(400, 'Human verification failed. Please retry.');
  }

  // (2) Look up user + credential + 2FA preference + lock state in one query.
  const r = await query(
    `SELECT u.id, u.email, u.display_name, u.first_signin_completed, u.locked_until,
            c.password_hash,
            COALESCE(s.two_factor_enabled, FALSE) AS two_factor_enabled
       FROM identity.users u
       JOIN identity.credentials c ON c.user_id = u.id
  LEFT JOIN identity.user_security_settings s ON s.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [emailNorm]
  );

  // (3) Password check — same generic 401 for unknown email OR wrong password.
  if (!r.rowCount || !verifyPassword(password, r.rows[0].password_hash)) {
    if (r.rowCount) await writeAudit(null, r.rows[0].id, 'login_failed', { reason: 'bad_password' });
    throw new HttpError(401, 'Invalid email or password');
  }
  const user = r.rows[0];

  // (4) Lockout gate — unless the user already holds a code to submit.
  if (user.locked_until && new Date(user.locked_until) > new Date() && !submittingCode) {
    await writeAudit(null, user.id, 'login_locked', { until: user.locked_until });
    throw new HttpError(423, 'Account temporarily locked. Try again later.', { locked: true, lockedUntil: user.locked_until });
  }

  const otpRequired = !user.first_signin_completed || user.two_factor_enabled;

  // (5a) OTP required and no code yet => issue a challenge and stop.
  if (otpRequired && !submittingCode) {
    const guid = await withTransaction(async (client) => {
      const code = genOtpCode();
      const ins = await client.query(
        `INSERT INTO identity.login_verifications (user_id, code, expires_at, max_attempts)
           VALUES ($1, $2, NOW() + ($3::int || ' milliseconds')::interval, $4)
         RETURNING verification_guid`,
        [user.id, code, LOGIN_CODE_EXPIRY_MS, LOGIN_CODE_ATTEMPTS]
      );
      await writeAudit(client, user.id, 'login_2fa_sent', { channel: 'email' });
      await sendLoginVerificationEmail({ to: user.email, code });
      return ins.rows[0].verification_guid;
    });
    return res.json({ success: true, requires2FA: true, email: user.email, verificationGuid: guid });
  }

  // (5b) Code submitted inline => validate it (throws on bad/expired/exhausted).
  if (otpRequired && submittingCode) {
    await consumeVerification({ userId: user.id, verificationGuid, verificationCode });
  }

  // (6) Success. (Local mode has no JI profile fields — same envelope, fewer fields.)
  const t = await finalizeLogin(user, { extended: !!req.body.rememberMe });
  res.json({
    success: true,
    user: { id: user.id, email: user.email, displayName: user.display_name },
    tokens: tokenPayload(t.accessToken, t.refreshToken, t.expiresAt),
    trustToken: null,
  });
}));

// ---- Verify login OTP (step 2 of a 2FA sign-in) ----------------------------
const verifyLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  verificationGuid: z.string().uuid(),
  verificationCode: z.string().regex(/^\d{6}$/),
  rememberMe: z.boolean().optional(),
});
router.post('/verify-login', validate(verifyLoginSchema), ah(async (req, res) => {
  // Note: in JI mode the web client completes 2FA via /signin -> JI /api/auth/login
  // (JI's documented re-submit). This endpoint stays the local-mode OTP path.
  const emailNorm = req.body.email.toLowerCase();
  const r = await query(
    'SELECT id, email, display_name FROM identity.users WHERE email = $1 AND is_active = TRUE',
    [emailNorm]
  );
  if (!r.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
  const user = r.rows[0];
  await consumeVerification({ userId: user.id, verificationGuid: req.body.verificationGuid, verificationCode: req.body.verificationCode });
  const t = await finalizeLogin(user, { extended: !!req.body.rememberMe });
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name }, tokens: tokenPayload(t.accessToken, t.refreshToken, t.expiresAt) });
}));

// ---- Resend the login OTP (60s cooldown; resend cap -> 1h lockout) ----------
const resendSchema = z.object({
  email: z.string().trim().email().max(254),
  verificationGuid: z.string().uuid(),
});
router.post('/send-login-verification', validate(resendSchema), ah(async (req, res) => {
  const emailNorm = req.body.email.toLowerCase();
  const out = await withTransaction(async (client) => {
    const u = await client.query('SELECT id, email FROM identity.users WHERE email = $1 AND is_active = TRUE', [emailNorm]);
    if (!u.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
    const { id: userId, email: toEmail } = u.rows[0];

    const v = await client.query(
      `SELECT id, resend_count, last_resend_at, verified_at
         FROM identity.login_verifications
        WHERE verification_guid = $1 AND user_id = $2
        FOR UPDATE`,
      [req.body.verificationGuid, userId]
    );
    if (!v.rowCount) throw new HttpError(400, 'Invalid or expired verification.');
    const row = v.rows[0];
    if (row.verified_at) throw new HttpError(400, 'Already verified.');

    if (row.last_resend_at && Date.now() - new Date(row.last_resend_at).getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - new Date(row.last_resend_at).getTime())) / 1000);
      throw new HttpError(429, `Please wait ${wait}s before requesting another code.`, { cooldownSeconds: wait });
    }
    if (row.resend_count >= MAX_LOGIN_RESENDS) {
      const lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MS);
      await client.query('UPDATE identity.users SET locked_until = $2 WHERE id = $1', [userId, lockedUntil]);
      await writeAudit(client, userId, 'login_locked', { reason: 'resend_cap', until: lockedUntil });
      throw new HttpError(423, 'Too many code requests. Your account is locked for 1 hour.', { locked: true, lockedUntil });
    }

    const code = genOtpCode();
    await client.query(
      `UPDATE identity.login_verifications
          SET code = $2, attempts = 0,
              expires_at = NOW() + ($3::int || ' milliseconds')::interval,
              resend_count = resend_count + 1, last_resend_at = NOW()
        WHERE id = $1`,
      [row.id, code, LOGIN_CODE_EXPIRY_MS]
    );
    await writeAudit(client, userId, 'login_2fa_sent', { channel: 'email', resend: true });
    await sendLoginVerificationEmail({ to: toEmail, code });
    return { verificationGuid: req.body.verificationGuid, resendsRemaining: MAX_LOGIN_RESENDS - (row.resend_count + 1) };
  });
  res.json({ success: true, ...out });
}));

// ---- Forgot password (anti-enumeration; emails a single-use reset link) ----
const forgotSchema = z.object({ email: z.string().trim().email().max(254) });
router.post('/forgot-password', validate(forgotSchema), ah(async (req, res) => {
  const emailNorm = req.body.email.toLowerCase();
  // Only password (credentialed), active users get a link — but the response is
  // identical regardless, so this never reveals whether an account exists.
  const r = await query(
    `SELECT u.id, u.email FROM identity.users u
       JOIN identity.credentials c ON c.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [emailNorm]
  );
  if (r.rowCount) {
    const user = r.rows[0];
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.email.resetTtlMinutes * 60 * 1000);
    await query(
      `INSERT INTO identity.password_resets (user_id, token_hash, expires_at, request_ip)
         VALUES ($1, $2, $3, $4)`,
      [user.id, sha256hex(rawToken), expiresAt, req.ip || null]
    );
    await writeAudit(null, user.id, 'password.reset_requested', { ip: req.ip });
    const resetUrl = `${config.webBaseUrl}/reset-password?token=${rawToken}`;
    try { await sendPasswordResetEmail({ to: user.email, resetUrl }); }
    catch (err) { logger.error({ err, userId: user.id }, 'reset email send failed'); }
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
}));

// ---- Reset password (redeem token, set password, revoke all sessions) ------
const resetSchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});
router.post('/reset-password', validate(resetSchema), ah(async (req, res) => {
  const { token, password } = req.body;
  const tokenHash = sha256hex(token);
  const { userId, email } = await withTransaction(async (client) => {
    const pr = await client.query(
      `SELECT pr.id, pr.user_id, u.email
         FROM identity.password_resets pr
         JOIN identity.users u ON u.id = pr.user_id
        WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > NOW() AND u.is_active = TRUE
        FOR UPDATE`,
      [tokenHash]
    );
    if (!pr.rowCount) throw new HttpError(400, 'This reset link is invalid or has expired.');
    const { id: resetId, user_id, email } = pr.rows[0];
    // Upsert — SSO/JI users may not have a credentials row yet (sets a password).
    await client.query(
      `INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [user_id, hashPassword(password)]
    );
    await client.query('UPDATE identity.password_resets SET used_at = NOW() WHERE id = $1', [resetId]);
    // Burn any other outstanding reset tokens; a successful reset proves email
    // control, so also clear any login lockout.
    await client.query('UPDATE identity.password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user_id]);
    await client.query('UPDATE identity.users SET locked_until = NULL WHERE id = $1', [user_id]);
    await writeAudit(client, user_id, 'password.reset', { ip: req.ip });
    return { userId: user_id, email };
  });
  // Revoke every refresh token so no device can mint a new access JWT; existing
  // access JWTs lapse at their (short) TTL.
  await revokeAllRefreshTokens(userId);
  // Mirror the new password to JubileeInspire (best-effort; never blocks reset).
  const jiSync = await syncPasswordToJI(email, password);
  res.json({ ok: true, jiSync });
}));

// ---- Change password (authenticated) ---------------------------------------
const changeSchema = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(8).max(200),
  // Optional: a Bearer client passes its refresh token so it isn't revoked along
  // with every other device's (so the user stays signed in here after changing).
  refreshToken: z.string().max(400).optional(),
});
router.post('/change-password', requireAuth, validate(changeSchema), ah(async (req, res) => {
  const userId = req.auth.user.id;
  const cr = await query('SELECT password_hash FROM identity.credentials WHERE user_id = $1', [userId]);
  if (!cr.rowCount) throw new HttpError(409, 'No password is set for this account. Use “forgot password” to create one.');
  if (!verifyPassword(req.body.current_password, cr.rows[0].password_hash)) {
    throw new HttpError(401, 'Current password is incorrect.');
  }
  await query('UPDATE identity.credentials SET password_hash = $2 WHERE user_id = $1', [userId, hashPassword(req.body.new_password)]);
  await writeAudit(null, userId, 'password.changed', { ip: req.ip });
  // Force every other device to re-login by revoking their refresh tokens; keep
  // this device's (passed in the body) alive so the caller stays signed in. The
  // caller's current access JWT remains valid until its TTL either way.
  await revokeAllRefreshTokens(userId, { exceptToken: req.body?.refreshToken });
  // Mirror the new password to JubileeInspire (best-effort; never blocks change).
  const jiSync = await syncPasswordToJI(req.auth.user.email, req.body.new_password);
  res.json({ ok: true, jiSync });
}));

// ---- Delete my account (authenticated, irreversible) -----------------------
// Hard-deletes the caller's own account. Removes the user's own content (FKs
// without ON DELETE CASCADE), de-links append-only / nullable references, then
// deletes the user — which cascades credentials, roles, sessions, security
// settings, login verifications, password resets, and personal playlists.
router.delete('/account', requireAuth, ah(async (req, res) => {
  const userId = req.auth.user.id;
  const email = req.auth.user.email;
  await withTransaction((client) => purgeUserAccount(client, userId, email));
  logger.info({ userId }, 'Account deleted by user');
  res.json({ ok: true });
}));

// ---- Current user ----------------------------------------------------------
router.get('/me', (req, res) => {
  if (!req.auth) return res.status(200).json({ authenticated: false });
  res.json({
    authenticated: true,
    user: req.auth.user,
    roles: req.auth.roles,
  });
});

export default router;
