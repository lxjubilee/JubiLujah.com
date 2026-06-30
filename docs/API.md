# Jubilujah API Reference

The Jubilujah API is an Express.js service (`jubilujah-api`) that backs the Next.js
web app. It exposes the music catalog, social features (ratings, comments, awards),
the production pipeline, radio programming, personal playlists, account/auth flows,
and server-to-server admin endpoints.

- **Source:** [app/api/src/](../app/api/src/) — entry point [src/index.js](../app/api/src/index.js)
- **Default port:** `4000` (dev) / `4030` (prod PM2 process)
- **Base path:** all application routes are under `/api`; health is at `/health`
- **Content type:** JSON (`application/json`), request bodies capped at `256kb`
- **OpenAPI spec:** `GET /api/openapi.json` ([src/openapi.json](../app/api/src/openapi.json))

> The repo also contains placeholder/legacy servers ([server.js](../server.js)
> "Coming Soon" stub and [api/server.js](../api/server.js) minimal stub on
> port 4000). These are **not** the production API and are documented at the end for
> completeness.

---

## Authentication & sessions

Auth is purely an **`Authorization: Bearer <token>`** — no cookies. The token format is
**identical to JubileeInspire's** ([src/auth/token.js](../app/api/src/auth/token.js)):
`base64url(JSON) + "." + base64url(HMAC-SHA256)` — a 2-part hand-rolled token (not a standard
JWT), signed with the shared `JWT_SECRET`. Claims: `{ userId, email, displayName, role, roles,
type, exp (ms), iat (ms), jti }`. Resolved by
[src/middleware/session.js](../app/api/src/middleware/session.js): verification checks the
signature + `exp` + `type`, then loads the user from the DB (enforcing `is_active`, like JI's
auth middleware), giving `req.auth = { user, roles }`; an absent/invalid token yields `null`.

**Login modes** (env `AUTH_LOGIN_MODE`, see [src/config.js](../app/api/src/config.js)):
- `local` (default/dev) — credentials verified against the local DB.
- `ji` (prod) — `/api/auth/signin` delegates to JubileeInspire's `POST /api/auth/login`;
  JI is the credential authority, Jubilujah upserts the user and mints its own JWT. If JI
  rejects a user who signed up locally (not yet provisioned into JI), the API verifies the
  password locally, provisions the account into JI (`admin.provision`), then signs in.

### Tokens
- **Access token** — JI-format signed token, TTL 1h (`ACCESS_TOKEN_TTL_MS`). Verified per
  request against the DB (`is_active` enforced), so deactivation/role changes take effect next
  request.
- **Refresh token** — JI-format signed token, **DB-backed + revocable**; TTL 30d
  (`REFRESH_TOKEN_TTL_MS`), or 1y with "keep me signed in" (`rememberMe`). Expiry slid forward on
  use at `/api/auth/refresh`. Logout / password change revoke refresh tokens so no new access
  token can be minted.

### CSRF
None. Auth carries no ambient cookie, so a cross-site page cannot ride a session — there is
no `jv_csrf`/`jv_session` cookie and no double-submit check. Keep the web app XSS-clean,
since a Bearer token in `localStorage` is readable by any script on the page.

