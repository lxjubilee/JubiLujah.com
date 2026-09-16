// ============================================================================
// Jubilee Identity Authority (SSO) client — used when config.loginMode === 'sso'.
//
// The SSO (sso.jubileeinspire.com) is the SINGLE credential store for the family.
// It hashes with the SAME scrypt KDF JubileePraise uses, so a JubileePraise password (or a
// JubileePraise-computed scrypt hash) verifies there directly — no reset on migration.
//
// JubileePraise authenticates to the SSO as a trusted service CLIENT: it POSTs its
// client_id + client_secret to /api/auth/service/token, gets a short-lived bearer,
// and presents it on the service-gated endpoints below. The bearer is cached
// in-process until shortly before it expires; a 401 forces exactly one re-fetch.
//
//   POST /api/auth/service/token     { client_id, client_secret } -> { token, expiresAt }
//   POST /api/auth/login             { email, password, site }     -> { user, token, expiresAt } | 401
//   POST /api/auth/lookup            { email }                     -> { exists }
//   POST /api/auth/service/provision { email, first_name, last_name, password_hash, site } -> 201 { user } | 409
//   POST /api/auth/service/password  { email, new_password }       -> { success }
// ============================================================================
import { config } from '../config.js';
import { logger } from '../logger.js';

const TOKEN_PATH = '/api/auth/service/token';
const LOGIN_PATH = '/api/auth/login';
const LOOKUP_PATH = '/api/auth/lookup';
const PROVISION_PATH = '/api/auth/service/provision';
const SET_PASSWORD_PATH = '/api/auth/service/password';
const SKEW_MS = 60_000; // refresh a little before the real expiry

let cached = null; // { token: string, expiresAt: number(ms epoch) }

export function ssoEnabled() {
  return Boolean(config.sso.clientId && config.sso.clientSecret);
}

