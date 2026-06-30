// Verifies the dual-carrier auth model on the CSRF-guarded change-password route:
//   - Web carrier  (session COOKIE): CSRF double-submit is ENFORCED.
//   - Mobile carrier (Bearer HEADER, no cookie): CSRF is SKIPPED (no ambient authority).
//   - Negative:    a Bearer presented ALONGSIDE a cookie must NOT bypass CSRF.
//
// Non-destructive: every change attempt sends a deliberately-wrong current_password,
// so the handler always rejects (401) or reports no-password (409) — it never
// actually changes a password. The assertions only care WHICH gate answered.
//
// Bootstraps a real jv_session via the SSO flow (web :3000 + api :4000 + mock-oidc :4010).
//   node api/scripts/change-password-carrier-smoke.mjs
const WEB = process.env.WEB_BASE || 'http://localhost:3000';
const API = process.env.API_BASE || 'http://localhost:4000';
const OIDC = process.env.OIDC_BASE || 'http://localhost:4010';

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

// ---- Bootstrap: drive SSO to obtain a real jv_session (+ jv_csrf) cookie -----
const login = await fetch(`${WEB}/api/auth/login?returnTo=/`, { redirect: 'manual', headers: { cookie: cookieHeader() } });
setCookies(login);
const au = new URL(login.headers.get('location'));
const form = new URLSearchParams({
  account: 'gabriel',
  redirect_uri: au.searchParams.get('redirect_uri'),
  state: au.searchParams.get('state'),
  code_challenge: au.searchParams.get('code_challenge'),
  scope: au.searchParams.get('scope') || '',
});
const authz = await fetch(`${OIDC}/authorize`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
const cb = await fetch(authz.headers.get('location'), { redirect: 'manual', headers: { cookie: cookieHeader() } });
setCookies(cb);
const sessionToken = jar.get('jv_session');
const csrf = jar.get('jv_csrf');
log(!!sessionToken && !!csrf, 'bootstrap: obtained jv_session + jv_csrf via SSO');

const isCsrf403 = (status, body) => status === 403 && /csrf/i.test(body?.error || body?.message || '');
const reachedHandler = (status) => status === 401 || status === 409;   // wrong-pw / no-password: got past auth + CSRF
const changeBody = JSON.stringify({ current_password: `wrong-${sessionToken.slice(0, 8)}`, new_password: 'NewPlaceholderPw!99' });
const post = (headers) => fetch(`${API}/api/auth/change-password`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: changeBody })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

// A) Web carrier, MISSING CSRF header -> CSRF enforced (403).
const a = await post({ cookie: cookieHeader() });
log(isCsrf403(a.status, a.body), `web carrier w/o CSRF header -> 403 CSRF (got ${a.status})`);

// B) Web carrier, CORRECT CSRF header -> passes CSRF gate, reaches handler.
const b = await post({ cookie: cookieHeader(), 'x-csrf-token': csrf });
log(reachedHandler(b.status), `web carrier w/ CSRF header -> reaches handler (got ${b.status})`);

// C) Mobile carrier: Bearer header, NO cookie -> CSRF skipped, reaches handler.
const c = await post({ authorization: `Bearer ${sessionToken}` });
log(reachedHandler(c.status), `mobile carrier (Bearer, no cookie) -> CSRF skipped, reaches handler (got ${c.status})`);

// D) NEGATIVE: Bearer ALONGSIDE a cookie, missing CSRF -> must STILL be 403.
//    Proves the exemption requires the ABSENCE of a cookie (no dummy-Bearer bypass).
const d = await post({ cookie: cookieHeader(), authorization: `Bearer ${sessionToken}` });
log(isCsrf403(d.status, d.body), `Bearer + cookie w/o CSRF header -> still 403 CSRF (got ${d.status})`);

console.log('\nchange-password dual-carrier');
console.log('='.repeat(48));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
