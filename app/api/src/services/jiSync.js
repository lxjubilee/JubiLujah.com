// ============================================================================
// Outbound password sync -> JubileeInspire (shared SSO credential).
//
// When a Jubilujah user changes or resets their password, we mirror it to
// JubileeInspire so a single credential works on both platforms. Two-step,
// client-credentials flow (Jubilujah is the trusted service CLIENT):
//
//   1. POST {base}/api/auth/service/token  { client_id, client_secret }
//        -> { access_token, token_type:"Bearer", expires_in, scope }
//   2. POST {base}/api/auth/admin/set-password
//        Authorization: Bearer <access_token>
//        { email, newPassword }   -> 200 { ok:true }
//
// The Bearer token is cached in-process until shortly before it expires and
// reused across syncs; a 401 triggers exactly one forced re-fetch + retry.
//
// Best-effort by design: this NEVER throws to the caller and never blocks the
// local password change from succeeding. A failure is logged (with status/body)
// and returned as { ok:false } so the route can surface a soft warning and ops
// can reconcile. Disabled (no-op) when no client secret is configured.
// ============================================================================
import { config } from '../config.js';
import { logger } from '../logger.js';

const TOKEN_PATH = '/api/auth/service/token';
const SET_PASSWORD_PATH = '/api/auth/admin/set-password';
const PROVISION_PATH = '/api/auth/admin/provision-user';
const SKEW_MS = 30_000; // refresh a little before the real expiry

let cached = null; // { token: string, expiresAt: number(ms epoch) }

export function jiSyncEnabled() {
  return Boolean(config.jiSync.clientId && config.jiSync.clientSecret);
}

async function fetchToken() {
  const { baseUrl, clientId, clientSecret } = config.jiSync;
  const res = await fetch(`${baseUrl}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`token endpoint ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.access_token || data.token;
  if (!token) throw new Error('token endpoint returned no access_token');
  const ttlSec = Number(data.expires_in) || 600;
  cached = { token, expiresAt: Date.now() + ttlSec * 1000 - SKEW_MS };
  return token;
}

async function getToken(forceRefresh = false) {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.token;
  return fetchToken();
}

async function postSetPassword(token, email, newPassword) {
  return fetch(`${config.jiSync.baseUrl}${SET_PASSWORD_PATH}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email, newPassword }),
  });
}

/**
 * Push a user's new password to JubileeInspire. Resolves to a result object;
 * never rejects.
 *   { ok:true }                       — synced
 *   { ok:false, skipped:true }        — sync disabled (no creds configured)
 *   { ok:false, status }              — JI rejected the set-password call
 *   { ok:false, error }               — network/parse/token failure
 */
export async function syncPasswordToJI(email, newPassword) {
  if (!jiSyncEnabled()) {
    logger.info('JI password sync disabled (no service client secret configured)');
    return { ok: false, skipped: true };
  }
  if (!email || !newPassword) return { ok: false, error: 'missing email or password' };

  try {
    let token = await getToken();
    let res = await postSetPassword(token, email, newPassword);

    // Token expired/revoked between cache and use -> refresh once and retry.
    if (res.status === 401) {
      cached = null;
      token = await getToken(true);
      res = await postSetPassword(token, email, newPassword);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error({ email, status: res.status, body: body.slice(0, 300) }, 'JI set-password failed');
      return { ok: false, status: res.status };
    }

    logger.info({ email }, 'Password synced to JubileeInspire');
    return { ok: true };
  } catch (err) {
    logger.error({ err, email }, 'JI password sync error');
    return { ok: false, error: String(err?.message || err) };
  }
}

async function postProvision(token, payload) {
  return fetch(`${config.jiSync.baseUrl}${PROVISION_PATH}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Provision a Jubilujah-native account INTO JubileeInspire so JI (the prod
 * credential authority) can authenticate it. Same client-credentials token flow
 * as syncPasswordToJI; needs the `admin.provision` scope (already granted to the
 * `jubilujah` service client). Create-only on JI: an existing email is a 409.
 * Resolves to a result object; never rejects.
 *   { ok:true, created:true }    — newly created on JI (201)
 *   { ok:false, conflict:true }  — already exists on JI (409); NOT created
 *   { ok:false, skipped:true }   — sync disabled (no service creds configured)
 *   { ok:false, status }         — JI rejected the call
 *   { ok:false, error }          — network/token failure
 */
export async function provisionUserToJI({ email, password, displayName, role, emailVerified }) {
  if (!jiSyncEnabled()) {
    logger.info('JI provisioning disabled (no service client secret configured)');
    return { ok: false, skipped: true };
  }
  if (!email || !password) return { ok: false, error: 'missing email or password' };

  const payload = {
    email,
    password,
    role: role || 'user',                 // JI role enum (user|admin|guest)
    emailVerified: emailVerified === true,
    sourcePlatform: 'jubilujah',
  };
  if (displayName) payload.displayName = displayName;

  try {
    let token = await getToken();
    let res = await postProvision(token, payload);

    // Token expired/revoked between cache and use -> refresh once and retry.
    if (res.status === 401) {
      cached = null;
      token = await getToken(true);
      res = await postProvision(token, payload);
    }

    if (res.status === 201) {
      logger.info({ email }, 'Provisioned user into JubileeInspire');
      return { ok: true, created: true };
    }
    if (res.status === 409) {
      logger.info({ email }, 'JI provision: account already exists');
      return { ok: false, conflict: true };
    }
    const body = await res.text().catch(() => '');
    logger.error({ email, status: res.status, body: body.slice(0, 300) }, 'JI provision-user failed');
    return { ok: false, status: res.status };
  } catch (err) {
    logger.error({ err, email }, 'JI provision-user error');
    return { ok: false, error: String(err?.message || err) };
  }
}