async function fetchToken() {
  const { baseUrl, clientId, clientSecret } = config.sso;
  const res = await fetch(`${baseUrl}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SSO token endpoint ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.token || data.access_token;
  if (!token) throw new Error('SSO token endpoint returned no token');
  const parsed = data.expiresAt ? Date.parse(data.expiresAt) : NaN;
  const exp = Number.isNaN(parsed) ? Date.now() + 30 * 60_000 : parsed;
  cached = { token, expiresAt: exp - SKEW_MS };
  return token;
}

async function getToken(forceRefresh = false) {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  return fetchToken();
}

// ---- Keep the service bearer warm ------------------------------------------
// 🔴 A TICKET ARRIVAL MUST NOT PAY FOR A TOKEN. Family-ticket arrivals are rare,
// so the cached bearer had nearly always expired when one came in, and every
// arrival spent ~700 ms fetching a fresh one — on a redeem the web middleware
// was abandoning at 2.5 s (measured 2026-09-16; see middleware.ts). Fetch once at
// start-up and refresh ahead of expiry, so the token is simply there.
//
// Failures are logged and retried on the next tick; nothing here can stop the
// API starting. unref(): the timer never keeps the process alive on its own.
const KEEP_WARM_MS = 5 * 60_000;
function keepTokenWarm() {
  if (!ssoEnabled()) return;
  const refresh = () => {
    // Refresh when less than two ticks of life remain.
    if (cached && cached.expiresAt - Date.now() > 2 * KEEP_WARM_MS) return;
    fetchToken().catch((err) => logger.warn({ err: String(err?.message || err) }, 'SSO service token pre-fetch failed'));
  };
  refresh();
  setInterval(refresh, KEEP_WARM_MS).unref();
}
if (process.env.NODE_ENV !== 'test') keepTokenWarm();

// Call a service-gated SSO endpoint with the cached bearer; refresh once on 401.
// Returns { status, body } — the caller decides how to interpret it.
async function callSso(path, payload, { retryOn401 = true } = {}) {
  const doPost = (token) =>
    fetch(`${config.sso.baseUrl}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  let token = await getToken();
  let res = await doPost(token);
  if (res.status === 401 && retryOn401) {
    cached = null;
    token = await getToken(true);
    res = await doPost(token);
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// Verify an email+password at the SSO. { status, body } — 200 body has { user, ... }.
export function ssoLogin({ email, password }) {
  return callSso(LOGIN_PATH, { email, password, site: config.sso.site });
}

// Does a Jubilee ID exist for this email? Resolves to a result object; never throws.
//   { ok:true, exists } | { ok:false, error }
export async function ssoLookup(email) {
  try {
    const { status, body } = await callSso(LOOKUP_PATH, { email });
    if (status !== 200) return { ok: false, error: `lookup ${status}` };
    return { ok: true, exists: body.exists === true };
  } catch (err) {
    logger.warn({ err, email }, 'SSO lookup error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// Create the identity in the SSO from a PRE-COMPUTED scrypt hash (two-phase signup:
// the plaintext is gone by phase 2, but the scrypt hash we stored IS an SSO hash).
//   { ok:true, created } | { ok:false, conflict } | { ok:false, status|error }
export async function ssoProvisionHash({ email, firstName, lastName, passwordHash }) {
  try {
    const { status, body } = await callSso(PROVISION_PATH, {
      email,
      first_name: firstName,
      last_name: lastName,
      password_hash: passwordHash,
      site: config.sso.site,
    });
    if (status === 201) return { ok: true, created: true, user: body.user };
    if (status === 409) return { ok: false, conflict: true, user: body.user };
    return { ok: false, status };
  } catch (err) {
    logger.error({ err, email }, 'SSO provision error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// Update an existing identity's profile (first/last/DOB) at the SSO, by email.
// Used when a person edits the pre-filled details while joining a new family site,
// so the change propagates to the shared Jubilee ID.
//   { ok:true, user } | { ok:false, status|error }
export async function ssoUpdateProfile(email, patch) {
  try {
    const { status, body } = await callSso('/api/auth/service/profile', { email, ...patch });
    if (status === 200) return { ok: true, user: body.user };
    return { ok: false, status };
  } catch (err) {
    logger.error({ err, email }, 'SSO update-profile error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// Set/overwrite a user's password in the SSO (forgot-reset and change-password).
//   { ok:true } | { ok:false, status|error }
export async function ssoSetPassword(email, newPassword) {
  try {
    const { status } = await callSso(SET_PASSWORD_PATH, { email, new_password: newPassword });
    if (status === 200) return { ok: true };
    return { ok: false, status };
  } catch (err) {
    logger.error({ err, email }, 'SSO set-password error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// ---- Cross-site sign-in (SSO migration 003) --------------------------------
//
// The same four calls JubileeInspire's API makes (api/services/sso-authority.js
// on that box). A family session lives 90 days at the SSO; what travels between
// sites is a TICKET — 32 random bytes, one use, about a minute — so a URL caught
// in a log or a Referer header is dead before anyone can replay it.
//
// None of these throw. Every failure comes back as { ok:false }, and every
// caller treats that as "carry on signed out", never as an error to show.

// Spend a one-time ticket and learn who it belongs to. The SSO burns the ticket
// on the first call whether or not the rest succeeds, so NEVER retry this on a
// non-network failure — the second attempt can only be invalid_ticket.
//   { ok:true, user } | { ok:false, status|error }
export async function ssoRedeemTicket(ticket, audience = null) {
  if (!ticket) return { ok: false, error: 'no_ticket' };
  try {
    // No retry on 401, as the note above says and as this call did anyway until
    // 2026-09-16: callSso's generic 401-refresh re-posted the SAME ticket, which
    // the SSO had already burned, so the retry could only answer invalid_ticket —
    // after a second token fetch. The warm token (keepTokenWarm) is what prevents
    // a stale bearer here; a retry never could.
    const { status, body } = await callSso('/api/auth/ticket/redeem', { ticket, audience }, { retryOn401: false });
    if (status === 200 && body?.user?.email) return { ok: true, user: body.user };
    return { ok: false, status, error: body?.error };
  } catch (err) {
    logger.warn({ err }, 'SSO ticket redeem error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// Open a 90-day family session for someone THIS site has already signed in.
// The session token never leaves the server: plant-url spends it for a ticket
// inside the same request.
//   { ok:true, sessionToken } | { ok:false, status|error }
export async function ssoOpenSession(email) {
  if (!email) return { ok: false, error: 'no_email' };
  try {
    const { status, body } = await callSso('/api/auth/session/open', { email, site: config.sso.site });
    if (status === 200 && body?.sessionToken) return { ok: true, sessionToken: body.sessionToken };
    return { ok: false, status };
  } catch (err) {
    logger.warn({ err, email }, 'SSO session open error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// Mint a one-time ticket from a live family session.
//   { ok:true, ticket } | { ok:false, status|error }
export async function ssoIssueTicket(sessionToken, audience = null) {
  if (!sessionToken) return { ok: false, error: 'no_session' };
  try {
    const { status, body } = await callSso('/api/auth/ticket/issue', { sessionToken, audience });
    if (status === 200 && body?.ticket) return { ok: true, ticket: body.ticket };
    return { ok: false, status };
  } catch (err) {
    logger.warn({ err }, 'SSO ticket issue error');
    return { ok: false, error: String(err?.message || err) };
  }
}

// End EVERY family session for an identity — what signing out has to mean once
// a browser holds one session per sign-in plus one per plant. Revoking only one
// token left the planted session alive to sign the person straight back in.
//   { ok:true, revoked } | { ok:false, status|error }
export async function ssoRevokeAllSessions(email) {
  if (!email) return { ok: false, error: 'no_email' };
  try {
    const { status, body } = await callSso('/api/auth/session/revoke-all', { email });
    if (status === 200) return { ok: true, revoked: body?.revoked || 0 };
    return { ok: false, status };
  } catch (err) {
    logger.warn({ err, email }, 'SSO revoke-all error');
    return { ok: false, error: String(err?.message || err) };
  }
}
