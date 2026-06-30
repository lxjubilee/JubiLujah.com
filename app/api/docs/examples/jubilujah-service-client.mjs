// Reference client for JubileeInspire -> Jubilujah server-to-server calls.
//
// Implements the client-credentials flow against api.jubilujah.com: fetches a
// short-lived HS256 JWT from /api/auth/service/token, caches it in memory,
// refreshes before expiry, de-dupes concurrent fetches, and retries once on a
// 401 (e.g. signing-key rotation). Then calls /api/auth/admin/* with the JWT as
// a Bearer token. Node 18+ (global fetch), zero dependencies.
//
// Configure via JI's environment:
//   JUBILUJAH_API_BASE       (default https://api.jubilujah.com)
//   JUBILUJAH_CLIENT_ID      (the id registered in Jubilujah's SERVICE_CLIENTS)
//   JUBILUJAH_CLIENT_SECRET  (that client's secret)
//   JUBILUJAH_SCOPE          (default "admin.set_password admin.provision")

const BASE = process.env.JUBILUJAH_API_BASE || 'https://api.jubilujah.com';
const CLIENT_ID = process.env.JUBILUJAH_CLIENT_ID;
const CLIENT_SECRET = process.env.JUBILUJAH_CLIENT_SECRET;
const SCOPE = process.env.JUBILUJAH_SCOPE || 'admin.set_password admin.provision';
const REFRESH_SKEW_MS = 30_000; // refresh this long before the token's exp

let cached = null;   // { token, expMs }
let inFlight = null; // shared promise so concurrent callers fetch once

async function fetchToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('JUBILUJAH_CLIENT_ID / JUBILUJAH_CLIENT_SECRET are not configured');
  }
  const res = await fetch(`${BASE}/api/auth/service/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: SCOPE,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Jubilujah token request failed: ${res.status} ${detail}`);
  }
  const { access_token, expires_in } = await res.json();
  cached = { token: access_token, expMs: Date.now() + expires_in * 1000 };
  return cached.token;
}

// Valid token, refreshing if missing/near-expiry. force=true ignores the cache.
async function getToken({ force = false } = {}) {
  if (!force && cached && Date.now() < cached.expMs - REFRESH_SKEW_MS) return cached.token;
  if (!inFlight) inFlight = fetchToken().finally(() => { inFlight = null; });
  return inFlight;
}

// POST to an admin endpoint with the bearer token. A 401 triggers exactly one
// forced refresh + retry (covers key rotation / clock skew); anything else is
// returned as-is for the caller to interpret.
async function callAdmin(path, body, { idempotencyKey } = {}) {
  const doCall = (token) => fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

  let res = await doCall(await getToken());
  if (res.status === 401) {
    cached = null;
    res = await doCall(await getToken({ force: true }));
  }
  return res;
}

// ---- convenience wrappers --------------------------------------------------

// Set an existing Jubilujah account's password. Returns { ok: true } on success.
export async function setPassword(email, newPassword, idempotencyKey) {
  const res = await callAdmin('/api/auth/admin/set-password', { email, newPassword }, { idempotencyKey });
  if (res.ok) return res.json();
  throw new Error(`set-password failed: ${res.status} ${await res.text().catch(() => '')}`);
}

// Create a Jubilujah account. 201 = created, 409 = already exists — both are
// non-errors for cross-platform sync (use setPassword to change an existing pw).
// `user`: { email, password, firstName?, lastName?, displayName?, role?,
//           emailVerified?, dateOfBirth?, sourcePlatform? }
export async function provisionUser(user, idempotencyKey) {
  const res = await callAdmin('/api/auth/admin/provision-user', user, { idempotencyKey });
  if (res.status === 201 || res.status === 409) {
    return { status: res.status, ...(await res.json().catch(() => ({}))) };
  }
  throw new Error(`provision-user failed: ${res.status} ${await res.text().catch(() => '')}`);
}

export { getToken, callAdmin };
