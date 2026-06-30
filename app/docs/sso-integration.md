# SSO Integration — JubileeInspire

Jubilujah delegates authentication to **JubileeInspire** via **OAuth 2.0 / OpenID Connect
(Authorization Code flow with PKCE)**. Jubilujah never stores passwords or handles MFA — the
JubileeInspire account *is* the Jubilujah account.

## Flow

```
1. User clicks "Continue to JubileeInspire" → GET /api/auth/login?returnTo=/...
2. API generates state + PKCE (verifier/challenge), stores them in short-lived HttpOnly cookies,
   and 302-redirects to the IdP's /authorize endpoint.
3. User authenticates at JubileeInspire (may include MFA / Turnstile).
4. IdP redirects back to /api/auth/callback?code=...&state=...
5. API verifies state, exchanges the code (+ PKCE verifier) for tokens at /token,
   and verifies the ID token signature + iss/aud against the IdP JWKS.
6. API upserts identity.users (key = OIDC `sub`), syncs roles from the `roles` claim into
   identity.user_roles, and creates a server-side session (opaque token; SHA-256 hash stored).
7. API sets an HttpOnly, SameSite=Lax session cookie and redirects to the web app.
```

Same-origin in dev: the Next app proxies `/api/*` to the API, so the whole round trip stays on
`localhost:3000` and the session/CSRF cookies "just work."

## Shared user management

- The OIDC `sub` claim is the **stable cross-platform identity** (`identity.users.external_subject`,
  `UNIQUE`). A user who exists on jubileeinspire.com logs in to jubilujah.com with no new account.
- On **every login**, roles from the IdP token are synchronized to `identity.user_roles` (grants and
  revocations are written to `identity.audit_log`). Admin role edits in the Jubilujah console write
  to the same shared store, so privileges stay in sync across both platforms.
- A brand-new user registering through the shared IdP appears in `identity.users` on first login and is
  therefore visible from both sites.

## Roles → permissions (RBAC)

| Role | Capability |
|---|---|
| `viewer` | Read-only browse |
| `content_editor` | **Minimum** for editorial: rate, comment, nominate, CRUD metadata |
| `radio_producer` | + programs, playlists, station assignments |
| `production_manager` | + advance pipeline stages |
| `admin` | + manage users/roles, select award winners, trigger publishes |

Enforced on the **backend** (`requireRole`, server-side session lookup) and reflected on the
**frontend** (`useAuth().hasRole`, route guards). The frontend checks are convenience only — every
mutation is authorized server-side.

## Dev provider (`mock-oidc`)

`mock-oidc/` is a ~200-line Express app implementing discovery, JWKS, `/authorize` (a dev account
chooser), `/token` (with PKCE verification and RS256-signed ID tokens carrying a `roles` claim), and
`/userinfo`. Its seed accounts mirror `identity.users` so the "same credentials on both platforms"
story is demonstrable locally. **It is not for production.**

## Cutover to the real JubileeInspire IdP

No code changes — only environment values:

```env
OIDC_ISSUER=https://api.JubileeInspire.com         # real issuer (must serve /.well-known/openid-configuration)
OIDC_CLIENT_ID=<registered client id>
OIDC_CLIENT_SECRET=<registered client secret>
OIDC_REDIRECT_URI=https://jubilujah.com/api/auth/callback
OIDC_SCOPES=openid profile email roles
```

Requirements on the JubileeInspire side:
1. Register Jubilujah as a confidential client with the redirect URI above.
2. Include a `roles` claim (array of the role strings above) in the ID token (or expose it at
   `/userinfo` — the client reads roles from the verified ID token claims).
3. Serve a standard OIDC discovery document and JWKS.

For a shared session across `jubilujah.com` and `jubileeinspire.com`, set `COOKIE_DOMAIN` to the
shared parent domain (e.g. `.jubilee.example`) and `secureCookies` (production `NODE_ENV`).

## ⚠️ GO-LIVE BLOCKER — JubileeInspire must implement the OIDC login endpoints

The Jubilujah side is already SSO-ready: the OIDC client is discovery-driven and config-only
(`src/auth/oidc.js`), so cutover is just the `OIDC_*` env values above — **no code change**.

The blocker is on **JubileeInspire**. As verified against `https://api.jubileeinspire.com`
(last checked 2026-06-18), JI today exposes ONLY the server-to-server APIs:

| Endpoint | Method | Status today | Needed for |
|---|---|---|---|
| `/api/auth/service/token` | POST | ✅ 200 | password sync (already live) |
| `/api/auth/admin/set-password` | POST | ✅ (works) | password sync (already live) |
| `/api/auth/login` (→ `/authorize`) | GET | ❌ **404** | **SSO login** |
| `/.well-known/openid-configuration` | GET | ❌ **404** | **SSO discovery** |
| `/token`, `/userinfo`, JWKS | — | ❌ **404** | **SSO token exchange + ID-token verify** |

**Before SSO can go live, JubileeInspire MUST implement the OpenID Connect provider endpoints:**

1. **`/api/auth/login` → authorization endpoint** — the user-facing login/consent page that the
   Jubilujah API redirects to (`GET /api/auth/login` on our side builds the authorize URL and 302s
   the browser there). This is the endpoint specifically called out as the go-live requirement.
2. **OIDC discovery document** at `/.well-known/openid-configuration` + a **JWKS** endpoint.
3. **Token endpoint** (`/token`) supporting Authorization Code + PKCE (S256).
4. **`/userinfo`** and a **`roles`** claim (array) in the ID token.
5. **Register Jubilujah as a confidential client** with redirect URI
   `https://jubilujah.com/api/auth/callback` (and the localhost dev URI for testing).

Until these exist, the "Continue to JubileeInspire" button (and the `/signin` SSO link) will fail at
the discovery step. The password-sync integration (`services/jiSync.js`) is unaffected — it uses the
service-token API, which is already live.
