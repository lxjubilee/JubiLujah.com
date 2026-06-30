// ============================================================================
// Inbound credential delegation -> JubileeInspire.
//
// When config.loginMode === 'ji' (production), Jubilujah does NOT verify the
// password locally. Instead /api/auth/signin forwards the credentials to JI's
// POST /api/auth/login and trusts JI's verdict; on success we upsert the
// returned user into our own identity.users and mint OUR OWN session (Jubilujah
// stays the session authority — JI is only the credential authority).
//
// JI verifies the Cloudflare Turnstile token itself, so we MUST forward the raw
// token and never call siteverify locally (the token is single-use). The real
// client IP is forwarded as X-Forwarded-For so JI's rate-limit / lockout /
// captcha-remoteip see the visitor, not this server.
//
// Contract (JI /var/www/jubileeinspire.com/api/routes/auth.js):
//   POST {base}/api/auth/login         { email, password, source, cfTurnstileToken, rememberMe, verificationCode? }
//   POST {base}/api/auth/verify-login  { verificationGuid, code }
// Both reply { success, ... }:
//   success      -> { success:true, user:{id,email,displayName,firstName,lastName,role,...}, tokens, trustToken }
//   2FA required -> { success:true, requires2FA:true, email, verificationGuid }
//   failure      -> { success:false, error, captchaFailed?|locked?|lockedUntil? } with a 4xx status
// ============================================================================
import { config } from '../config.js';
import { logger } from '../logger.js';

const LOGIN_PATH = '/api/auth/login';
const VERIFY_PATH = '/api/auth/verify-login';

async function jiPost(path, payload, ip) {
  const url = `${config.jiLogin.baseUrl}${path}`;
  const headers = { 'content-type': 'application/json' };
  if (ip) headers['x-forwarded-for'] = ip; // let JI attribute the real visitor
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (err) {
    logger.error({ err, path }, 'JI login upstream unreachable');
    throw new Error('auth_upstream_unreachable');
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Initial password submit (and optional inline 2FA re-submit). Returns the raw
// { status, body } from JI for the route to translate.
export function jiLogin({ email, password, cfTurnstileToken, rememberMe, verificationCode, ip }) {
  const payload = { email, password, source: config.jiLogin.source, rememberMe: !!rememberMe };
  if (cfTurnstileToken) payload.cfTurnstileToken = cfTurnstileToken;
  if (verificationCode) payload.verificationCode = verificationCode;
  return jiPost(LOGIN_PATH, payload, ip);
}

// Complete a 2FA challenge JI issued (verificationGuid + the 6-digit code).
export function jiVerifyLogin({ verificationGuid, code, ip }) {
  return jiPost(VERIFY_PATH, { verificationGuid, code }, ip);
}
