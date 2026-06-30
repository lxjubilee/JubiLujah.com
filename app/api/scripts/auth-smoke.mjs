// End-to-end SSO + authenticated-mutation check. Drives the full OIDC
// Authorization Code + PKCE flow through the web origin (same-origin proxy),
// then performs an authenticated, CSRF-protected rating write.
//
//   node api/scripts/auth-smoke.mjs            (web :3000 + api :4000 + mock-oidc :4010 running)
import { v5 as uuidv5 } from 'uuid';

const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const OIDC = process.env.OIDC_BASE || 'http://localhost:4010';
const NS = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';

const jar = new Map();
function setCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

let pass = 0, fail = 0;
const log = (ok, name) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); ok ? pass++ : fail++; };

// 1) Begin login at the web origin (proxied to API) — capture state/verifier cookies + IdP URL.
const login = await fetch(`${WEB}/api/auth/login?returnTo=/`, { redirect: 'manual', headers: { cookie: cookieHeader() } });
setCookies(login);
const authorizeUrl = login.headers.get('location');
log(login.status === 302 && !!authorizeUrl && authorizeUrl.includes('/authorize'), 'login redirects to IdP /authorize');

// 2) Authenticate at the mock IdP as Gabriel (admin).
const au = new URL(authorizeUrl);
const form = new URLSearchParams({
  account: 'gabriel',
  redirect_uri: au.searchParams.get('redirect_uri'),
  state: au.searchParams.get('state'),
  code_challenge: au.searchParams.get('code_challenge'),
  scope: au.searchParams.get('scope') || '',
});
const authz = await fetch(`${OIDC}/authorize`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
const cbUrl = authz.headers.get('location');
log(authz.status === 302 && !!cbUrl && cbUrl.includes('/api/auth/callback'), 'IdP issues code -> callback URL');

// 3) Hit the callback (same-origin via web proxy) with our cookie jar -> sets session.
const cb = await fetch(cbUrl, { redirect: 'manual', headers: { cookie: cookieHeader() } });
setCookies(cb);
log(cb.status === 302 && jar.has('jv_session'), 'callback establishes jv_session cookie');

// 4) /me reflects the authenticated admin.
const me = await fetch(`${WEB}/api/auth/me`, { headers: { cookie: cookieHeader() } }).then((r) => r.json());
log(me.authenticated === true && me.roles?.includes('admin'), `/me authenticated as admin (${me.user?.displayName})`);

// 5) Authenticated, CSRF-protected rating write succeeds.
const albumId = uuidv5('album:AMIM1001EN', NS);
const csrf = jar.get('jv_csrf');
const put = await fetch(`${WEB}/api/ratings/album/${albumId}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, cookie: cookieHeader() },
  body: JSON.stringify({ stars: 5, note: 'auth-smoke' }),
});
const putBody = await put.json().catch(() => ({}));
log(put.status === 200 && putBody.mine?.stars === 5, 'authenticated rating PUT succeeds (CSRF ok)');

// 6) Admin-only route now reachable.
const users = await fetch(`${WEB}/api/admin/users`, { headers: { cookie: cookieHeader() } });
log(users.status === 200, 'admin route reachable as admin');

console.log('\nSSO end-to-end');
console.log('='.repeat(48));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