### RBAC roles
Ordered weakest → strongest ([src/config.js](../app/api/src/config.js#L137)):
`viewer` < `content_editor` < `radio_producer` < `production_manager` < `admin`.

### Rate limits
| Scope | Limit |
|---|---|
| `/api/auth/*` | 50 requests / 15 min |
| Write routes (non-GET/HEAD) | 120 / 60 sec |
| Service routes (`/api/auth/service`, `/api/auth/admin`) | `ADMIN_SERVICE_RATE_MAX` (default 600) / 15 min, keyed per client |

### Common error shape
Errors are returned by [src/middleware/error.js](../app/api/src/middleware/error.js) as JSON,
e.g. `{ "error": "message" }`, with appropriate HTTP status codes (400, 401, 403,
404, 409, 422, 429, 503).

---

## Health & meta

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | — | DB + service health. `{ status: "healthy"\|"degraded", db: boolean, service: "jubilujah-api" }` (503 when DB down). |
| GET | `/api/openapi.json` | — | OpenAPI 3.1 spec. |

---

## Auth — `/api/auth`
File: [src/routes/auth.js](../app/api/src/routes/auth.js)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/login` | — | Begin OIDC SSO login (Authorization Code + PKCE). Query `?returnTo=/path`. Redirects to IdP. |
| GET | `/api/auth/callback` | — | OIDC redirect target; exchanges code for tokens, sets session cookie, redirects to web app. |
| POST | `/api/auth/logout` | — | Revoke current session. Body `{ refreshToken? }` → `{ ok: true }`. Clears session cookie. |
| POST | `/api/auth/logout-all` | ✅ | Revoke **all** sessions for the user → `{ ok: true }`. |
| POST | `/api/auth/refresh` | — | Redeem refresh token. Body `{ refreshToken }` → `{ tokens: { accessToken, refreshToken, expiresAt } }`. |
| POST | `/api/auth/signup` | — | Signup step 1. Body `{ name, email, password }` (password 8–200) → `{ success, requiresVerification, verificationGuid, email }`. |
| POST | `/api/auth/verify-signup` | — | Signup step 2 (verify OTP). Body `{ verificationGuid, verificationCode, rememberMe? }` (code 6 digits) → `{ user, tokens }`. |
| POST | `/api/auth/send-signup-verification` | — | Resend signup OTP (60s cooldown, max 2). Body `{ verificationGuid }` → `{ success, resendsRemaining }`. |
| POST | `/api/auth/signin` | — | Email/password sign-in (+ Turnstile + optional 2FA). Body `{ email, password, cfTurnstileToken?, verificationGuid?, verificationCode?, rememberMe? }` → `{ user, tokens }` **or** `{ requires2FA, verificationGuid }`. Delegates to JI when `AUTH_LOGIN_MODE=ji`. |
| POST | `/api/auth/verify-login` | — | Verify login OTP (2FA step 2). Body `{ email, verificationGuid, verificationCode, rememberMe? }` → `{ user, tokens }`. |
| POST | `/api/auth/send-login-verification` | — | Resend login OTP (60s cooldown; 2 resends → 1h lockout). Body `{ email, verificationGuid }` → `{ success, resendsRemaining }`. |
| POST | `/api/auth/forgot-password` | — | Email a reset link. Body `{ email }` → `{ ok, message }` (same response whether or not the email exists). |
| POST | `/api/auth/reset-password` | — | Redeem reset token. Body `{ token, password }` → `{ ok, jiSync }`. Revokes all sessions; syncs to JI best-effort. |
| POST | `/api/auth/change-password` | ✅ | Body `{ current_password, new_password, refreshToken? }` → `{ ok, jiSync }`. Revokes other sessions. |
| DELETE | `/api/auth/account` | ✅ | Hard-delete own account (irreversible) → `{ ok: true }`. |
| GET | `/api/auth/me` | — | `{ authenticated: boolean, user?, roles? }`. |

---

## Service tokens — `/api/auth/service`
File: [src/routes/serviceToken.js](../app/api/src/routes/serviceToken.js) · client-credentials JWT auth (separate `SERVICE_JWT_SECRET`, distinct from user JWTs).

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/service/token` | client id + secret | OAuth2 client-credentials. Body `{ grant_type?: "client_credentials", client_id, client_secret, scope? }` → `{ access_token, token_type: "Bearer", expires_in, scope }`; `401 { error: "invalid_client" }` on failure. Returns 503 when `SERVICE_JWT_SECRET` is unset. |

Issued token is a short-lived HS256 JWT (TTL `SERVICE_TOKEN_TTL_SEC`, default 600s).

---

## Admin (server-to-server) — `/api/auth/admin`
File: [src/routes/service.js](../app/api/src/routes/service.js) · **Auth:** JWT Bearer from the service token endpoint, scoped. Optional IP allow-list.

| Method | Path | Scope | Description |
|---|---|---|---|
| POST | `/api/auth/admin/set-password` | `admin.set_password` | Set an existing account's password on behalf of a partner. Body `{ email, newPassword }`, optional header `Idempotency-Key` → `{ ok: true }`. `422` policy violation, `404` no account, `409` SSO-only. |
| POST | `/api/auth/admin/provision-user` | `admin.provision` | Create-only cross-platform user provisioning. Body `{ email, password, firstName?, lastName?, displayName?, role?, emailVerified?, dateOfBirth?, sourcePlatform? }`, optional header `Idempotency-Key` → `201 { user, ... }`; `409` if exists. Age gate: ≥ 13. |

---

## Catalog (public) — `/api`
File: [src/routes/catalog.js](../app/api/src/routes/catalog.js) · No auth, manifest-backed reads.

| Method | Path | Description |
|---|---|---|
| GET | `/api/categories` | List catalog categories with counts. |
| GET | `/api/artists` | List artists. Optional `?category=`. |
| GET | `/api/artists/{slug}` | Artist + associated albums, or `404`. |
| GET | `/api/albums/{code}` | Album by catalog code (tracks + CDN URLs), or `404`. |
| GET | `/api/album` | Legacy alias: album by `?code=` or `?path=`. |
| GET | `/api/status-counts` | Pipeline ready/studio rollup. `?scope=all\|ready\|studio`. |
| GET | `/api/cdn-probe` | HEAD-check a CDN audio URL (10-min cache). `?url=` → `{ url, ok, status, contentType, contentLength }`. |

---

## Ratings — `/api/ratings`
File: [src/routes/ratings.js](../app/api/src/routes/ratings.js) · `{type}` ∈ `song|album|artist|playlist|program`, `{id}` is a UUID.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/ratings/{type}/{id}` | — | Aggregate + distribution (includes `mine` if authed). `{ rateable_type, rateable_id, count, average, distribution: {1..5}, mine? }`. |
| PUT | `/api/ratings/{type}/{id}` | ✅ content_editor | Upsert caller's rating. Body `{ stars: 1–5, note? }` → aggregate. |
| DELETE | `/api/ratings/{type}/{id}` | ✅ content_editor | Delete caller's rating → aggregate. |

---

## Comments — `/api/comments`
File: [src/routes/comments.js](../app/api/src/routes/comments.js) · One-level threading, soft-delete, edit tracking.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/comments/{type}/{id}` | — | List active comments, oldest-first. Items: `{ id, author_user_id, author_name, body, parent_id?, lyric_line?, mentions, created_at, edited }`. |
| POST | `/api/comments/{type}/{id}` | ✅ content_editor | Add comment/reply. Body `{ body: 1–8000, parent_id?, lyric_line?: int>0, mentions?: uuid[] }` → `201`. |
| PATCH | `/api/comments/{commentId}` | ✅ content_editor | Edit own comment. Body `{ body: 1–8000 }`; `403` if not author, `404` if missing. |
| DELETE | `/api/comments/{commentId}` | ✅ content_editor | Soft-delete own comment → `{ id, deleted: true }`; `403`/`404`. |

---

## Awards & nominations — `/api/awards`
File: [src/routes/awards.js](../app/api/src/routes/awards.js)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/awards/categories` | — | List award categories. Optional `?active=true`. |
| GET | `/api/awards/periods/{year}` | — | Award windows for a year. Items include `opens_at, closes_at, status`. |
| POST | `/api/awards/nominations` | ✅ content_editor | Submit a nomination. Body `{ period_id, rateable_type: song\|album, rateable_id, reason }` (reason ≥ 250 chars after trim) → `201`; `409` duplicate, `422` reason too short. |
| GET | `/api/awards/nominations` | — | List nominations. Filters `?period=&category=&type=song\|album&id=`. |

---

## Production pipeline — `/api/pipeline`
File: [src/routes/pipeline.js](../app/api/src/routes/pipeline.js) · Stages: concept → lyrics_drafting → lyrics_approved → song_generation → qa_review → engineering → sunil_approval → final_approval → published → distributed.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/pipeline` | ✅ content_editor | List items + stage counts. Optional `?stage=`. `{ items, counts }`. |
| POST | `/api/pipeline/{type}/{id}/transition` | ✅ production_manager | Advance stage. `{type}` ∈ `song|album`. Body `{ to_stage, note? }` → `{ rateable_type, rateable_id, from_stage, to_stage }`. |
| GET | `/api/pipeline/{type}/{id}/history` | ✅ content_editor | Transition history: `[{ from_stage, to_stage, note, occurred_at, actor }]`. |

---

## Radio — `/api/stations`, `/api/programs`, `/api/playlists`
File: [src/routes/radio.js](../app/api/src/routes/radio.js)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/stations` | — | List stations: `{ id, call_sign, display_name, description, frequency, genre_anchors, is_active }`. |
| GET | `/api/programs` | — | List programs: `{ id, name, description, station_id, call_sign, schedule_cron, duration_min, is_active }`. |
| GET | `/api/playlists` | — | List radio playlists with item counts. |
| GET | `/api/playlists/{id}` | — | Playlist + ordered items, or `404`. |
| POST | `/api/playlists` | ✅ radio_producer | Create. Body `{ name, description?, program_id? }` → `201`. |
| PATCH | `/api/playlists/{id}/items` | ✅ radio_producer | Replace ordered items (max 500). Body `{ items: [{ song_id, transition?: crossfade\|hard_cut\|sweeper }] }` → `{ playlist_id, item_count }`. |

---

## Personal playlists — `/api/me/playlists`
File: [src/routes/me.js](../app/api/src/routes/me.js) · All endpoints require auth; the caller must own the playlist.

| Method | Path | Description |
|---|---|---|
| GET | `/api/me/playlists` | List caller's playlists with item counts. |
| POST | `/api/me/playlists` | Create. Body `{ name, description?, is_public? }` → `201`. |
| GET | `/api/me/playlists/{id}` | Playlist + items; `403`/`404`. |
| PATCH | `/api/me/playlists/{id}` | Edit. Body `{ name?, description?, is_public? }`. |
| DELETE | `/api/me/playlists/{id}` | Delete → `204`. |
| POST | `/api/me/playlists/{id}/items` | Add song. Body `{ song_id }` → `201`, or `{ duplicate: true }` (200), `404` if song missing. |
| DELETE | `/api/me/playlists/{id}/items/{itemId}` | Remove item → `204`. |
| PATCH | `/api/me/playlists/{id}/items` | Replace ordered items (max 1000). Body `{ items: [{ song_id }] }` → `{ playlist_id, item_count }`. |

---

## Admin — `/api/admin`
File: [src/routes/admin.js](../app/api/src/routes/admin.js) · **All endpoints require the `admin` role.**

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users` | List users with roles + metadata: `{ id, email, display_name, is_active, last_login_at, created_at, roles }`. |
| PATCH | `/api/admin/users/{id}/roles` | Set roles (upsert). Body `{ roles: [...] }` (`viewer`, `content_editor`, `radio_producer`, `production_manager`, `admin`) → `{ user_id, roles }`. |
| GET | `/api/admin/audit` | Audit log (limit 500, DESC). Optional `?since=ISO_DATE`. Items: `{ id, action, target_type, target_id, payload, created_at, actor }`. |
| POST | `/api/admin/publish/{type}/{id}` | Publish manifest version + advance pipeline. `{type}` ∈ `song\|album\|playlist\|program` → `{ rateable_type, rateable_id, published: true, version, cdn_path, content_hash, cdn_base }`. |

---

## Web app routes (Next.js — `app/web`)

The real front end is the Next.js app in [../web/](../app/web/). It exposes one server route:

| Method | Path | File | Description |
|---|---|---|---|
| GET | `/cover/{code}` (or `/cover/{code}.png`) | [../web/app/cover/[code]/route.ts](../app/web/app/cover/%5Bcode%5D/route.ts) | Album cover resolver. Tries CDN (`cdn.jubileeverse.com/.../artwork/{code}.png`) first, then local fallback. Serves PNG with 1-day cache; `404` if not found. |

---

## Legacy / placeholder servers (not production)

- [../../server.js](../server.js) — "Coming Soon" placeholder with JSON-file stubs of
  ratings/comments/nominations. Superseded by `app/web` + `app/api`.
- [../../api/server.js](../api/server.js) — minimal stub on port 4000:
  `GET /health` → `{ status: "healthy", service: "api" }`, `GET /api/v1/status` →
  `{ service, version, timestamp }`.
