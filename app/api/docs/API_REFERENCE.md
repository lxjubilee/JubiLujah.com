# JubileePraise API — Complete Technical Reference

> Generated 2026-07-20 by reading the source at `W:\JubileePraise.com\app\api\src` end to end.
> Every claim below is drawn from the code, not from prior documentation. Where the existing
> docs in `app/api/docs/` disagree with the code, the code wins and the drift is called out.

---

## Contents

| § | Section |
|---|---|
| 1 | [What this service is](#1-what-this-service-is) |
| 2 | [Directory structure](#2-directory-structure) |
| 3 | [Request pipeline](#3-request-pipeline) |
| 4 | [Complete endpoint index](#4-complete-endpoint-index) — all ~150 routes |
| 5 | [Auth & Identity](#5-auth--identity) — tokens, SSO mesh, RBAC, service clients |
| 6 | [Catalog, Content & Editorial Pipeline](#6-catalog-content--editorial-pipeline) — manifest, R2, covers, pipeline, awards, radio |
| 7 | [Social & Engagement](#7-social--engagement) — reviews, ratings, comments, playlists, likes |
| 8 | [Analytics & Telemetry](#8-analytics--telemetry) — play events, presence, dashboards, export |
| 9 | [Subscriptions, Billing & Quota](#9-subscriptions-billing--quota) — Stripe, webhook, free-tier cap |
| 10 | [Admin, Manage Music & Mobile CMS](#10-admin-manage-music--mobile-cms) |
| 11 | [Data Layer, Runtime & Ops](#11-data-layer-runtime--ops) — 28 migrations, schema, env vars, deploy |
| 12 | [Appendix — Cross-cutting findings](#12-appendix--cross-cutting-findings) — the punch list |

---

## 1. What this service is

A single Express 4 application (ESM, Node 20+) that backs three consumers:

| Consumer | Location | Talks to |
|---|---|---|
| **Web app** | `app/web` — Next.js, App Router | The API over `NEXT_PUBLIC_API_BASE` |
| **Mobile app** | external | `/api/mobile/config`, `/api/app-version/check`, plus the normal auth/catalog/analytics routes |
| **Partner platforms** | JubileeInspire, TorahSings | `/api/auth/service/token` → `/api/auth/admin/*` (server-to-server) |

It serves a **worship-music catalog** (artists → albums → songs), a **radio** layer (stations, programs, editorial playlists), a **user engagement** layer (ratings, reviews, comments, likes, personal playlists), a **subscription/billing** system with a free-tier listening quota, a **playback analytics** warehouse, an **editorial production pipeline**, and a **mobile CMS** that drives the phone app's home screen.

Audio and artwork are **not** served by this API — they live on Cloudflare R2 behind `cdn.jubileeverse.com`. The API writes to that bucket (cover/track uploads) and reads a generated `catalog-manifest.json`, but playback traffic never touches Node.

### The two-source-of-truth model

This is the single most important structural fact about the service, and it explains most of the surprising behavior documented later:

```
catalog-manifest.json  ──►  artists / albums / songs / track listings / cover paths
   (file, on disk)            "what music exists"

PostgreSQL             ──►  users / roles / reviews / analytics / subscriptions / CMS
   (identity, catalog,        "what humans did"
    production, radio)
```

The manifest is authoritative for **catalog identity**; the database is authoritative for **everything else**. They are bridged by *deterministic UUIDv5* — `albumUuid(code)`, `artistUuid(slug)`, song ids — computed from a fixed namespace (`ids.js`), so both sides derive the same UUID for the same entity without a foreign key. That is why `playback_events.album_id` has **no FK constraint**, and why some lookups (e.g. `artistNameById`) must brute-force the hash to invert it.

---

## 2. Directory structure

```
W:\JubileePraise.com\
├── server.js               ⚠ LEGACY — standalone http "Coming Soon" server, port 3119.
│                             Hand-rolled routing, superseded by app/api. Not part of this doc.
├── api/server.js           ⚠ 2-line stub (/health, /api/v1/status). Not the real API.
├── deploy/                 Deployment scripts
├── PUBLISH.md              Deployment runbook
└── app/                    ◄── THE APPLICATION
    ├── .env / .env.example Monorepo-root env, loaded by api/src/config.js
    ├── docker-compose.yml  Local Postgres (+ services)
    ├── api/
    │   ├── docs/           AUTH_API.md, ANALYTICS_API.md, REVIEWS_API.md, SUBSCRIPTION_API.md
    │   ├── scripts/        smoke tests, service-secret gen, stripe setup
    │   └── src/
    │       ├── index.js        ◄── composition root: mounts, middleware order, limiters
    │       ├── config.js       every env var → one frozen config object + ROLE_ORDER
    │       ├── db.js           pg Pool, withTransaction, healthCheck
    │       ├── ids.js          deterministic UUIDv5 derivation
    │       ├── manifest.js     catalog-manifest.json loader + cache + lookups
    │       ├── logger.js       pino
    │       ├── openapi.json    served at /api/openapi.json (verify freshness — see §Gaps)
    │       ├── auth/           password, token (JI-format), session, serviceToken (real JWT)
    │       ├── middleware/     session, serviceAuth, rbac, validate, error
    │       ├── routes/         25 routers — the endpoint surface
    │       ├── services/       jiSync, jiLogin, email, notifications, subscriptions,
    │       │                   payments/{index,stripe,mock}, musicSync, musicScheduler,
    │       │                   musicVisibility, heroRotation, sectionOrder
    │       └── util/           r2, albumCovers, coverVersions, geo, ua, sanitize, async
    ├── db/
    │   ├── migrations/     0001 … 0028 (forward-only, ledger in public._migrations)
    │   ├── seed/           award periods, stations, demo editorial
    │   ├── run-migrations.js
    │   └── import-catalog.js
    ├── web/                Next.js frontend
    └── mock-oidc/          Local OIDC stub
```

---

## 3. Request pipeline

Middleware order in `src/index.js` is deliberate and load-bearing. Reading top to bottom:

| # | Middleware | Notes |
|---|---|---|
| 0 | `app.set('trust proxy', 1)` | `req.ip` = first `X-Forwarded-For` hop |
| 1 | `pino-http` | Request id from `x-request-id` or `crypto.randomUUID()`; 5xx→error, 4xx→warn |
| 2 | `helmet()` | Default security headers |
| 3 | `cors()` | Allow-list `CORS_ORIGIN`; **no-Origin requests always allowed** (curl, server-to-server) |
| 4 | **`express.raw` on the 2 webhook paths** | Mounted *before* JSON so Stripe's signature can be verified against exact bytes |
| 5 | `express.json({ limit: '256kb' })` | Content-type-gated — image/audio raw uploads fall through untouched |
| 6 | `attachSession` | Resolves `req.auth` from `Authorization: Bearer`. **Never throws** — anonymous requests continue with `req.auth = null` |
| 7 | Per-mount rate limiters | See below |
| 8 | Routers | |
| 9 | `notFound` → `errorHandler` | |

### Rate limiters

| Limiter | Window / max | Keyed by | Applied to |
|---|---|---|---|
| `authLimiter` | 50 / 15 min | IP | `/api/auth/*` (incl. `GET /me`) |
| `writeLimiter` | 120 / 60 s, **skips GET+HEAD** | IP | most mounts |
| `serviceLimiter` | `ADMIN_SERVICE_RATE_MAX` (default 600) / 15 min | service token `sub` | `/api/auth/service`, `/api/auth/admin` |

The webhook is above every limiter — a gateway retry storm is never throttled away.

### Auth model in one paragraph

There is **no cookie and no CSRF middleware**, by design: authentication is a stateless `Authorization: Bearer <token>` header, so a cross-site request carries no ambient credential. Two *different* token schemes coexist:

- **User tokens** — JubileeInspire's hand-rolled format `base64url(JSON).base64url(HMAC-SHA256)`. **Not a standard JWT** (2 parts, not 3; millisecond `exp`/`iat`). Signed with `JWT_SECRET` so the whole SSO family shares one scheme. 1h access / 30d refresh (1y with "keep me signed in"), with DB-backed refresh rows for durable revocation.
- **Service tokens** — a real **HS256 JWT** (`jose`), issued by `/api/auth/service/token` via OAuth2 client-credentials, consumed by `/api/auth/admin/*`. Separate secret (`SERVICE_JWT_SECRET`), separate 10-minute TTL, scope-checked, optional IP allow-list.

### RBAC

`ROLE_ORDER = ['viewer', 'reviewer', 'content_editor', 'executive', 'admin']` (`config.js:189`) — index = privilege level. `requireRole(min)` compares the caller's **maximum** role index against `ROLE_ORDER.indexOf(min)`, so `executive` implicitly satisfies `content_editor`, and `admin` satisfies everything.

> ⚠️ **Trap.** The `identity.user_roles` table still permits `radio_producer` and `production_manager` (migration 0013), and **neither appears in `ROLE_ORDER`**. `roleLevel` returns `-1` for an unknown role, so a user holding *only* one of those fails even `requireRole('viewer')`. Only `requireAuth` is safe for them.

### Error envelope

`HttpError(status, message, extra)` → `{ error: <code>, message, ...extra }` (`middleware/error.js:12-34`):

| Status | `error` code | | Status | `error` code |
|---|---|---|---|---|
| 400 | `error` | | 422 | `unprocessable` |
| 401 | `unauthorized` | | 429 | `error` |
| 403 | `forbidden` | | 500 | `internal` |
| 404 | `not_found` | | 503 | `unavailable` |
| 409 | `conflict` | | **502** | **unmapped → `error`** |

Postgres `23505` → 409, `23514` → 422; anything else → 500. Zod failures → `400 { error:'error', message:'Validation failed', issues:[{path,message}] }`.

Schemas are plain `z.object()` — **not `.strict()`** — so unknown keys are silently stripped rather than rejected, and `validate()` *replaces* `req[source]` with the parsed value.

---

## 4. Complete endpoint index

**~150 endpoints across 25 routers.** Auth column: 🌐 public · 👤 any authenticated user · ✍️ `content_editor`+ · 🎬 `executive`+ · 🔑 `admin` · 🤝 service JWT.

### Health & meta
| | Endpoint | Auth |
|---|---|---|
| GET | `/health` | 🌐 |
| GET | `/api/openapi.json` | 🌐 |

### Auth — `routes/auth.js`
| | Endpoint | Auth |
|---|---|---|
| POST | `/api/auth/signup` | 🌐 |
| POST | `/api/auth/verify-signup` | 🌐 |
| POST | `/api/auth/send-signup-verification` | 🌐 |
| POST | `/api/auth/signin` | 🌐 |
| POST | `/api/auth/verify-login` | 🌐 |
| POST | `/api/auth/send-login-verification` | 🌐 |
| POST | `/api/auth/refresh` | 🌐 (refresh token) |
| POST | `/api/auth/logout` | 🌐 |
| POST | `/api/auth/logout-all` | 👤 |
| POST | `/api/auth/forgot-password` | 🌐 |
| POST | `/api/auth/reset-password` | 🌐 |
| POST | `/api/auth/change-password` | 👤 |
| GET | `/api/auth/me` | 👤 |
| DELETE | `/api/auth/account` | 👤 |

### Server-to-server — `routes/serviceToken.js`, `routes/service.js`
| | Endpoint | Auth |
|---|---|---|
| POST | `/api/auth/service/token` | client_id + client_secret |
| POST | `/api/auth/admin/set-password` | 🤝 scope `admin.set_password` |
| POST | `/api/auth/admin/provision-user` | 🤝 scope `admin.provision` |
| GET | `/api/auth/admin/check-email` | 🤝 scope `admin.provision` *or* `admin.set_password` |

### Catalog — `routes/catalog.js` (mounted at `/api`)
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/categories` | 🌐 |
| GET | `/api/artists` | 🌐 |
| GET | `/api/artists/:slug` | 🌐 |
| GET | `/api/albums/:code` | 🌐 |
| GET | `/api/album` | 🌐 |
| GET | `/api/status-counts` | 🌐 |
| GET | `/api/cdn-probe` | 🌐 |

### Radio — `routes/radio.js` (mounted at `/api`)
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/stations` | 🌐 |
| GET | `/api/programs` | 🌐 |
| GET | `/api/playlists` | 🌐 |
| GET | `/api/playlists/:id` | 🌐 |
| POST | `/api/playlists` | 🎬 |
| PATCH | `/api/playlists/:id/items` | 🎬 |

### Mobile
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/app-version/check` | 🌐 |
| GET | `/api/mobile/config` | 🌐 |

### Ratings & Comments (editorial)
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/ratings/:type/:id` | 🌐 |
| PUT | `/api/ratings/:type/:id` | ✍️ |
| DELETE | `/api/ratings/:type/:id` | ✍️ |
| GET | `/api/comments/:type/:id` | 🌐 |
| POST | `/api/comments/:type/:id` | ✍️ |
| PATCH | `/api/comments/:commentId` | ✍️ |
| DELETE | `/api/comments/:commentId` | ✍️ |

### Reviews (public) — `routes/reviews.js`
| | Endpoint | Auth |
|---|---|---|
| POST | `/api/reviews/summaries` | 🌐 (batch read) |
| POST | `/api/reviews/list` | 🌐 (paged read) |
| GET | `/api/reviews/artist/:slug/summary` | 🌐 |
| GET | `/api/reviews/:type/:id/summary` | 🌐 |
| GET | `/api/reviews/:type/:id` | 🌐 |
| PUT | `/api/reviews/:type/:id` | 👤 |
| DELETE | `/api/reviews/:type/:id` | 👤 |
| GET | `/api/reviews/me/contributions` | 👤 |
| GET | `/api/reviews/me/reviews` | 👤 |
| GET | `/api/reviews/notifications` | 👤 |
| POST | `/api/reviews/notifications/read` | 👤 |
| POST | `/api/reviews/review/:reviewId/helpful` | 👤 |
| POST | `/api/reviews/review/:reviewId/report` | 👤 |

### Me — `routes/me.js`
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/me/playlists` | 👤 |
| POST | `/api/me/playlists` | 👤 |
| GET | `/api/me/playlists/:id` | 👤 |
| PATCH | `/api/me/playlists/:id` | 👤 |
| DELETE | `/api/me/playlists/:id` | 👤 |
| GET | `/api/me/playlist-song-ids` | 👤 |
| POST | `/api/me/playlists/:id/items` | 👤 |
| POST | `/api/me/playlists/:id/items/bulk` | 👤 |
| PATCH | `/api/me/playlists/:id/items` | 👤 |
| DELETE | `/api/me/playlists/:id/items/:itemId` | 👤 |
| GET | `/api/me/likes` | 👤 |
| GET | `/api/me/likes/ids` | 👤 |
| POST | `/api/me/likes` | 👤 |
| DELETE | `/api/me/likes/:type/:id` | 👤 |

### Analytics — `routes/analytics.js`
| | Endpoint | Auth |
|---|---|---|
| POST | `/api/analytics/play` | 👤 |
| POST | `/api/analytics/now-playing` | 👤 |
| POST | `/api/analytics/now-playing/stop` | 👤 |
| GET | `/api/analytics/overview` | 🔑 |
| GET | `/api/analytics/albums` · `/albums/:id` | 🔑 |
| GET | `/api/analytics/songs` · `/songs/:id` | 🔑 |
| GET | `/api/analytics/users` · `/users/:id` | 🔑 |
| GET | `/api/analytics/trends` | 🔑 |
| GET | `/api/analytics/ratings` | 🔑 |
| GET | `/api/analytics/reviews` | 🔑 |
| GET | `/api/analytics/export` | 🔑 |

### Awards & Pipeline
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/awards/categories` | 🌐 |
| GET | `/api/awards/periods/:year` | 🌐 |
| GET | `/api/awards/nominations` | 🌐 |
| POST | `/api/awards/nominations` | ✍️ |
| GET | `/api/pipeline` | ✍️ |
| GET | `/api/pipeline/:type/:id/history` | ✍️ |
| POST | `/api/pipeline/:type/:id/transition` | 🎬 |

### Subscriptions & Listening
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/subscriptions/plans` | 🌐 |
| GET | `/api/subscriptions/me` | 👤 |
| POST | `/api/subscriptions/checkout` | 👤 |
| POST | `/api/subscriptions/confirm` | 👤 |
| POST | `/api/subscriptions/cancel` | 👤 |
| POST | `/api/subscriptions/reactivate` | 👤 |
| POST | `/api/subscriptions/change` | 👤 |
| POST | `/api/subscriptions/portal` | 👤 |
| GET | `/api/subscriptions/billing` | 👤 |
| GET | `/api/subscriptions/notifications` | 👤 |
| POST | `/api/subscriptions/notifications/read` | 👤 |
| POST | `/api/billing/webhook` (alias `/api/subscriptions/webhook`) | Stripe signature |
| POST | `/api/listening/intent` | 👤 |
| GET | `/api/listening/status` | 👤 |

### Admin — `routes/admin.js`
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/admin/users` | 🔑 |
| PATCH | `/api/admin/users/:id` | 🔑 |
| PATCH | `/api/admin/users/:id/roles` | 🔑 |
| DELETE | `/api/admin/users/:id` | 🔑 |
| GET | `/api/admin/subscribers` | 🔑 |
| GET | `/api/admin/active-listeners` | 🔑 |
| GET | `/api/admin/audit` | 🔑 |
| POST | `/api/admin/covers/:code` | 🔑 |
| GET | `/api/admin/covers/pending-sync` | 🔑 |
| POST | `/api/admin/covers/:code/mark-synced` | 🔑 |
| POST | `/api/admin/publish/:type/:id` | 🔑 |

### Admin → Manage Music — `routes/music.js`
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/admin/music/dashboard` | 🔑 |
| POST | `/api/admin/music/sync` | 🔑 |
| GET | `/api/admin/music/sync/runs` · `/sync/runs/:id` | 🔑 |
| GET·PUT | `/api/admin/music/sync/config` | 🔑 |
| GET | `/api/admin/music/albums` · `/albums/:code` | 🔑 |
| PATCH | `/api/admin/music/albums/:code/visibility` | 🔑 |
| PATCH | `/api/admin/music/albums/:code/metadata` | 🔑 |
| POST | `/api/admin/music/albums/:code/refresh` | 🔑 |
| POST | `/api/admin/music/albums/:code/validate` | 🔑 |
| DELETE | `/api/admin/music/albums/:code` | 🔑 |
| GET | `/api/admin/music/songs` · `/songs/:id` | 🔑 |
| PATCH | `/api/admin/music/songs/:id/visibility` | 🔑 |
| GET | `/api/admin/music/missing` · `/probe` · `/activity` · `/export` | 🔑 |
| POST | `/api/admin/music/bulk` | 🔑 |

### Admin → Reviews moderation — `routes/reviewsAdmin.js`
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/admin/reviews` | 🔑 |
| GET | `/api/admin/reviews/reports` | 🔑 |
| GET | `/api/admin/reviews/analytics` | 🔑 |
| GET | `/api/admin/reviews/:id/history` | 🔑 |
| POST | `/api/admin/reviews/:id/moderate` | 🔑 |

### Admin → Mobile CMS — `routes/mobileAdmin.js` (28 routes)
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/admin/mobile/config` | 🔑 |
| POST | `/api/admin/mobile/categories` | 🔑 |
| PATCH·DELETE | `/api/admin/mobile/categories/:key` | 🔑 |
| PATCH | `/api/admin/mobile/categories-order` | 🔑 |
| POST | `/api/admin/mobile/categories/:key/items` | 🔑 |
| PATCH·DELETE | `/api/admin/mobile/items/:id` | 🔑 |
| PATCH | `/api/admin/mobile/categories/:key/items-order` | 🔑 |
| POST | `/api/admin/mobile/categories/:key/sections` | 🔑 |
| PATCH·DELETE | `/api/admin/mobile/sections/:id` | 🔑 |
| POST | `/api/admin/mobile/sections/:id/items` | 🔑 |
| PATCH | `/api/admin/mobile/sections/:id/items-order` | 🔑 |
| PATCH | `/api/admin/mobile/categories/:key/sections-order` | 🔑 |
| POST | `/api/admin/mobile/categories/:key/hero-slides` | 🔑 |
| PATCH·DELETE | `/api/admin/mobile/hero-slides/:id` | 🔑 |
| PATCH | `/api/admin/mobile/categories/:key/hero-order` | 🔑 |
| POST | `/api/admin/mobile/music-types` | 🔑 |
| PATCH·DELETE | `/api/admin/mobile/music-types/:id` | 🔑 |
| PATCH | `/api/admin/mobile/music-types-order` | 🔑 |
| POST | `/api/admin/mobile/music-types/:id/albums` | 🔑 |
| DELETE | `/api/admin/mobile/music-type-albums/:id` | 🔑 |
| PATCH | `/api/admin/mobile/music-types/:id/albums-order` | 🔑 |
| POST | `/api/admin/mobile/music-types/:id/autofill` | 🔑 |
| PATCH | `/api/admin/mobile/settings` | 🔑 |
| GET | `/api/admin/mobile/pick/artists` · `/pick/albums` | 🔑 |

### Admin → Publish & Tracks
| | Endpoint | Auth |
|---|---|---|
| GET | `/api/admin/publish/candidates` | 🔑 |
| POST | `/api/admin/publish` | 🔑 |
| GET | `/api/admin/tracks/:code` | 🔑 |
| POST | `/api/admin/tracks/:code` | 🔑 (raw audio, 80 MB) |
| DELETE | `/api/admin/tracks/:code` | 🔑 |

---

---

## 5. Auth & Identity

Source root: `W:\JubileePraise.com\app\api\src` (bash: `/w/JubileePraise.com/app/api/src`). Express 4.19 (`package.json`), ESM, `zod@3`, `jose@5`, `pg@8`. Postgres schemas: `identity`, `catalog`, `production`, `radio`.

---

### 1. Mounting, ordering, and global middleware

`src/index.js` mount order matters — the two service routers are registered **before** the public auth router, so `/api/auth/service/*` and `/api/auth/admin/*` never hit the public auth rate limiter:

| Line | Mount | Router | Limiter |
|---|---|---|---|
| `index.js:105` | `/api/auth/service` | `routes/serviceToken.js` | `serviceLimiter` |
| `index.js:106` | `/api/auth/admin` | `routes/service.js` | `serviceLimiter` |
| `index.js:112` | `/api/auth` | `routes/auth.js` | `authLimiter` |

- `authLimiter` (`index.js:79`) — 50 req / 15 min, **per IP**, `standardHeaders: true`. Applies to every `/api/auth/*` route including `GET /me`.
- `serviceLimiter` (`index.js:86`) — `config.service.rateLimitMax` (env `ADMIN_SERVICE_RATE_MAX`, default **600**) / 15 min, keyed by `serviceRateKey` (`middleware/serviceAuth.js:75`) — bucket = `svc:<jwt sub>` (decoded **unverified** via `decodeJwt`), falling back to `svc:<sha256(token)[0:16]>`, else `svc-token:<client_id>` from the body, else `req.ip`.
- `app.set('trust proxy', 1)` (`index.js:45`) — `req.ip` is the first `X-Forwarded-For` hop.
- `express.json({ limit: '256kb' })` (`index.js:75`), then `attachSession` (`index.js:76`).
- CORS (`index.js:56`) allow-lists `config.corsOrigins` (env `CORS_ORIGIN`, comma list, default `http://localhost:3000`); no-origin requests (curl/server-to-server) are always allowed. `credentials: true` is set but is vestigial — see §9.
- **There is no CSRF middleware and no cookie middleware in the auth path.** `middleware/csrf.js` does not exist; the middleware directory is exactly `error.js, rbac.js, serviceAuth.js, session.js, validate.js`. The API is pure-Bearer (`index.js:108-109`).

#### `attachSession` (`middleware/session.js`)

```js
req.auth = null;
const bearer = authz?.startsWith('Bearer ') ? authz.slice(7).trim() : null;
if (!bearer) return next();
req.auth = await verifyAccessToken(bearer);
```

Non-fatal: an absent/garbage/expired token leaves `req.auth = null` rather than erroring. Two caveats:

- The in-file comment claiming "signature + iss/aud/exp only — no cookie, **no DB hit**" (`middleware/session.js:5`) is **wrong/stale**. `verifyAccessToken` → `loadUserWithRoles` runs a real query on every authenticated request (`auth/session.js:154-160`, `18-30`). The user access token also carries no `iss`/`aud` at all — that is the *service* JWT.
- `attachSession` is `async` but registered directly with `app.use` under **Express 4**, which does not await middleware. If the DB is down, `verifyAccessToken` rejects, `next()` is never called, and the request hangs (unhandled rejection) rather than 500-ing.

#### `validate` (`middleware/validate.js`)

`validate(schema, source = 'body')` runs `schema.safeParse(req[source])`; on failure throws `HttpError(400, 'Validation failed', { issues: [{path, message}] })`; on success **replaces** `req[source]` with the parsed/coerced data (so `.trim()` in schemas mutates what handlers see). Only `body` is used anywhere in the auth subsystem.

#### `error.js`

`notFound` → `404 { error: 'not_found', message: 'No route for <METHOD> <path>' }`.

`errorHandler` maps `HttpError.status` → a stable `error` code string via `ERROR_CODE` (`middleware/error.js:12-15`), then spreads `err.extra` into the body:

| status | `error` value |
|---|---|
| 400 | `error` |
| 401 | `unauthorized` |
| 403 | `forbidden` |
| 404 | `not_found` |
| 409 | `conflict` |
| 422 | `unprocessable` |
| 429 | `error` |
| 503 | `unavailable` |
| **anything else (incl. 423, 502)** | `error` (fallback) |

Non-`HttpError`: pg `23505` → `409 {error:'conflict', message:'Duplicate resource'}`; pg `23514` → `422 {error:'unprocessable', ..., detail: err.constraint}`; everything else logs and returns `500 {error:'internal', message:'Internal server error'}`.

Note `423` (Locked) is **not** in the map, so a lockout returns `{"error":"error","message":"…","locked":true,"lockedUntil":"…"}`.

`ah` (`util/async.js`) is the async wrapper: `Promise.resolve(fn(...)).catch(next)`. Every async auth handler is wrapped; `GET /me` is the one plain sync handler.

---

### 2. Two token schemes — precise difference

There are **two entirely separate credential formats**, with different secrets, algorithms, structures and consumers.

#### 2.1 User access/refresh token — hand-rolled 2-part token (`auth/token.js`)

**Not a JWT.** No header segment, no `alg`, no `iss`/`aud`, and `exp`/`iat` are **milliseconds**, not seconds.

```
token = base64url(JSON.stringify(payload)) + "." + base64url(HMAC_SHA256(base64urlPayload, secret))
```

Construction (`auth/token.js:23-30`):

```js
const data = { ...payload, type, exp: expiresAt.getTime(), iat: Date.now(), jti: randHex(16) };
const b64 = Buffer.from(JSON.stringify(data)).toString('base64url');
const signature = crypto.createHmac('sha256', secret()).update(b64).digest('base64url');
return { token: `${b64}.${signature}`, hash: hashToken(token), expiresAt };
```

- **Signature input** is the base64url payload string only (there is no header to bind), so this is *not* a compact JWS.
- `jti` = 16 random bytes hex (32 chars). `type` is `'access'` or `'refresh'`.
- Access payload (`auth/session.js:142-148`): `{ userId, email, displayName, role, roles, type:'access', exp, iat, jti }`. `role` is the single strongest role (`highestRole`, `auth/session.js:7-14`, max index in `ROLE_ORDER`) for JI compatibility; `roles` is the full array for JubileePraise's own RBAC.
- Refresh payload (`auth/session.js:169`): `{ userId, type:'refresh', exp, iat, jti }` — nothing else.
- Secret: `config.token.secret` = `JWT_SECRET || SESSION_SECRET || 'dev-only-change-me-please-32-bytes-min'` (`config.js:58`). This is deliberately **JubileeInspire's shared `JWT_SECRET`** so the format is byte-for-byte compatible with JI's `api/services/crypto.js` (`auth/token.js:4-14`).
- TTLs (`config.js:59-61`): access `ACCESS_TOKEN_TTL_MS` default **3 600 000 ms (1 h)**; refresh `REFRESH_TOKEN_TTL_MS` default **30 d**; extended refresh `EXTENDED_REFRESH_TTL_MS` default **365 d**.

Verification (`auth/token.js:47-63`): split on `.`, recompute HMAC over `b64`, `crypto.timingSafeEqual` (with a length pre-check so a wrong-length signature short-circuits), `JSON.parse` the payload, reject if `payload.exp < Date.now()`, reject if `expectedType` mismatches. Any throw → `null`.

`verifyAccessToken` (`auth/session.js:154`) additionally loads the user from the DB and returns `null` unless `is_active` — so **deactivation and role changes take effect on the very next request**, despite the token being stateless.

Used by: every user-facing route via `Authorization: Bearer <token>` → `attachSession` → `req.auth = { user:{id,email,displayName}, roles:[…] }`.

#### 2.2 Service JWT — real HS256 JWT (`auth/serviceToken.js`)

A genuine 3-part compact JWS minted with `jose`'s `SignJWT` (`auth/serviceToken.js:50-58`):

- Header: `{ alg: 'HS256', typ: 'JWT' }`
- Claims: `sub` = client id, `iss` = `config.service.issuer` (`SERVICE_JWT_ISSUER`, default `https://api.jubileepraise.com`), `aud` = `config.service.audience` (`SERVICE_JWT_AUDIENCE`, default `jubileepraise-admin`), `iat`, `exp` (**seconds**, `SERVICE_TOKEN_TTL_SEC`, default **600**), `jti` = `crypto.randomUUID()`, `scope` = space-delimited string.
- Secret: `config.service.jwtSecret` = `SERVICE_JWT_SECRET`, **empty by default**. Empty ⇒ issuance `503`, every admin call `401` (fails closed, `auth/serviceToken.js:44-47`, `66-70`).
- Verification (`auth/serviceToken.js:71-75`): `jwtVerify` pinned to `algorithms: ['HS256']` plus `issuer` + `audience`; `exp`/`nbf` enforced by jose.

Used by: `/api/auth/admin/*` only, via `requireServiceAuth`.

**The two never mix.** A user access token presented to `/api/auth/admin/set-password` fails `jwtVerify` (not a JWT) → 401. A service JWT presented to a user route fails `verifyToken` (3 segments; `token.split('.')` yields a signature that is the *payload* segment, HMAC mismatch) → `req.auth = null`.

#### 2.3 Password hashing (`auth/password.js`)

`scrypt` with Node defaults (N=16384, r=8, p=1), 16-byte random salt, 64-byte key. Stored format: `scrypt:<saltHex>:<dkHex>`. `verifyPassword` re-derives at the stored key's length and `timingSafeEqual`s; any malformed/non-string stored value returns `false` rather than throwing. Synchronous (`scryptSync`) — it blocks the event loop for the duration of every login.

---

### 3. Refresh tokens: rotation, revocation, sliding TTL

Table `identity.refresh_tokens` (migration `0008_refresh_tokens.sql`): `id, user_id, token_hash UNIQUE, expires_at, revoked_at, created_at`. **Only `sha256hex(token)` is stored** (`hashToken`, `auth/token.js:19`).

- **Creation** (`createRefreshToken`, `auth/session.js:168`): signs a `type:'refresh'` token, inserts the hash + `expiresAt`.
- **`extended` = "keep me signed in"**: `rememberMe: true` in the request body flows to `issueTokens({ extended })` (`routes/auth.js:37-41`) → `generateRefreshToken(payload, { extended })` → TTL `extendedRefreshTtlMs` (1 y) instead of `refreshTtlMs` (30 d) (`auth/token.js:38-41`).
- **Non-rotating.** `redeemRefreshToken` (`auth/session.js:182-202`) verifies the signature/exp/type, then `SELECT … FOR UPDATE OF rt` on `token_hash` with `revoked_at IS NULL AND expires_at > NOW()` joined to an active user, and **slides `expires_at` forward**. The same raw token is handed back to the client (`routes/auth.js:263`), so concurrent refreshes from multiple tabs/devices all succeed.
- ⚠️ **The slide uses a different constant than issuance.** `auth/session.js:198` sets `expiresAt = now + config.refreshTtlDays * 24h` — `REFRESH_TTL_DAYS`, default **30** (`config.js:49`) — *not* `config.token.extendedRefreshTtlMs`. So a "keep me signed in" token whose DB row started at +1 y has its **DB expiry pulled back to +30 d on its first refresh**. The token's own signed `exp` still says 1 y, and the effective lifetime is the minimum of the two, i.e. 30 idle days after the last refresh. This is almost certainly unintended.
- **Revocation**: `revokeRefreshToken(raw)` sets `revoked_at = NOW()` for one hash; `revokeAllRefreshTokens(userId, { exceptToken })` nulls out every live token, optionally sparing the caller's (`auth/session.js:211-225`).
- **Access tokens are not individually revocable.** The comment at `auth/session.js:227-230` is explicit: password change / logout-all kills refresh tokens so no new access token can be minted; outstanding access tokens lapse at their 1 h TTL. (In practice the DB `is_active` check in `verifyAccessToken` gives immediate kill for *deactivation*, but not for logout.)

`identity.sessions` (migration `0001_init.sql`) still exists in the schema but is **dead** — no code in the auth subsystem reads or writes it.

---

### 4. RBAC (`middleware/rbac.js`, `config.js:189`)

```js
export const ROLE_ORDER = ['viewer', 'reviewer', 'content_editor', 'executive', 'admin'];
```

Index = privilege level. `viewer` (0) is the never-removable baseline; `reviewer` (1) is a JubileePraise-native, deliberately low-ranked orthogonal capability (studio-album preview) so it grants nothing via `requireRole`; `executive` (3) replaced the legacy `radio_producer` + `production_manager` in migration `0017`.

- `roleLevel(roles)` = max `ROLE_ORDER.indexOf(r)`, `-1` when empty.
- `hasRole(roles, minRole)` = `roleLevel(roles) >= ROLE_ORDER.indexOf(minRole)`. ⚠️ An unknown/typo'd `minRole` yields `indexOf === -1`, so `hasRole` returns true for **any** user (even one with zero roles, since `-1 >= -1`). Callers must pass a literal from `ROLE_ORDER`.
- `requireAuth(req,res,next)` — throws `HttpError(401, 'Authentication required')` when `req.auth` is falsy. Synchronous throw, caught by Express 4's sync error path.
- `requireRole(minRole)` — 401 if unauthenticated, else `403 "Requires role: <minRole> or higher"`.
- `HttpError(status, message, extra)` is defined here and imported everywhere (including by `middleware/error.js` and both service routers).

Storage: `identity.user_roles (user_id, role, granted_at, granted_by)`, PK `(user_id, role)`, with a `CHECK (role IN ('viewer','reviewer','content_editor','executive','admin'))` (final form set by `0017_executive_role_and_names.sql`). Roles are read on every access-token verification by `loadUserWithRoles` (`auth/session.js:19-27`) via `array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL)`, defaulting to `'{}'`.

Within the auth subsystem `requireRole` is never used; only `requireAuth` (on `/logout-all`, `/change-password`, `DELETE /account`).

`DEFAULT_SIGNUP_ROLE` (`routes/auth.js:21-22`) = env `DEFAULT_SIGNUP_ROLE` if it is a member of `ROLE_ORDER`, else `'content_editor'`.

---

### 5. Dual login modes: `AUTH_LOGIN_MODE`

`config.loginMode` (`config.js:40`) — `(process.env.AUTH_LOGIN_MODE || 'local').toLowerCase() === 'ji' ? 'ji' : 'local'`. Anything that isn't literally `ji` is `local`. Logged at boot (`index.js:145`).

This flag branches **exactly one place**: the top of `POST /api/auth/signin` (`routes/auth.js:408`). Everything else — signup, verify-signup, verify-login, forgot/reset/change password, refresh, logout — is identical in both modes.

| | `local` (dev default) | `ji` (production) |
|---|---|---|
| Password verified by | `verifyPassword` against `identity.credentials` (`routes/auth.js:452`) | JI's `POST {JI_LOGIN_BASE}/api/auth/login` |
| Turnstile | verified **locally** via `challenges.cloudflare.com/turnstile/v0/siteverify` (`routes/auth.js:64-77`) | **forwarded raw** to JI; never verified locally (single-use token) |
| 2FA / OTP | local `identity.login_verifications` + our own email | JI issues + validates; we relay `{requires2FA, verificationGuid}` |
| Lockout | local `identity.users.locked_until` | JI's; surfaced via `body.locked / body.lockedUntil` |
| Roles | whatever is in `identity.user_roles` | re-synced from JI's `role` on every login (`upsertUserFromJI`) |
| Response `user` | `{id, email, displayName}` only | **JI's full profile object** (role, accountType, subscription, preferences…) verbatim |
| `trustToken` | always `null` | JI's `body.trustToken ?? null` |
| Session tokens | ours | **still ours** — JI's tokens are discarded because they carry JI's userId |

JI is the *credential* authority; JubileePraise remains the *session* authority (`services/jiLogin.js:1-13`).

Three helpers implement the `ji` path:

**`establishSessionFromJI`** (`routes/auth.js:134-159`) — `upsertUserFromJI(jiUser)`, then **mirrors the plaintext password into local `identity.credentials`** (`INSERT … ON CONFLICT (user_id) DO UPDATE`) so JI-only users gain a local credential anchor that makes `/change-password` and `/forgot-password` work. Wrapped in try/catch; a failure only warns. Then mints our tokens with `extended = !!req.body.rememberMe` and audits `login_success { via: 'ji_delegate' }`.

**`upsertUserFromJI`** (`auth/session.js:66-125`) — keys on **email** (unique) not `external_subject`, so an existing `jubileepraise|<email>` row is updated rather than colliding. `external_subject` is written as `jubileeinspire|<jiUser.id>` **only on insert**; the `ON CONFLICT (email) DO UPDATE` touches only `last_login_at` and `is_active = TRUE` — display/first/last names are deliberately *not* overwritten on return logins so admin edits stick. Roles are then reconciled to exactly `JI_ROLE_MAP[jiUser.role]` (`user→content_editor`, `admin→admin`, `guest→viewer`, unknown→`viewer`), granting what's missing and revoking only roles in `JI_MANAGED_ROLES` — so JubileePraise-native grants like `reviewer` survive (`auth/session.js:60-64`, `111-121`). Each grant/revoke writes an `identity.audit_log` row (`role.grant` / `role.revoke`, `payload.source = 'ji_login'`).

**`relayJI`** (`routes/auth.js:211-230`) — translation layer:
- 2xx + `body.success` + `body.requires2FA` → `200 {success:true, requires2FA:true, email, verificationGuid}`.
- 2xx + `body.success` + `body.user` → establish session, `200 {success:true, user: <JI's user>, tokens, trustToken}`.
- 2xx + `body.success` but no `user` → `HttpError(502, 'Auth service returned an unexpected response.')`.
- otherwise → `HttpError(status in [400,600) ? status : 502, body.error || 'Sign in failed')`, with `{locked:true, lockedUntil}` spread in when `body.locked`. A JI `200 {success:false}` therefore becomes a **502**.

**`selfHealJiLogin`** (`routes/auth.js:169-206`) — the migration path for accounts created on JubileePraise before JI knew them. Only runs on `status === 401` **and** no `verificationCode` present (`routes/auth.js:421`). Steps: look up local user + credential (active only); return `null` if no local credential or `verifyPassword` fails or `locked_until` is in the future; else `provisionUserToJI({email, password, displayName, emailVerified:true})`. Only `{ok:true}` (JI 201 = fresh create) proceeds — a 409 means JI really did know the account so its 401 was a genuine bad password, and any other failure means JI is down; both return `null` and fall through to `relayJI`. On success: audit `account.ji_self_provisioned {via:'signin_migration'}`, `finalizeLogin`, and return the full auth envelope with `trustToken: null`.

---

### 6. Cross-platform sync with JubileeInspire (`services/jiSync.js`, `services/jiLogin.js`)

#### Configuration

| Key | Env | Default |
|---|---|---|
| `config.jiSync.baseUrl` | `JI_API_BASE` | `https://api.jubileeinspire.com` (trailing `/` stripped) |
| `config.jiSync.clientId` | `JI_SERVICE_CLIENT_ID` | `''` |
| `config.jiSync.clientSecret` | `JI_SERVICE_CLIENT_SECRET` | `''` |
| `config.jiSync.checkEmailTimeoutMs` | `JI_CHECK_EMAIL_TIMEOUT_MS` | `4000` |
| `config.jiLogin.baseUrl` | `JI_LOGIN_BASE` ‖ `JI_API_BASE` | `https://api.jubileeinspire.com` |
| `config.jiLogin.source` | `JI_LOGIN_SOURCE` | `jubilujah` — JI's registered platform key for this site, not the brand; jiSync sends it as `sourcePlatform` too |

`jiSyncEnabled()` = both `clientId` **and** `clientSecret` non-empty (`services/jiSync.js:34`).

#### Outbound token cache

Module-level `let cached = { token, expiresAt }` shared by all three outbound calls (`services/jiSync.js:32`). `fetchToken` POSTs `{client_id, client_secret}` to `{base}/api/auth/service/token`, accepts `access_token` or `token`, and caches with `expiresAt = now + expires_in*1000 - 30_000` (`SKEW_MS`). Every call site retries **exactly once** on a `401` after force-refreshing.

#### `syncPasswordToJI(email, newPassword)` — outbound password push

`POST {base}/api/auth/admin/set-password` with `Authorization: Bearer <cached>` and `{email, newPassword}` (plaintext over TLS). Called from `POST /reset-password` (`routes/auth.js:636`) and `POST /change-password` (`routes/auth.js:662`). **Never throws**; returns:

| Result | Meaning |
|---|---|
| `{ok:true}` | synced |
| `{ok:false, skipped:true}` | `jiSyncEnabled()` false |
| `{ok:false, error:'missing email or password'}` | guard |
| `{ok:false, status}` | JI non-2xx (body logged, first 300 chars) |
| `{ok:false, error:'<message>'}` | network/parse/token failure |

The result object is returned to the client verbatim as the `jiSync` field of the response.

⚠️ **No timeout.** Unlike `checkEmailOnJI`, neither `postSetPassword` nor `postProvision` passes an `AbortSignal`. A hung JI blocks the user's `/reset-password` or `/change-password` response until Node's default socket timeout — the local mutation has already committed by then, so it's a UX hang, not a correctness bug.

#### `provisionUserToJI({email, password, displayName, role, emailVerified})`

`POST {base}/api/auth/admin/provision-user` with `{email, password, role: role||'user', emailVerified: emailVerified===true, sourcePlatform: config.jiLogin.source}` (+ `displayName` when truthy). Requires the `admin.provision` scope on the `jubilujah` client at JI. Returns `{ok:true, created:true}` on **201**, `{ok:false, conflict:true}` on **409**, `{ok:false, skipped:true}` when disabled, `{ok:false, status}` / `{ok:false, error}` otherwise. Only called from `selfHealJiLogin`.

#### `checkEmailOnJI(email)` — pre-signup gate

`GET {base}/api/auth/check-email?email=<enc>`; the Bearer header is attached **only when `jiSyncEnabled()`**. Deliberately different from the other two: it still calls out unauthenticated, because the endpoint is public on UAT/dev and Bearer-gated only in prod (`services/jiSync.js:186-191`). One `AbortSignal.timeout(4000)` covers the token fetch *and* the request. The 401-refresh-retry only fires when a token was actually sent.

Returns `{ok:true, exists:boolean, platform: data.platform ?? null}` on 2xx, `{ok:false, status}` on non-2xx, `{ok:false, error}` on timeout/network. **Any `ok:false` means "could not determine" and the caller fails open** (`routes/auth.js:292`).

#### Inbound delegation (`services/jiLogin.js`)

`jiPost` sets `content-type: application/json` plus `x-forwarded-for: <req.ip>` so JI's rate-limit / lockout / Turnstile `remoteip` attribute the real visitor. A `fetch` rejection is logged and re-thrown as a **plain `Error('auth_upstream_unreachable')`** — not an `HttpError` — so it surfaces to the client as **`500 {"error":"internal"}`**, not a 502/503. No timeout is set here either.

`jiLogin({email,password,cfTurnstileToken,rememberMe,verificationCode,ip})` → `POST /api/auth/login` with `{email, password, source: config.jiLogin.source, rememberMe: !!rememberMe}` plus `cfTurnstileToken` / `verificationCode` when truthy. `jiVerifyLogin({verificationGuid, code, ip})` → `POST /api/auth/verify-login` — **exported but never imported anywhere**; dead code, because in `ji` mode the 2FA step re-POSTs to our own `/signin` with the code (`routes/auth.js:410-416`).

---

### 7. Turnstile, OTP, and lockout mechanics

#### Turnstile (`routes/auth.js:64-77`)

```js
if (!config.turnstile.secret) return true;   // skip entirely — the dev default
if (!token) return false;
```

POSTs `URLSearchParams{secret, response, remoteip?}` to `https://challenges.cloudflare.com/turnstile/v0/siteverify` and returns `j.success === true`. **Fails closed** on any network/parse error (logs `Turnstile siteverify failed`, returns `false`). Config: `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY`, both `''` by default (`config.js:66-69`).

Applied **only** on `POST /signin` in `local` mode, and **only on the password step** — when `verificationGuid && verificationCode` are both present the check is skipped, because the unguessable GUID is the proof (`routes/auth.js:430-437`). `/signup` has **no** Turnstile at all. In `ji` mode the token is forwarded raw and *only* when no `verificationCode` is present (`routes/auth.js:415`).

#### OTP constants (`routes/auth.js:46-51`)

| Constant | Value |
|---|---|
| `LOGIN_CODE_EXPIRY_MS` | 15 min |
| `SIGNUP_CODE_EXPIRY_MS` | 30 min |
| `LOGIN_CODE_ATTEMPTS` | 5 (used as `max_attempts` for **both** login and signup rows) |
| `RESEND_COOLDOWN_MS` | 60 s |
| `MAX_LOGIN_RESENDS` | 2 (⇒ 3 codes total) |
| `LOGIN_LOCKOUT_MS` | 1 h |

Codes: `String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')` — uniform over `000000`–`999999` (`routes/auth.js:54`). Stored **in plaintext** in `code VARCHAR(6)`; compared with `codeMatches` = length check + `crypto.timingSafeEqual` (`routes/auth.js:56-60`).

#### `consumeVerification` (`routes/auth.js:92-113`)

Runs in a transaction with `SELECT … FOR UPDATE` on `(verification_guid, user_id)` so a code can't be double-spent concurrently. Ordered failures: missing row → `400 'Invalid or expired verification.'`; `verified_at` set → `400 'This code was already used.'`; expired → `400 'Verification code expired. Request a new one.'`; `attempts >= max_attempts` → `429 'Too many attempts. Request a new code.'`; wrong code → increments `attempts` and throws `400 'Incorrect code. N attempt(s) left.'` with `{attemptsRemaining: N}`. Success sets `verified_at = NOW()`.

#### Lockout

`identity.users.locked_until` is set in exactly **one** place: `POST /send-login-verification` when `resend_count >= 2` — `now + 1 h`, audit `login_locked {reason:'resend_cap'}`, response `423 {locked:true, lockedUntil}` (`routes/auth.js:547-552`). There is **no failed-password-attempt lockout** in local mode; that hardening lives on JI's side and only applies in `ji` mode.

`locked_until` is cleared by: `finalizeLogin` (`routes/auth.js:120`), `POST /reset-password` (`routes/auth.js:628`), and service `POST /admin/set-password` (`routes/service.js:138`).

The lockout gate on `/signin` is bypassed when the caller is submitting a code (`&& !submittingCode`, `routes/auth.js:459`) — deliberate, so a user who already holds a valid code isn't stranded by a resend-cap lock.

#### `writeAudit` (`routes/auth.js:81-88`)

`INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload) VALUES ($1,$2,'user',$3,$4)`. `actorId` is passed as **two separate params** ($1 uuid, $3 text) to avoid Postgres 42P08 type-deduction failure (same trick documented at `routes/service.js:140-141`). Accepts an optional transaction client. Actions emitted across the subsystem: `login_success`, `login_failed`, `login_locked`, `login_2fa_sent`, `account.created`, `account.ji_self_provisioned`, `password.reset_requested`, `password.reset`, `password.changed`, plus (from `service.js`) `password.admin_set`, `password.admin_set_failed`, `account.provisioned`, `account.provision_conflict`, and (from `session.js`) `role.grant` / `role.revoke`.

---

### 8. Public endpoints — `/api/auth/*` (`routes/auth.js`)

All are subject to `authLimiter` (50/15 min/IP). "Auth" below means the user access token via `Authorization: Bearer`.

#### 8.1 Sign-up

##### `POST /api/auth/signup`
**Auth:** none.

| Field | Zod | Constraint |
|---|---|---|
| `name` | `z.string().trim().min(1).max(120)` | 1–120 after trim |
| `email` | `z.string().trim().email().max(254)` | valid email, ≤254 |
| `password` | `z.string().min(8).max(200)` | 8–200 |

Steps:
1. `emailNorm = email.toLowerCase()`.
2. `SELECT 1 FROM identity.users WHERE email = $1 AND is_active = TRUE` → **409** `'An account with this email already exists. Please sign in.'`
3. `checkEmailOnJI(emailNorm)` — if `ok && exists`, log and **409** with the *same* message. If `!ok`, log `'JI check-email unavailable; allowing signup'` and continue (**fail open**).
4. Transaction: `DELETE FROM identity.signup_verifications WHERE email = $1 AND used_at IS NULL` (so only the newest code works), then `INSERT` `(email, display_name, password_hash, code, expires_at = NOW() + 30min, max_attempts = 5)` `RETURNING verification_guid`.
5. `sendSignupVerificationEmail({to, code})` — **outside** the transaction, unguarded, so an email failure after commit 500s with the pending row already written (the user can then resend).

**Side effects:** `identity.signup_verifications` DELETE+INSERT; outbound `GET` to JI check-email; signup verification email. **No `identity.users` row is created.**

**200:** `{ success: true, requiresVerification: true, email: "<lowercased>", verificationGuid: "<uuid>" }`

**Errors:** 400 (validation, `issues[]`), 409 (local or JI email collision), 429 (IP limiter), 500.

##### `POST /api/auth/verify-signup`
**Auth:** none.

| Field | Zod |
|---|---|
| `verificationGuid` | `z.string().uuid()` |
| `verificationCode` | `z.string().regex(/^\d{6}$/)` |
| `rememberMe` | `z.boolean().optional()` |

Single transaction with `SELECT * … FOR UPDATE`:
- missing → 400 `'Invalid or expired verification.'`
- `used_at` → 400 `'This sign-up was already completed. Please sign in.'`
- expired → 400 `'Verification code expired. Please sign up again.'`
- `attempts >= max_attempts` → 429 `'Too many attempts. Please sign up again.'`
- wrong code → `attempts+1`, 400 `'Incorrect code. N attempt(s) left.'` + `{attemptsRemaining}`
- email claimed in the meantime → marks the row `verified_at`+`used_at`, then 409 (**note: the throw rolls that update back**)
- otherwise: INSERT `identity.users (external_subject = 'jubileepraise|<email>', email, display_name, last_login_at = NOW(), first_signin_completed = TRUE)`; INSERT `identity.credentials` reusing the **hash stored at phase 1** (the plaintext was never persisted); INSERT `identity.user_roles (user_id, DEFAULT_SIGNUP_ROLE, granted_by = self) ON CONFLICT DO NOTHING`; mark the verification row spent; audit `account.created {via:'signup_otp'}`.

Then, **outside** the transaction, `issueTokens({userId, extended: !!rememberMe})`.

**201:** `{ user: {id, email, displayName}, tokens: {accessToken, refreshToken, expiresAt} }` — note there is **no `success` field** here, unlike `/signin`.

**Errors:** 400, 409, 429, 500.

##### `POST /api/auth/send-signup-verification`
**Auth:** none. Body: `{ verificationGuid: uuid }`.

Transaction + `FOR UPDATE`: missing → 400; `used_at` → 400 `'This sign-up was already completed…'`; within 60 s of `last_resend_at` → **429** `'Please wait Ns before requesting another code.'` + `{cooldownSeconds}`; `resend_count >= 2` → **429** `'Too many code requests. Please start sign-up again.'` + `{exhausted:true}`. Otherwise regenerates `code`, resets `attempts = 0`, pushes `expires_at` to `NOW()+30min`, `resend_count+1`, `last_resend_at = NOW()`, and sends the email **inside the transaction** (a send failure rolls the resend back — different from `/signup`).

**200:** `{ success: true, verificationGuid, resendsRemaining }`. Note the signup resend cap yields a 429, **not** a lockout (contrast the login resend, which 423s).

#### 8.2 Sign-in

##### `POST /api/auth/signin`
**Auth:** none.

| Field | Zod |
|---|---|
| `email` | `z.string().trim().email().max(254)` |
| `password` | `z.string().min(1).max(200)` |
| `cfTurnstileToken` | `z.string().max(2048).optional()` |
| `verificationGuid` | `z.string().uuid().optional()` |
| `verificationCode` | `z.string().regex(/^\d{6}$/).optional()` |
| `rememberMe` | `z.boolean().optional()` |

**`ji` mode** (`routes/auth.js:408-426`): calls `jiLogin({email, password, rememberMe, verificationCode, cfTurnstileToken: verificationCode ? undefined : cfTurnstileToken, ip: req.ip})`. On `401` with no `verificationCode`, tries `selfHealJiLogin` and returns its envelope with **200** if it healed. Otherwise `relayJI`.

**`local` mode**, step by step:
1. If not `submittingCode` (`verificationGuid && verificationCode`), `verifyTurnstile` → **400** `'Human verification failed. Please retry.'` on failure.
2. One query joining `identity.users` ⋈ `identity.credentials` ⟕ `identity.user_security_settings`, selecting `first_signin_completed`, `locked_until`, `password_hash`, `COALESCE(two_factor_enabled, FALSE)`, filtered `is_active = TRUE`.
3. No row **or** `verifyPassword` fails → audit `login_failed {reason:'bad_password'}` (only when a row existed) and **401** `'Invalid email or password'` — one generic message, no enumeration. Note an account with **no credentials row** (SSO-only) is indistinguishable from a wrong password here, since it's an INNER JOIN.
4. `locked_until > now && !submittingCode` → audit `login_locked`, **423** `'Account temporarily locked. Try again later.'` + `{locked:true, lockedUntil}`.
5. `otpRequired = !first_signin_completed || two_factor_enabled`.
   - **5a** OTP required, no code yet → transaction: INSERT `identity.login_verifications (user_id, code, expires_at = NOW()+15min, max_attempts = 5)`, audit `login_2fa_sent {channel:'email'}`, send the OTP email (inside the transaction), return **200** `{success:true, requires2FA:true, email, verificationGuid}`.
   - **5b** OTP required and code supplied → `consumeVerification` (throws 400/429 as above).
6. `finalizeLogin` — `UPDATE identity.users SET first_signin_completed = TRUE, locked_until = NULL, last_login_at = NOW()`, mint tokens, audit `login_success {}`.

**200 (local success):** `{ success: true, user: {id, email, displayName}, tokens: {…}, trustToken: null }`
**200 (ji success):** same shape but `user` is JI's full profile and `trustToken` is JI's.

**Errors:** 400 (validation / Turnstile / bad OTP), 401, 423, 429, 500 (JI unreachable), 502 (JI unparseable/`success:false` at 2xx), plus any 4xx JI itself returned.

##### `POST /api/auth/verify-login`
**Auth:** none. Fields: `email` (email ≤254), `verificationGuid` (uuid), `verificationCode` (`/^\d{6}$/`), `rememberMe` (optional bool).

Looks up the active user by lowercased email (missing → **400** `'Invalid or expired verification.'`), runs `consumeVerification`, then `finalizeLogin`.

**200:** `{ user: {id, email, displayName}, tokens: {…} }` — again **no `success` field**.

⚠️ **This endpoint is local-mode only** (comment at `routes/auth.js:506-507`). In `ji` mode the challenge lives in JI's DB, so this would always 400; the web client instead re-POSTs `/signin` with the code.

##### `POST /api/auth/send-login-verification`
**Auth:** none. Body: `{ email, verificationGuid }`.

Transaction: resolve the active user (missing → 400 `'Invalid or expired verification.'`); `SELECT … FOR UPDATE` the verification scoped to `(guid, user_id)` (missing → 400); `verified_at` set → 400 `'Already verified.'`; <60 s since `last_resend_at` → **429** + `{cooldownSeconds}`; `resend_count >= 2` → set `locked_until = now + 1 h`, audit `login_locked {reason:'resend_cap'}`, **423** `'Too many code requests. Your account is locked for 1 hour.'` + `{locked:true, lockedUntil}`. Otherwise: new code, `attempts = 0`, `expires_at = NOW()+15min`, `resend_count+1`, `last_resend_at = NOW()`, audit `login_2fa_sent {resend:true}`, send email.

**200:** `{ success:true, verificationGuid, resendsRemaining }`.

#### 8.3 Password flows

##### `POST /api/auth/forgot-password`
**Auth:** none. Body: `{ email }` (email ≤254).

Selects active users **that have a credentials row** (INNER JOIN). If found: 32 random bytes → `base64url` raw token; INSERT `identity.password_resets (user_id, token_hash = sha256hex(raw), expires_at = now + config.email.resetTtlMinutes*60s, request_ip = req.ip)`; audit `password.reset_requested {ip}`; build `${config.webBaseUrl}/reset-password?token=<raw>` and send the email inside a `try/catch` that only logs.

**Always 200** regardless: `{ ok: true, message: 'If an account exists for that email, a reset link has been sent.' }` — full anti-enumeration.

TTL: `PASSWORD_RESET_TTL_MIN`, default **60** min (`config.js:77`). `webBaseUrl` = `WEB_BASE_URL`, default `http://localhost:3000`.

##### `POST /api/auth/reset-password`
**Auth:** none.

| Field | Zod |
|---|---|
| `token` | `z.string().min(20).max(200)` |
| `password` | `z.string().min(8).max(200)` |

Transaction: `SELECT … FOR UPDATE` `password_resets` ⋈ `users` on `token_hash = sha256hex(token) AND used_at IS NULL AND expires_at > NOW() AND u.is_active` → missing → **400** `'This reset link is invalid or has expired.'`. Then: **upsert** `identity.credentials` (`ON CONFLICT (user_id) DO UPDATE`, so an SSO-only account gains a password); mark this reset used; mark **all** other outstanding resets for the user used; `locked_until = NULL`; audit `password.reset {ip}`.

After commit: `revokeAllRefreshTokens(userId)` (every device must re-login) and `syncPasswordToJI(email, password)`.

**200:** `{ ok: true, jiSync: <result object> }` — e.g. `{"ok":true,"jiSync":{"ok":false,"skipped":true}}` when JI sync is unconfigured. **Reset does not sign the user in** — no tokens are returned.

**Errors:** 400, 429, 500.

##### `POST /api/auth/change-password`
**Auth:** `requireAuth` (Bearer access token). Note the **snake_case** field names.

| Field | Zod |
|---|---|
| `current_password` | `z.string().min(1).max(200)` |
| `new_password` | `z.string().min(8).max(200)` |
| `refreshToken` | `z.string().max(400).optional()` |

Steps: fetch `credentials.password_hash` for `req.auth.user.id` → missing → **409** `'No password is set for this account. Use "forgot password" to create one.'`; `verifyPassword(current_password)` fails → **401** `'Current password is incorrect.'`; `UPDATE identity.credentials`; audit `password.changed {ip}`; `revokeAllRefreshTokens(userId, { exceptToken: req.body.refreshToken })` so *this* device stays signed in while every other is logged out; `syncPasswordToJI(req.auth.user.email, new_password)`.

**200:** `{ ok: true, jiSync }`. **Errors:** 400, 401 (no session / wrong current password), 409, 429, 500.

Note the caller's **current access token stays valid until its 1 h TTL** either way — the change is only enforced at the refresh boundary.

#### 8.4 Session lifecycle

##### `POST /api/auth/logout`
**Auth:** none (deliberately). Optional body `{ refreshToken }` — **not schema-validated**; if present, `revokeRefreshToken` marks that hash revoked. Always **200** `{ ok: true }`. Since the raw refresh token *is* the credential, revoking it needs no session; an unknown token is a silent no-op.

##### `POST /api/auth/logout-all`
**Auth:** `requireAuth`. No body. `revokeAllRefreshTokens(req.auth.user.id)` → **200** `{ ok: true }`. **401** without a valid token.

##### `POST /api/auth/refresh`
**Auth:** none — *the refresh token is the credential*. Body: `{ refreshToken: z.string().min(20).max(400) }`.

`redeemRefreshToken` → `null` → **401** `'Invalid or expired refresh token'`. Otherwise `issueAccessToken({userId})` (which re-reads roles from the DB, so a role change lands here) and returns **200**:

```json
{ "tokens": { "accessToken": "…", "refreshToken": "<the SAME token you sent>", "expiresAt": "2026-07-20T12:34:56.789Z" } }
```

No rotation; the DB row's `expires_at` slides (see §3, including the 30-day-clamp caveat). Note `issueAccessToken` throws a plain `Error` (→ 500) if the user vanished between the DB check and the mint — a narrow race.

##### `DELETE /api/auth/account`
**Auth:** `requireAuth`. No body. Runs `purgeUserAccount(client, userId, email)` in a transaction (`auth/session.js:41-50`):

```
DELETE production.ratings           WHERE rater_user_id
DELETE production.comments          WHERE author_user_id
DELETE production.nominations       WHERE nominator_id
UPDATE identity.audit_log           SET actor_user_id = NULL
UPDATE production.pipeline_state    SET assignee_user_id = NULL
UPDATE catalog.assets               SET uploaded_by = NULL
DELETE identity.users               WHERE id            -- cascades credentials, user_roles,
                                                        -- sessions, user_security_settings,
                                                        -- login_verifications, password_resets,
                                                        -- refresh_tokens, playlists, subscriptions
DELETE identity.signup_verifications WHERE email
```

**200:** `{ ok: true }`. Irreversible — no soft delete. Shared with the admin delete path so the teardown stays in lockstep.

##### `GET /api/auth/me`
**Auth:** optional. The only non-`ah` handler. `req.auth` null → **200** `{ "authenticated": false }`. Otherwise **200** `{ authenticated: true, user: {id, email, displayName}, roles: ["content_editor", …] }`. Counts against the 50/15 min IP limiter.

#### 8.5 Endpoint summary

| Method | Path | Auth | Success |
|---|---|---|---|
| POST | `/api/auth/signup` | none | 200 `{success, requiresVerification, email, verificationGuid}` |
| POST | `/api/auth/verify-signup` | none | **201** `{user, tokens}` |
| POST | `/api/auth/send-signup-verification` | none | 200 `{success, verificationGuid, resendsRemaining}` |
| POST | `/api/auth/signin` | none | 200 `{success, user, tokens, trustToken}` or `{success, requires2FA, email, verificationGuid}` |
| POST | `/api/auth/verify-login` | none | 200 `{user, tokens}` |
| POST | `/api/auth/send-login-verification` | none | 200 `{success, verificationGuid, resendsRemaining}` |
| POST | `/api/auth/forgot-password` | none | 200 `{ok, message}` (always) |
| POST | `/api/auth/reset-password` | none | 200 `{ok, jiSync}` |
| POST | `/api/auth/change-password` | **Bearer** | 200 `{ok, jiSync}` |
| POST | `/api/auth/refresh` | refresh token in body | 200 `{tokens}` |
| POST | `/api/auth/logout` | none | 200 `{ok}` |
| POST | `/api/auth/logout-all` | **Bearer** | 200 `{ok}` |
| DELETE | `/api/auth/account` | **Bearer** | 200 `{ok}` |
| GET | `/api/auth/me` | optional | 200 `{authenticated, user?, roles?}` |

---

### 9. Service-to-service — `/api/auth/service` + `/api/auth/admin`

#### 9.1 Client registry (`config.js:18-27`, `88-101`)

`SERVICE_CLIENTS` format: `id:secret:scopeA|scopeB , id2:secret2 , …`

- Entries split on `,` (trimmed, empties dropped); fields split on `:`; scopes split on `|`.
- A missing third field defaults to `['*']` (all scopes).
- Entries lacking **both** id and secret are dropped.
- ⚠️ Because of the naive `entry.split(':')`, **secrets must not contain `,`, `:` or `|`** — a secret containing `:` silently truncates and the scope list gets garbage. Use hex/base64url secrets.
- Default is `''` ⇒ **zero registered clients** ⇒ every token request 401s.

Other service config: `SERVICE_JWT_SECRET` (`''`), `SERVICE_JWT_ISSUER` (`https://api.jubileepraise.com`), `SERVICE_JWT_AUDIENCE` (`jubileepraise-admin`), `SERVICE_TOKEN_TTL_SEC` (`600`), `ADMIN_SERVICE_ALLOW_IPS` (comma list, `''`), `ADMIN_SERVICE_RATE_MAX` (`600`).

#### 9.2 `requireServiceAuth` (`middleware/serviceAuth.js:21-56`)

Fixed order, matching the set-password contract:

1. **TLS.** Reads the first hop of `x-forwarded-proto`. Rejects with **403** `'HTTPS is required for this endpoint.'` only if the header is **present and ≠ `https`**. An absent header (direct loopback) passes, so local testing works.
2. **Bearer JWT.** `/^Bearer\s+(.+)$/i` against `Authorization` — no match → **401** `'Invalid or missing service token.'`. `verifyServiceToken` throw (bad signature, wrong `iss`/`aud`, expired, or **no secret configured**) → logs `'service JWT rejected'` and the same **401**. On success sets `req.serviceCaller = { clientId: payload.sub, jti, scope }`.
3. **IP allow-list.** If `config.service.allowIps` is non-empty and `req.ip` is not in it → **403** `'Caller IP is not allow-listed.'`. Empty list = token-only.

Everything resolves via `next()`/`next(err)`, so the async middleware is Express-4-safe (unlike `attachSession`).

#### 9.3 `requireServiceScope(required)` (`middleware/serviceAuth.js`)

`required` is a scope string **or an any-of array**. Splits `req.serviceCaller.scope` on whitespace; passes on `*` or a match with any required scope; otherwise **403** `` `Token is missing required scope: ${wanted.join(' or ')}` ``. The array form exists so a new route can honor tokens minted before its scope did (used by `check-email`, §9.8).

#### 9.4 `POST /api/auth/service/token` (`routes/serviceToken.js`)

**Auth:** client credentials in the JSON body.

| Field | Zod |
|---|---|
| `grant_type` | `z.literal('client_credentials').optional()` |
| `client_id` | `z.string().trim().min(1).max(128)` |
| `client_secret` | `z.string().min(1).max(512)` |
| `scope` | `z.string().trim().max(512).optional()` (space-delimited) |

Steps:
1. `!config.service.jwtSecret` → **503** `'Service token issuance is not configured.'` (deliberately distinct from a credential 401).
2. `authenticateClient` (`auth/serviceToken.js:30-38`) — looks up by exact `id`; for an **unknown id it still runs a dummy SHA-256 compare** against `'unknown-client-dummy-secret'` so timing doesn't reveal existence. Comparison is `sha256(a)` vs `sha256(b)` + `timingSafeEqual`, which never leaks secret length. Failure → log `'service token denied: invalid_client'`, set `WWW-Authenticate: Bearer`, **401** with body `{error:'invalid_client', message:'invalid_client'}` (the `extra` overwrites the mapped `unauthorized` code).
3. Scope narrowing: if `scope` is supplied, every requested scope must be in the client's grants **unless** the client holds `*`; otherwise **403** `{error:'invalid_scope', message:'invalid_scope'}`. On success the issued token carries exactly the *requested* set. Omitting `scope` issues the client's full grant list (possibly literally `["*"]`).
4. `issueServiceToken({clientId, scopes})`, log `'service token issued'` with `{clientId, jti, scopes, ip}`.

**200:**
```json
{ "access_token": "<HS256 JWT>", "token_type": "Bearer", "expires_in": 600, "scope": "admin.set_password admin.provision" }
```

**Errors:** 400 (validation), 401 `invalid_client`, 403 `invalid_scope`, 429 (service limiter), 503.

#### 9.5 Idempotency (`routes/service.js:22-72`)

Table `identity.service_idempotency (idempotency_key PK, endpoint, status_code, response_body JSONB, created_at)` (migration `0007`). TTL is the hard-coded string constant `'24 hours'`, interpolated into the SQL (safe — not user input).

- `getIdempotent(key)` selects rows newer than 24 h. **It filters only on `idempotency_key`, not `endpoint`** — reusing one key across `set-password` and `provision-user` replays the *wrong* endpoint's cached response.
- `putIdempotent` upserts with `ON CONFLICT DO UPDATE … WHERE created_at <= NOW() - INTERVAL '24 hours'`, i.e. a fresh conflicting key is left untouched.
- Both wrap everything in try/catch and degrade to "no cache" on any error, so a missing table can never break the operation.

Key source: `req.get('idempotency-key')` trimmed, `null` when blank.

#### 9.6 `POST /api/auth/admin/set-password` (`routes/service.js:98-155`)

**Auth:** `requireServiceAuth` → `requireServiceScope('admin.set_password')` → `validate`. Optional `Idempotency-Key` header.

| Field | Zod |
|---|---|
| `email` | `z.string().trim().email().max(254)` |
| `newPassword` | `z.string()` — length checked in the handler, **not** the schema |

Steps:
1. Length policy `< 8 || > 200` → **422** `'Password must be 8–200 characters.'` (deliberately distinct from the 400 that `validate` gives for missing/malformed).
2. Idempotent replay → returns the cached `{status, body}` verbatim without re-applying.
3. Resolve the account: `SELECT u.id, (c.user_id IS NOT NULL) AS has_credential FROM identity.users u LEFT JOIN identity.credentials c … WHERE u.email = $1 AND u.is_active = TRUE`.
   - no row → audit `password.admin_set_failed {reason:'not_found', email, caller, ip, idemKey}` (actor `null`), **404** `'No active account exists for that email.'` — a real 404 is intentional here (authenticated partner caller).
   - `!has_credential` → audit `password.admin_set_failed {reason:'no_credential'}`, **409** `'Account is not password-capable (SSO-only; no local password).'`
4. Transaction: `UPDATE identity.credentials SET password_hash`; burn all unused `identity.password_resets`; `locked_until = NULL`; INSERT audit `password.admin_set` with `{via:'service', caller, ip, idempotencyKey}`.
5. After commit: `revokeAllRefreshTokens(userId)` — **all** devices, no exception.
6. `putIdempotent(key, '/api/auth/admin/set-password', 200, {ok:true})`.

**200:** `{ ok: true }`. Never creates an account, never emails, never returns the password or hash.

**Errors:** 400, 401, 403 (non-HTTPS / missing scope / IP), 404, 409, 422, 429, 500.

#### 9.7 `POST /api/auth/admin/provision-user` (`routes/service.js:174-266`)

**Auth:** `requireServiceAuth` → `requireServiceScope('admin.provision')` → `validate`. Optional `Idempotency-Key`.

| Field | Zod | Notes |
|---|---|---|
| `email` | `z.string().trim().email().max(254)` | lowercased → `users.email` (CITEXT UNIQUE) |
| `password` | `z.string()` | policy 8–200 checked in-handler → 422 (**create mode only** — skipped in verify mode) |
| `verify` | `z.boolean().optional()` | `true` ⇒ **verify-only mode**, see below; absent/`false` ⇒ create mode, unchanged |
| `firstName` | `z.string().trim().max(50).optional()` | folded into display name only |
| `lastName` | `z.string().trim().max(50).optional()` | folded into display name only |
| `displayName` | `z.string().trim().max(100).optional()` | |
| `role` | `z.enum(['user','admin','guest']).optional()` | default `user` |
| `emailVerified` | `z.boolean().optional()` | `true` ⇒ `first_signin_completed = TRUE` |
| `dateOfBirth` | `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()` | age-gated, **not stored** |
| `sourcePlatform` | `z.string().trim().max(32).optional()` | default `jubileeinspire` |

Steps:
1. Password length → **422**.
2. `dateOfBirth`: `ageInYears` (`routes/service.js:80-88`, whole UTC years, `null` for an unparseable date) → `null` → **422** `'Invalid date of birth.'`; `< 13` → **422** `'User must be at least 13 years old.'`
3. Idempotent replay.
4. Derive `displayName = b.displayName || "firstName lastName" || email.split('@')[0]`, then `.slice(0,200)` (the column is NOT NULL).
5. `ROLE_MAP` (`routes/service.js:76`): `user → content_editor`, `admin → admin`, `guest → viewer` — matching `DEFAULT_SIGNUP_ROLE` parity.
6. `externalSubject = ${sourcePlatform}|${email}` (sourcePlatform sliced to 32).
7. **Create-only.** `SELECT 1 FROM identity.users WHERE email = $1` (note: no `is_active` filter, unlike set-password) → audit `account.provision_conflict`, cache and return **409** `{error:'conflict', message:'An account with this email already exists.'}` — a *non-error* to the caller; the password is **not** changed.
8. Transaction: INSERT `identity.users (external_subject, email, display_name, is_active = TRUE, first_signin_completed = <emailVerified>, last_login_at = NULL)`; INSERT `identity.credentials` with the scrypt hash; INSERT `identity.user_roles … ON CONFLICT DO NOTHING`; INSERT audit `account.provisioned` with `{via:'service', caller, ip, sourcePlatform, role, emailVerified, idempotencyKey}`.
9. Lost-race handling: pg `23505` → the same cached **409** (so a concurrent duplicate is still a clean conflict, not a 500).

**201:**
```json
{ "user": { "id": "…", "email": "…", "displayName": "…", "role": "content_editor", "emailVerified": true } }
```
`role` is the **Jubilujah** RBAC role, not the JI enum that was sent.

**Errors:** 400, 401, 403, 409, 422, 429, 500. No signup OTP email is ever sent; the account is immediately usable via `/signin` when `emailVerified: true`.

**Verify-only mode (`verify: true`)** — branch at the top of the handler, before the 422 policy check, idempotency, and create logic (AUTH_API.md §12.4). Lets JI log in a JubileePraise-only user: hash+compare happens here (only holder of the credential), user returned on match, JI provisions its own record. **Never writes**: no rows, no audit insert (logger only), no idempotency read/write (the cache keys on `Idempotency-Key` alone — sharing it could replay a cached CREATE response), no lockout counters. One SQL: `users LEFT JOIN credentials LEFT JOIN user_roles` with `array_agg(role)`, filtered `email = $1 AND is_active = TRUE`.

- no row (unknown or inactive) → **404** `{ok:false, existed:false, verified:false}` — creates nothing.
- row but `locked_until` in the future → **401** `{ok:false, existed:true, verified:false}` (lockout *respected* without comparing, never set/extended here).
- row but no `credentials` row (SSO-only) or `verifyPassword` mismatch → same **401**.
- match → **200** `{ok:true, existed:true, verified:true, user:{id, email, displayName, active, emailVerified, roles, createdAt}}` — same `user` shape as check-email §9.8; `emailVerified` = `first_signin_completed`.

Responses are direct `res.status().json()` (spec-exact bodies, not the `HttpError` envelope). Caller keys only on `200 && verified===true && user` — everything else is "not verified" (fail-safe). 8–200 password policy and `Idempotency-Key` apply to create mode only.

#### 9.8 `GET /api/auth/admin/check-email` (`routes/service.js`)

Read-only pre-signup existence probe for partner portals (JubileeInspire's family-wide duplicate-account gate) — the inbound counterpart of `checkEmailOnJI` (§11.x / `services/jiSync.js:200`).

**Auth:** `requireServiceAuth` → `requireServiceScope(['admin.provision', 'admin.set_password'])` (any-of — deliberately **no new scope**, so existing partner tokens pass) → `validate(schema, 'query')`.

| Query param | Zod |
|---|---|
| `email` | `z.string().trim().email().max(254)` — validated from `req.query`, 400 shape identical to body validation |

Steps: lowercase the email; one SQL — `identity.users LEFT JOIN identity.user_roles` with `array_agg(role)`, filtered `email = $1 AND is_active = TRUE` (same **active-only** semantics as the signup gate `routes/auth.js:280`, so a deleted account frees the email family-wide); `logger.info 'service check-email'` with `{email, exists, caller}`. No audit row, no idempotency (read-only GET).

**200 (exists):** `{ email, exists: true, user: { id, email, displayName, active, emailVerified, roles, createdAt } }` — `emailVerified` maps to `first_signin_completed` (there is no `email_verified` column); `roles` are JubileePraise RBAC roles.
**200 (free):** `{ email, exists: false }`.
Partners key on the top-level boolean `exists` only; `email`/`user` are informational.

**Errors:** 400 (validation), 401 (bad/missing/**expired** token — never 403, so callers can refresh-and-retry), 403 (no qualifying scope / IP / non-HTTPS), 429.

---

### 10. Email service (`services/email.js`)

Transport is chosen at send time by `config.email.sendgridApiKey` (`SENDGRID_API_KEY`). Empty ⇒ **dev/log transport**: nothing is sent, the whole message (including the OTP code / reset URL in `text`) is logged at info with `'[email:dev] not sent (no SENDGRID_API_KEY)'`. Otherwise `@sendgrid/mail` is **lazily imported** (`await import`) so the API boots without the dependency, and the API key is set once (`sgReady` latch — note a hot-swapped key is not picked up).

All sends disable SendGrid click tracking, open tracking and subscription tracking (`services/email.js:46-50`) — specifically so the one-time reset token is not routed through SendGrid's `url####.jubileeinspire.com` redirector.

`send()` **re-throws** on SendGrid failure; callers decide. `/forgot-password` swallows it (anti-enumeration); `/signup`, `/signin` 5a and both resend endpoints do not.

Three auth templates share one table-based, inline-styled shell (`emailShell`, gold `#e8a23e` / ink `#1c1b18`, 560 px, hidden preheader):

| Function | Subject | Content |
|---|---|---|
| `sendLoginVerificationEmail({to, code})` | `Your JubileePraise.com sign-in code` | 6-digit code, "expires in 15 minutes" |
| `sendSignupVerificationEmail({to, code})` | `Verify your email for JubileePraise.com` | 6-digit code, "expires in 30 minutes" |
| `sendPasswordResetEmail({to, resetUrl})` | `Reset your JubileePraise.com password` | CTA button + plaintext fallback link, "expires in `config.email.resetTtlMinutes` minutes" |

From address: `config.email.from` = `EMAIL_FROM`, default `JubileePraise <no-reply@jubileepraise.com>`. (`sendSubscriptionEmail` also lives here but is billing, not auth.)

---

### 11. Consolidated error codes

| Code | Where it comes from |
|---|---|
| **200** | success; also anti-enumeration success on `/forgot-password`; also `GET /me` when unauthenticated |
| **201** | `/verify-signup`, `/admin/provision-user` |
| **400** | zod validation (`issues[]`); Turnstile failure; invalid/expired/used/wrong verification code (`attemptsRemaining`); invalid reset link |
| **401** | `Authentication required`; `Invalid email or password`; `Current password is incorrect.`; `Invalid or expired refresh token`; `invalid_client`; `Invalid or missing service token.` |
| **403** | `requireRole` denial; `invalid_scope`; non-HTTPS service call; missing service scope; IP not allow-listed |
| **404** | route not found; `/admin/set-password` unknown email |
| **409** | email already exists (local or JI); no password set on the account; `/admin/set-password` on an SSO-only account; `/admin/provision-user` duplicate; pg `23505` |
| **422** | service password-length policy; DOB invalid or age <13; pg `23514` |
| **423** | account locked — `/signin` gate and `/send-login-verification` resend cap (`{locked, lockedUntil}`); **note `error` is the generic `"error"`** |
| **429** | rate limiters (50/15 min IP for `/api/auth/*`; 600/15 min per client for service routes); OTP attempt cap; resend cooldown (`cooldownSeconds`); signup resend exhaustion (`exhausted:true`) |
| **500** | unhandled — including **JI upstream unreachable** in `ji` mode (`auth_upstream_unreachable` is a plain `Error`) |
| **502** | JI returned an unexpected 2xx shape, or a `success:false` at a 2xx status |
| **503** | `/api/auth/service/token` when `SERVICE_JWT_SECRET` is unset |

---

### 12. `docs/AUTH_API.md` — accuracy assessment

The file is at `W:\JubileePraise.com\app\api\docs\AUTH_API.md` (**not** `/w/JubileePraise.com/docs`, which has no auth doc). It is **substantially stale** — the server-to-server half (§11–§12) is still accurate, but the entire user-facing half describes an architecture that no longer exists.

#### Wrong / obsolete

| § | Doc claims | Reality |
|---|---|---|
| §1, §2, §9 | Opaque server-side session in a `jv_session` **HttpOnly cookie**; `jv_csrf` double-submit; `403 CSRF token missing or invalid`; "one session, two carriers" | **No cookies anywhere.** No `cookie-parser` use, no `middleware/csrf.js` (the file does not exist), no `Set-Cookie` in any auth route. `index.js:108-109` states plainly there is no CSRF guard because auth is pure Bearer. The entire "CSRF" column of both summary tables is fiction. |
| §1 | "identical **12-hour** lifetime (`SESSION_TTL_HOURS`)" | Access token is **1 h** (`ACCESS_TOKEN_TTL_MS`); `SESSION_TTL_HOURS` is not read anywhere. |
| §9.6 | "The Bearer value is the raw `jv_session` token — **not a JWT**"; read it from `Set-Cookie`; Swift/Kotlin sketches parsing `Set-Cookie` | The Bearer value is the 2-part HMAC token returned in the JSON body as `tokens.accessToken`. All of §9.6's mobile guidance, both code sketches, and the "Gotchas" list are wrong end to end. |
| §3.2, §4.1, §4.2 | Success bodies are `{ "user": { … } }` only | Every one of them also returns `tokens: {accessToken, refreshToken, expiresAt}`. `/signin` additionally returns `success` and `trustToken`. |
| §5.2, §6 | `reset-password` / `change-password` return `{ "ok": true }` | Both also return `jiSync: {…}`. |
| §3.1 | `/signup` errors are only 409 (local) / 400 | Omits the **JI `check-email` pre-signup gate** entirely (added in commit `362a843`) — a 409 can now come from JubileeInspire, not the local DB. |
| §4.1 | Describes only the local password check | Omits `AUTH_LOGIN_MODE=ji` completely: no mention of JI delegation, the JI-shaped `user` payload, `trustToken`, `selfHealJiLogin`, or the 500/502 failure modes. **This is the production path.** |
| §2, §8 | `POST /api/auth/logout` requires a session | It requires none; it takes an optional `refreshToken` in the body. |
| §2, §10 | No mention of `POST /api/auth/refresh` | The endpoint exists and is central to the Bearer model. |
| §10 | `403` = "CSRF token missing/invalid" | 403 now only means role denial or a service-auth failure. |
| §11.6 / §12 | "revokes all sessions" | Accurate in effect, but the mechanism is refresh-token revocation, not `identity.sessions` (that table is dead). |
| footer | "Last verified … and `middleware/csrf.js` (Bearer carrier added 2026-06-17)" | `middleware/csrf.js` no longer exists. |

#### Still accurate

- §11 and §12 in full: the client-credentials HS256 JWT flow, `SERVICE_CLIENTS` format, per-route scopes (`admin.set_password` / `admin.provision`), fail-closed on an unset `SERVICE_JWT_SECRET`, the optional IP allow-list, TLS assertion via `x-forwarded-proto`, 24 h `Idempotency-Key` replay, the JI→JubileePraise role mapping table, the ≥13 age gate, DOB validated-but-not-stored, and every status code in §11.3 / §12.2.
- All OTP/lockout numbers: 30 min signup code, 15 min login code, 5 attempts, 60 s resend cooldown, 2 resends → 3 codes, 1 h lockout, 60 min reset TTL.
- Field-level validation rules for every public endpoint (name 1–120, email ≤254, password 8–200, 6-digit codes, UUID GUIDs, token 20–200).
- The 256 KB body cap and the 50 req / 15 min `/api/auth/*` IP limiter.
- The error envelope `{error, message}` + `issues[]` on 400, and the extra fields `attemptsRemaining` / `cooldownSeconds` / `lockedUntil`.
- The anti-enumeration guarantee on `/forgot-password` and the generic 401 on `/signin`.

**Bottom line:** treat §11–§12 as current and §1–§10 as describing a retired cookie/session architecture. Anyone integrating a web or mobile client from this doc will build against `jv_session` + CSRF and fail immediately.


---

## 6. Catalog, Content & Editorial Pipeline

**Base:** `app/api/src` (Express 4, ESM, Node). All routers are plain `express.Router()` composed in `src/index.js`.

**Global middleware order** (`src/index.js:44-138`), applied before any route below:

| Order | Middleware | Notes |
|---|---|---|
| 1 | `pino-http` | `x-request-id` or `crypto.randomUUID()` as `req.id` |
| 2 | `helmet()` | |
| 3 | `cors()` | Whitelist `config.corsOrigins`; no-Origin (curl/server-to-server) always allowed (`index.js:57-62`) |
| 4 | `express.json({ limit: '256kb' })` | **Content-type-gated** — only parses `application/json`, so image/audio raw bodies fall through untouched |
| 5 | `attachSession` | Sets `req.auth = { user, roles }` from `Authorization: Bearer <token>`, or `null`. **Never throws** — unauthenticated requests proceed with `req.auth === null` (`middleware/session.js:7-14`) |
| 6 | `writeLimiter` (on most mounts) | 120 req/60s per IP, `skip` on GET/HEAD (`index.js:80-83`) |

**Auth model.** The token is *not* a standard JWT — it is JubileeInspire's hand-rolled `base64url(JSON).base64url(HMAC-SHA256)` 2-part token (`config.js:53-62`). Roles are privilege-ordered:

```
ROLE_ORDER = ['viewer', 'reviewer', 'content_editor', 'executive', 'admin']   // config.js:189
```

`requireRole(min)` compares **max index** of the caller's roles against `ROLE_ORDER.indexOf(min)` (`middleware/rbac.js:11-40`). It throws `401 Authentication required` when `req.auth` is null, `403 Requires role: <min> or higher` otherwise. Note the consequence: `reviewer` (index 1) satisfies nothing above itself, and **`executive` (3) automatically satisfies `content_editor` (2)** — so any executive can read the pipeline, and any admin can do everything.

**Error envelope** (`middleware/error.js:12-34`). `HttpError(status, message, extra)` → `{ error: CODE, message, ...extra }`. Code map: `400→error`, `401→unauthorized`, `403→forbidden`, `404→not_found`, `409→conflict`, `422→unprocessable`, `429→error`, `503→unavailable`. Bare Postgres errors are translated: `23505 → 409 {error:'conflict', message:'Duplicate resource'}`, `23514 → 422 {error:'unprocessable', detail:<constraint>}`. Everything else → `500 {error:'internal'}`. Unrouted paths → `404 {error:'not_found', message:'No route for <METHOD> <path>'}`.

`ah()` (`util/async.js:2`) is the one-liner that funnels rejected handler promises into `next()` so `HttpError`s thrown inside async handlers reach the error handler. Handlers **not** wrapped in `ah` (e.g. `catalog.js:25`, `catalog.js:29`) are synchronous by construction.

---

### The catalog-manifest.json model

#### What it is

`catalog-manifest.json` is the **authoritative browse source** for the entire public catalog. It is not derived from Postgres — it is generated by scanning the `J:/music/albums` studio drive folder tree, and Postgres `catalog.*` is a parallel (importer-fed) representation that the catalog read path never touches.

**Location:** `config.manifestPath` (`config.js:175-177`):
- Default: `<repo>/app/web/public/music/catalog-manifest.json` — i.e. the API reads the **web app's public directory**.
- Override: `MANIFEST_PATH`, resolved relative to `app/` (`path.resolve(__dirname,'..','..',MANIFEST_PATH)`).

Current file: 2.6 MB, `totalArtists: 33`, `totalAlbums: 982`, `totalPlayableAlbums: 411`, `totalPlayableTracks: 5150`, `generated: "2026-07-07T22:35:43.217Z"`.

**Shape:**

```jsonc
{
  "generated": "ISO8601", "totalArtists": 33, "totalAlbums": 982,
  "totalPlayableAlbums": 411, "totalPlayableTracks": 5150,
  "categories": [{
    "key": "inspire", "label": "Inspire Family",
    "artists": [{
      "slug": "amir-inspire", "name": "Amir Inspire", "role": "Middle Eastern Worship",
      "albums": [{
        "code": "AMIM1001EN",
        "title": "Frankincense and Glory",
        "folder": "AMIM1001EN-bridge-across-faiths",
        "path": "albums/inspire/amir-inspire/AMIM1001EN-bridge-across-faiths",
        "playable": 12, "trackCount": 12,
        "tracks": [{ "n": 1, "title": "…", "file": "01 ….mp3",
                     "url": "albums/…/tracks/01 ….mp3", "audio": true }]
      }]
    }]
  }]
}
```

#### Two caches, two views

`manifest.js` maintains **two independent mtime-keyed caches**:

| Export | Cache vars | View |
|---|---|---|
| `getManifest()` (`manifest.js:161-175`) | `cache` / `mtimeMs` | **Sanitized** — public + mobile |
| `getFullManifest()` (`manifest.js:181-195`) | `fullCache` / `fullMtimeMs` | **Raw** — admin CMS only |

Both do `fs.statSync(config.manifestPath)` **on every call** and rebuild only when `stat.mtimeMs` differs from the cached value. This is synchronous file I/O on the request path for every catalog read — cheap (a stat), but it means the manifest **hot-reloads within one request** of the file changing on disk. No TTL, no explicit invalidation API.

**Failure mode:** on `statSync`/`JSON.parse` failure it logs `'Failed to load catalog manifest'` and, only if no cache exists yet, installs an **empty** manifest (`build({categories:[], totalAlbums:0})`, `manifest.js:172`). An existing cache survives a transient read failure — the catalog goes stale, never dark.

**Warming:** `index.js:147` fires `import('./manifest.js').then(m => m.getManifest())` inside the `app.listen` callback, so the first real request doesn't pay the 2.6 MB parse. `getFullManifest()` is *not* warmed — the first `/api/admin/mobile/*` call pays it.

#### sanitize() — the public/mobile view

`sanitize(raw)` (`manifest.js:64-94`) mutates the freshly-parsed object in three passes:

1. **Artist exclusion.** Drops every artist whose `slug` is in `EXCLUDED_ARTISTS` (`manifest.js:31-43`) — 21 slugs: `gabriel-inspire`, the collaborative projects (`kingdom-pulse`, `radiant-stones`), 6 faith-based "Other Artists", 9 general "Family Friendly" artists, and 2 Romanian/nations artists. Rationale in-file: the manifest is folder-scan-generated, so a plain rebuild would re-add them; filtering at the API layer is the durable removal. Source data on J: is untouched.
2. **Children merge.** Albums under category keys `party-giggles` and `tiny-tiggles` (`CHILD_CATEGORY_KEYS`, `manifest.js:62`) are collected flat.
3. **Rebuild.** Non-children categories that still have ≥1 artist are kept; empty ones are dropped entirely (this is what silently removes faith-based/general/nations/christmas once their artists are excluded). Then a **single synthetic category** is appended: `{ key:'children', label:'Children Music', artists:[{ slug:'children-music', name:'Children Music', role:'Children Music', albums:[…all child albums…] }] }`.

The 12 Inspire Family personas are enumerated in `PERSONA_SLUGS` (`manifest.js:47-51`); `personaImage(slug)` (`manifest.js:54-58`) returns `${cdnBase}/personas/<Firstname>.png` (first hyphen segment, capitalized) for those slugs and `null` for everything else — so the synthetic `children-music` artist and all non-personas have `image: null`.

#### build() — the four indices

`build(raw)` (`manifest.js:96-143`) walks categories→artists→albums→tracks once and returns `{ raw, byCategory, byArtist, byAlbumCode, byAlbumId, bySongId }`:

| Index | Key | Value |
|---|---|---|
| `byCategory` | `category.key` | raw category node |
| `byArtist` | `artist.slug` | artist + `categoryKey`, `categoryLabel` |
| `byAlbumCode` | **`code.toUpperCase()`** | album + `artistSlug`, `artistName`, `categoryKey`, `categoryLabel` |
| `byAlbumId` | `albumUuid(code)` | summary `{id, code, title, artist, artistSlug, cover:'/cover/CODE.png', status, trackCount}` |
| `bySongId` | `songUuid(code, n)` | playable `{id, code, n, title, album, artist, artistSlug, cover, url}` |

`byAlbumId`/`bySongId` exist for the likes/favorites path where only a UUID is in hand.

#### Relationship to the DB

The catalog read path touches **zero DB tables**. Postgres holds only *overlays* keyed off manifest-derived identifiers:

| Overlay | Table | Keyed by |
|---|---|---|
| Hidden albums/songs | `production.music_album_state`, `production.music_song_state` | `album_code` / `song_id` |
| Cover cache-bust | `production.cover_updates` | `album_code` (PK, TEXT) |
| Pipeline | `production.pipeline_state`, `production.pipeline_history` | `(rateable_type, rateable_id UUID)` |
| Publications | `production.publications` | `(rateable_type, rateable_id, version)` |
| Awards | `production.award_categories/periods/nominations/awards` | UUIDs |
| Radio | `radio.stations/programs/playlists/playlist_items/schedules` | UUIDs |

`radio.playlist_items.song_id` is a real **FK to `catalog.songs(id)`** (`0001_init.sql`, `ON DELETE RESTRICT`) — so radio playlists depend on the *importer-populated* `catalog.songs`, **not** on the manifest. This is the one place where the two identity worlds must agree; they only do because `app/db/ids.js`, `api/src/ids.js`, and `web/lib/ids.ts` all derive UUIDs from the same v5 namespace.

#### Sidecar files

Both live **beside** the manifest (`path.dirname(config.manifestPath)`) and use the same mtime-cache pattern:

| File | Module | Purpose |
|---|---|---|
| `cover-versions.json` | `util/coverVersions.js` | `{ generated, versions: { CODE: n } }` — the `?v=` cache-bust map. **Written by the API** on every cover upload; read by both API and web |
| `album-covers.json` | `util/albumCovers.js` | `{ generated, cdn, count, covers: [CODE…] }` — flat set of codes with a *confirmed-on-CDN* cover. Generated offline by `app/web/scripts/gen-album-covers.mjs`, which HEAD-probes `<CDN>/music/<path>/artwork/<CODE>.png` at concurrency 24 / 8s timeout. Currently `count: 508` |

`albumCovers.hasCover()` is used server-side only by `services/heroRotation.js:35` — an album is hero-eligible when `playable > 0 && hasCover(code)`.

---

### Album / song identity model

#### Album `code`

The primary key of the whole content universe. Format (from real data): 4-letter artist prefix + 4-digit sequence + 2-letter language — `AMIM1001EN`, `AMIM1034RO`, `IMIM1015EN`.

- Always **normalized to uppercase** at every boundary: `byAlbumCode` keys (`manifest.js:108`), `getAlbumByCode` (`manifest.js:258`), `tracksDir` (`tracks.js:24`), `musicVisibility` sets (`services/musicVisibility.js:31`), `coverVersion` lookup (`util/coverVersions.js:28`), `hasCover` (`util/albumCovers.js:28`).
- Validated as `/^[A-Z0-9]+$/` on the two write paths: cover upload (`admin.js:201`) and publish (`publish.js:60`). Deliberately loose — no length or structure check.

#### Artist `slug`

Lowercase kebab (`amir-inspire`). **Case-sensitive** at lookup — `getArtist(slug)` does a raw `byArtist.get(slug)` with no normalization (`manifest.js:263`), unlike album codes. `GET /api/artists/Amir-Inspire` 404s.

#### Path derivation → CDN

`album.path` (from the manifest, relative) is the single hinge:

```
album.path = "albums/inspire/amir-inspire/AMIM1001EN-bridge-across-faiths"
album.folder = "AMIM1001EN-bridge-across-faiths"        // tail only
```

| Artifact | Construction | Example |
|---|---|---|
| **Audio (CDN)** | `${config.cdnBase}/music/${track.url}` (`manifest.js:136`, `manifest.js:237`) | `https://cdn.jubileeverse.com/music/albums/inspire/amir-inspire/AMIM1001EN-bridge-across-faiths/tracks/01 Frankincense and Glory.mp3` |
| **Cover (R2 key)** | `music/${album.path}/artwork/${code}.png` (`admin.js:212`) | `music/albums/inspire/amir-inspire/AMIM1001EN-…/artwork/AMIM1001EN.png` |
| **Cover (CDN url)** | `${cdnBase}/${key}?v=${version}` (`admin.js:242`) | `https://cdn.jubileeverse.com/music/albums/…/artwork/AMIM1001EN.png?v=2` |
| **Cover (relative)** | `/cover/${code}.png` (`manifest.js:121`,`135`) → Next route | resolved by `app/web/app/cover/[code]/route.ts` |
| **Audio (J: studio)** | `${J_ROOT}/${album.path}/tracks/` (`tracks.js:25`) | `J:/music/albums/inspire/amir-inspire/AMIM1001EN-…/tracks/` |

Because the R2 bucket root maps to the CDN host root, **object key === URL path** (`config.js:158-166`).

The Next `/cover/[code]` route (`web/app/cover/[code]/route.ts`) is a CDN-first **proxy**, not a redirect (Next's image optimizer rejects cross-origin redirects, `route.ts:8-9`): it fetches the CDN URL with a 5s abort, streams the body through with `Cache-Control: public, max-age=31536000, immutable`, and falls back to reading `J:/music/<path>/artwork/<CODE>.png` off disk. A per-`code+?v=` availability memo with a 10-minute TTL (`route.ts:18-19`) avoids re-probing known-missing covers. The `?v=` is version-keyed into the memo (`ck = code + bust`, `route.ts:38`) so a new version isn't masked by a prior negative result.

#### Deterministic UUIDs

`src/ids.js` — UUID v5, namespace `f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f`, **identical across `app/db/ids.js`, `api/src/ids.js`, `web/lib/ids.ts`**:

```js
albumUuid(code)  = uuidv5('album:'  + CODE.toUpperCase(),        NS)
songUuid(code,n) = uuidv5('song:'   + CODE.toUpperCase() + ':' + n, NS)
artistUuid(slug) = uuidv5('artist:' + slug.toLowerCase(),        NS)
isUuid(s)        = /^[0-9a-f]{8}-[0-9a-f]{4}-…$/i
```

This is what lets a manifest-only album be rated, nominated, pipelined, and published without ever existing in `catalog.albums`. `pipeline_state.rateable_id`, `nominations.rateable_id`, and `publications.rateable_id` are all **unconstrained UUID columns** — no FK — precisely so the manifest-derived id is accepted.

#### Cover versioning applied selectively

`withCoverVersion(url, code)` (`manifest.js:9-12`) appends `?v=<n>` (or `&v=` if a query already exists). It is applied by **`getSongById` and `getAlbumById` only** (`manifest.js:151`, `manifest.js:158`). `decorateAlbum()` — the shape returned by `GET /api/albums/:code` and `GET /api/album` — **has no `cover` field at all**, so the public album endpoint never emits a cover URL; the web computes it itself via `lib/covers.ts#coverFor`.

`coverFor(code, path)` (`web/lib/covers.ts:62-65`) picks the direct CDN URL when `hasCover(code)`, else the `/cover/CODE.png` proxy — both `withVersion()`-wrapped.

---

#### Public catalog — `routes/catalog.js`

Mounted `app.use('/api', catalogRouter)` (`index.js:113`) — **no rate limiter, no auth middleware.** Every route is public; auth is read opportunistically from `req.auth` when present.

`canSeeHidden(req)` (`catalog.js:20-23`) returns true iff `req.auth.roles` includes `'admin'` **or** `'reviewer'`. This is a **literal membership test, not `hasRole`** — so a bare `content_editor` or `executive` sees the *public* (hidden-filtered) view, even though they outrank `reviewer` in `ROLE_ORDER`. Deliberate: hidden-album visibility is an orthogonal capability.

| # | Method + Path | Auth | Params |
|---|---|---|---|
| 1 | `GET /api/categories` | public | — |
| 2 | `GET /api/artists` | public | `?category=<key>` |
| 3 | `GET /api/artists/:slug` | public (elevated ⇒ unfiltered) | `slug` (case-sensitive) |
| 4 | `GET /api/albums/:code` | public (elevated ⇒ unfiltered) | `code` (case-insensitive) |
| 5 | `GET /api/album` | public | `?code=` **or** `?path=` |
| 6 | `GET /api/status-counts` | public | `?scope=` |
| 7 | `GET /api/cdn-probe` | public | `?url=` |

**1. `GET /api/categories`** (`catalog.js:25-27`) → `listCategories()` (`manifest.js:197-205`). Synchronous, no `ah`. Returns the sanitized category list:

```json
[{ "key":"inspire", "label":"Inspire Family", "artistCount":12, "albumCount":410 }]
```

`albumCount` is a per-request `reduce` over all artists. **No hidden-album filtering** — a hidden album still inflates `albumCount`.

**2. `GET /api/artists`** (`catalog.js:29-32`) → `listArtists(category)` (`manifest.js:207-225`). `?category` is used only if `typeof === 'string'` (array query params like `?category=a&category=b` are silently ignored → returns all). Filters by `c.key === categoryKey`; unknown key → `[]`, not 404.

```json
[{ "slug":"amir-inspire", "name":"Amir Inspire", "role":"Middle Eastern Worship",
   "category":"inspire", "image":"https://cdn.jubileeverse.com/personas/Amir.png",
   "albumCount":42, "playableAlbums":18 }]
```

`image` is `null` for every non-persona. `playableAlbums` counts albums with `playable > 0`. **No hidden filtering here either** — counts include hidden albums.

**3. `GET /api/artists/:slug`** (`catalog.js:34-42`). `getArtist(slug)` → `404 {error:'not_found', message:'Artist not found'}` if unknown. If `!canSeeHidden`, awaits `hiddenSets()` and filters `artist.albums` by `!albumCodes.has(code.toUpperCase())` (`catalog.js:39`).

```json
{ "slug":"amir-inspire", "name":"…", "role":"…", "category":"inspire",
  "categoryLabel":"Inspire Family", "image":"…/personas/Amir.png",
  "albums":[{ "id":"<albumUuid>", "code":"AMIM1001EN", "title":"…",
              "playable":12, "trackCount":12, "status":"ready" }] }
```

`status` is `"ready"` when `playable > 0`, else `"studio"` (`manifest.js:278`).

⚠️ `getArtist` returns a **freshly-constructed object each call** (`manifest.js:265-280`), so the `artist.albums = …filter(…)` mutation at `catalog.js:39` does not corrupt the shared cache. Contrast with `getAlbumByCode`, which also builds fresh via `decorateAlbum`.

**4. `GET /api/albums/:code`** (`catalog.js:44-49`). `getAlbumByCode` uppercases. Not found → `404 Album not found`. If `!canSeeHidden && await isAlbumHidden(code)` → **also `404 Album not found`** (indistinguishable from nonexistent, by design). Returns `decorateAlbum()`:

```json
{ "id":"<albumUuid>", "code":"AMIM1001EN", "title":"Frankincense and Glory",
  "folder":"AMIM1001EN-bridge-across-faiths",
  "path":"albums/inspire/amir-inspire/AMIM1001EN-bridge-across-faiths",
  "artistSlug":"amir-inspire", "artistName":"Amir Inspire",
  "category":"inspire", "categoryLabel":"Inspire Family",
  "playable":12, "trackCount":12, "status":"ready",
  "tracks":[{ "id":"<songUuid>", "n":1, "title":"…", "file":"01 ….mp3",
              "audio":true, "url":"https://cdn.jubileeverse.com/music/albums/…/01 ….mp3" }] }
```

`url` is `null` when `t.url` is falsy. Note the raw `album.path` and `folder` are exposed publicly — internal J:/R2 layout is not secret here.

**5. `GET /api/album`** — legacy alias (`catalog.js:52-72`). Branches:
- `?code=` → same as #4.
- `?path=` → **linear scan** of `m.byAlbumCode.values()` matching `album.path && relPath.endsWith(album.folder)` (`catalog.js:63-64`). Note the guard tests `album.path` but the comparison uses `album.folder` — the *tail*, so `?path=anything/AMIM1001EN-bridge-across-faiths` matches. O(n) over 982 albums, first match wins. On match, re-resolves via `getAlbumByCode(album.code)`. No match → `404 Album not found for path`.
- Neither → `400 {error:'error', message:'code or path query param required'}`.

**6. `GET /api/status-counts`** (`catalog.js:74-77`) → `statusCounts(scope)` (`manifest.js:284-303`). `scope` defaults `'all'`. Accepted forms: `all`, `family` (→ `c.key === 'inspire'`), `children`, `category:<key>`, `artist:<slug>`.

```json
{ "scope":"all", "ready":{"albums":411,"songs":5150}, "studio":{"albums":571,"songs":N} }
```

Ready songs accumulate `al.playable`; studio songs accumulate `al.trackCount`.

⚠️ **`scope=children` is dead.** `manifest.js:291` tests `c.key === 'party-giggles' || c.key === 'tiny-tiggles'`, but `sanitize()` (`manifest.js:62-91`) has already merged both into a single `key:'children'` category and dropped the originals. `scope=children` returns all-zeros; the working form is `scope=category:children`.

Also: `scope=artist:<slug>` works because `artistInScope` ORs the artist test onto `inScope` (`manifest.js:294`), but any *unrecognized* scope string yields all-zeros rather than a 400.

**7. `GET /api/cdn-probe`** (`catalog.js:80-89`). Ported from the legacy site. `?url` **must** start with `config.cdnBase` (`https://cdn.jubileeverse.com`) or → `400 url must be a CDN URL`. This is a **prefix check only**, so it is the SSRF guard; it holds because `cdnBase` is a fixed https origin. Issues a `fetch(url, {method:'HEAD'})` with **no timeout**.

- Success → `200 { url, ok, status, contentType }`
- Network failure → **`200`** `{ url, ok:false, status:0, error: err.message }` (caught, not raised)

#### Hidden-album enforcement — `services/musicVisibility.js`

Backs `canSeeHidden` filtering.

- Loads two sets: `SELECT album_code FROM production.music_album_state WHERE visibility='hidden'` and `SELECT song_id FROM production.music_song_state WHERE visibility='hidden'` (`musicVisibility.js:26-29`).
- **30-second TTL** (`TTL_MS`, line 19) plus single-flight dedupe via `inflight` (line 45) so a burst of concurrent requests issues one pair of queries.
- **Fails open** — on any DB error it logs `'music visibility load failed — failing open'`, installs empty sets, and stamps `loadedAt` (`musicVisibility.js:35-39`), so a DB blip *reveals* hidden albums for up to 30s rather than blanking the catalog.
- `invalidateVisibilityCache()` is exported for the Manage Music admin routes to call after a visibility change.
- Only `visibility='hidden'` is suppressed. `'draft'`/studio albums are **deliberately not touched** here — studio gating is the web layer's reviewer check.

---

#### Radio — `routes/radio.js`

Mounted `app.use('/api', writeLimiter, radioRouter)` (`index.js:126`) — so paths are `/api/stations`, `/api/programs`, `/api/playlists`, **not** `/api/radio/*`.

| # | Method + Path | Auth | Body/Params |
|---|---|---|---|
| 1 | `GET /api/stations` | **public** | — |
| 2 | `GET /api/programs` | **public** | — |
| 3 | `GET /api/playlists` | **public** | — |
| 4 | `GET /api/playlists/:id` | **public** | `id` UUID |
| 5 | `POST /api/playlists` | `executive` | `{name, description?, program_id?}` |
| 6 | `PATCH /api/playlists/:id/items` | `executive` | `{items:[{song_id, transition?}]}` |

**1. `GET /api/stations`** (`radio.js:12-18`). `SELECT id, call_sign, display_name, description, frequency, genre_anchors, is_active FROM radio.stations ORDER BY frequency`. No pagination, no `is_active` filter — inactive stations are returned. The table models the 101 HM-band stations: `frequency NUMERIC(6,2) UNIQUE CHECK (300.00–399.90)`, `call_sign TEXT UNIQUE` (e.g. `'HM 305.30'`), `genre_anchors TEXT[]`. Columns **not** exposed: `persona_affinity UUID[]`, `avg_rating`, `rating_count`, timestamps.

**2. `GET /api/programs`** (`radio.js:20-29`). LEFT JOINs `radio.stations` to add `call_sign`; `ORDER BY p.name`. Returns `{id, name, description, station_id, call_sign, schedule_cron, duration_min, is_active}`. Not exposed: `host_artist_id` (FK → `catalog.artists`), ratings.

**3. `GET /api/playlists`** (`radio.js:31-41`). LEFT JOIN + `COUNT(pi.id)::int AS item_count`, `GROUP BY pl.id`, `ORDER BY pl.created_at DESC`. Unbounded — no LIMIT.

**4. `GET /api/playlists/:id`** (`radio.js:43-56`). `isUuid` guard → `400 invalid playlist id`. `SELECT *` on the playlist (so this one *does* leak `avg_rating`/`rating_count`) → `404 playlist not found`. Then items **INNER JOIN `catalog.songs`** for `song_title`, ordered by `position`. Response `{...playlist, items:[{id, song_id, position, transition, song_title}]}`.

⚠️ The INNER JOIN means an item whose `song_id` is missing from `catalog.songs` silently vanishes from the response — though the `ON DELETE RESTRICT` FK makes that hard to reach.

**5. `POST /api/playlists`** (`radio.js:58-71`). `requireRole('executive')` → 401/403. Zod (`validate`, body): `name` trimmed 1–200, `description` ≤2000 optional, `program_id` uuid optional. Failure → `400 {error:'error', message:'Validation failed', issues:[{path, message}]}`. Inserts with `created_by = req.auth.user.id`, `RETURNING *` → **`201`**.

⚠️ `program_id` existence is **not verified**; a bad UUID hits the FK → Postgres `23503`, which the error handler does *not* map → `500 internal`.

**6. `PATCH /api/playlists/:id/items`** (`radio.js:74-94`). Full **replace** semantics. Zod: `items` array ≤500 of `{song_id: uuid, transition?: 'crossfade'|'hard_cut'|'sweeper'}`. `isUuid(id)` → 400.

Steps: `DELETE FROM radio.playlist_items WHERE playlist_id=$1`, then a sequential `INSERT` loop assigning `position = 0,1,2…` (`radio.js:84-91`). Returns `{playlist_id, item_count}`.

⚠️ **Not transactional** (`radio.js:84-92`) — unlike `pipeline.js` and `admin.js` which use `withTransaction`. A mid-loop failure (bad `song_id` → FK `23503` → 500) leaves the playlist **partially emptied**, with the surviving prefix at positions 0..k. The playlist id is also never validated to exist: PATCHing a nonexistent playlist deletes nothing, inserts nothing, and cheerfully returns `200 {item_count: 0}`.

Also note the DB's `UNIQUE (playlist_id, position)` is satisfied only because the DELETE precedes the loop.

#### Radio playlists vs. user playlists

Two entirely separate systems:

| | **Radio playlists** | **User playlists** |
|---|---|---|
| Table | `radio.playlists` + `radio.playlist_items` | `production.user_playlists` + items |
| Route | `/api/playlists` (`routes/radio.js`) | `/api/me/playlists` (`routes/me.js`) |
| Mount | `app.use('/api', …)` `index.js:126` | `app.use('/api/me', …)` `index.js:127` |
| Auth | GET public; write `requireRole('executive')` | `router.use(requireAuth)` — **any authenticated user**, `me.js:17` |
| Ownership | `created_by` (informational; no ownership check on PATCH) | `owner_user_id`, enforced per-request |
| Broadcast fields | `program_id` → `radio.programs`; `transition` per item | none |
| Scheduling | `radio.schedules` binds a daypart window to a program **or** playlist (`CHECK ((program_id IS NOT NULL)::int + (playlist_id IS NOT NULL)::int = 1)`) | n/a |
| Purpose | §12 station programming — editorial broadcast content | personal saved collections |

**Structural hierarchy:** `stations` (101 HM-band channels, frequency-unique) → `programs` (named shows, optional `host_artist_id`, `schedule_cron`, `duration_min`) → `playlists` (ordered song collections, standalone or `program_id`-attached) → `playlist_items` (position + transition). `radio.schedules` cross-cuts: per-station daypart (`morning|midday|evening|overnight`), optional `day_of_week` 0–6, `start_minute`/`end_minute` as minutes-of-day with `CHECK (end_minute > start_minute)`.

**No API surface exists for `radio.schedules`, `radio.stations` writes, or `radio.programs` writes** — those are seed/DB-managed only.

---

#### Editorial pipeline — `routes/pipeline.js`

Mounted `app.use('/api/pipeline', writeLimiter, pipelineRouter)` (`index.js:125`).

##### The state machine

10 stages, defined **twice** — as a JS array (`pipeline.js:13-16`) and as the Postgres enum `production.pipeline_stage` (`0001_init.sql`). Order is documented as significant:

| # | Stage | Meaning (per DDL comments) |
|---|---|---|
| 1 | `concept` | Song idea captured; no lyrics yet |
| 2 | `lyrics_drafting` | Lyrics being composed |
| 3 | `lyrics_approved` | Lyrics finalized; ready for generation |
| 4 | `song_generation` | Audio being generated via Suno.com |
| 5 | `qa_review` | Generated audio under QA review (Tahoma) |
| 6 | `engineering` | Mix / master / cleanup pass |
| 7 | `sunil_approval` | Final asset verified before publish |
| 8 | `final_approval` | Stewardship sign-off; ready for release |
| 9 | `published` | Live on cdn.jubileeverse.com |
| 10 | `distributed` | Submitted to streaming distribution partners |

**Legal transitions: ALL of them.** Despite the DDL's "Order in this ENUM is significant" and "stage progression checks compare positions in this list", **no ordering check is implemented** (`pipeline.js:47-84`). Any stage → any stage, including `distributed` → `concept` and same-stage self-transitions (which still append a history row and reset `entered_stage_at`). The only constraint is enum membership, enforced by `z.enum(STAGES)`. Backwards transitions are *explicitly* supported by the schema — `from_stage` is recorded "so backwards transitions are explicit and reportable" (`0001_init.sql` comment on `pipeline_history`).

`rateable_type` is restricted to `song|album` at three levels: the route (`pipeline.js:49`), the `pipeline_state` CHECK, and the `pipeline_history` CHECK — even though the `production.rateable_type` enum also carries `artist|playlist|program`.

##### Who can transition

The file header comment (`pipeline.js:9-10`) says *"transitions require production_manager"* — **stale**. Migration `0017_executive_role_and_names.sql` collapsed `radio_producer` + `production_manager` into the single `executive` role (granting `executive` to every legacy holder, deleting the old rows, and rewriting the CHECK to the final five-role set). The code requires `executive` (`pipeline.js:47`).

| Operation | Required role | Effective (via `ROLE_ORDER`) |
|---|---|---|
| Read board / counts | `content_editor` | content_editor, executive, admin |
| Read history | `content_editor` | content_editor, executive, admin |
| Transition | `executive` | executive, admin |

`viewer` and `reviewer` get `403` on everything.

##### Endpoints

**`GET /api/pipeline`** — `requireRole('content_editor')` (`pipeline.js:18-41`).

Query: `?stage=<stage>`, validated against `STAGES` → `400 invalid stage`. Runs **two** queries:
1. `SELECT ps.rateable_type, ps.rateable_id, ps.current_stage, ps.assignee_user_id, ps.entered_stage_at, ps.updated_at FROM production.pipeline_state ps [WHERE ps.current_stage = $1] ORDER BY ps.updated_at DESC LIMIT 1000`
2. `SELECT current_stage, COUNT(*)::int AS n FROM production.pipeline_state GROUP BY current_stage`

Response: `{ items: [...], counts: { concept: 12, qa_review: 3, … } }`. **The counts are always global** — they ignore the `?stage` filter (query 2 has no WHERE). Intentional for dashboards, but easy to misread. Hard `LIMIT 1000` with **no pagination and no offset**; past 1000 rows in a stage, the tail is unreachable. `items` carries raw UUIDs only — no title/artist resolution and no join to `identity.users` for the assignee.

**`POST /api/pipeline/:type/:id/transition`** — `requireRole('executive')` (`pipeline.js:47-84`).

Params: `type ∈ {song, album}` → `400 type must be song or album`; `id` must pass `isUuid` → `400 id must be a UUID`. Body (Zod): `to_stage` ∈ STAGES (required), `note` ≤2000 optional. Zod failure → `400 Validation failed` + `issues[]`.

Handler runs inside `withTransaction` (`pipeline.js:53`) — so state + history commit atomically, satisfying the DDL's contract that "every mutation that touches the catalog runs inside the same transaction as its pipeline_history entry":

1. `SELECT current_stage FROM production.pipeline_state WHERE rateable_type=$1 AND rateable_id=$2` → `fromStage` or `null`.
2. **Upsert-by-branch:** if a row exists, `UPDATE … SET current_stage=$1, entered_stage_at=NOW()`; else `INSERT … (rateable_type, rateable_id, current_stage)`. *(Note: `pipeline_state.updated_at` is not set here — it relies on the `production.touch_updated_at()` trigger.)*
3. `INSERT INTO production.pipeline_history (rateable_type, rateable_id, from_stage, to_stage, actor_user_id, note)` with `actor_user_id = req.auth.user.id`.

Response `200 { rateable_type, rateable_id, from_stage, to_stage }` — `from_stage` is `null` on first entry.

⚠️ Read-modify-write with no row lock (`SELECT` then `UPDATE`, no `FOR UPDATE`). Two concurrent transitions can both read the same `fromStage`, producing two history rows claiming the same origin. The `UNIQUE (rateable_type, rateable_id)` on `pipeline_state` prevents duplicate state rows (a racing double-INSERT → `23505` → 409), but the history can still misreport.

⚠️ `rateable_id` is **never validated to reference anything** — no FK, no manifest check. A random UUID creates a pipeline row for a nonexistent object.

**`GET /api/pipeline/:type/:id/history`** — `requireRole('content_editor')` (`pipeline.js:87-99`).

Validates `id` via `isUuid` → `400 id must be a UUID`. ⚠️ **Does not validate `type`** (unlike the transition route). `type` is bound to a `production.rateable_type` enum column, so `artist`/`playlist`/`program` are accepted and simply return `[]`; a value outside the enum (e.g. `foo`) → Postgres `22P02` invalid input value → unmapped → **`500 internal`**.

`SELECT h.from_stage, h.to_stage, h.note, h.occurred_at, u.display_name AS actor FROM production.pipeline_history h JOIN identity.users u ON u.id = h.actor_user_id WHERE … ORDER BY h.occurred_at DESC`. No LIMIT. INNER JOIN on users — but `actor_user_id` is `NOT NULL REFERENCES identity.users(id)` with no `ON DELETE`, so rows can't be orphaned.

##### Audit integrity

`production.pipeline_history` is **append-only at the privilege level**: `REVOKE DELETE, TRUNCATE ON production.pipeline_history FROM PUBLIC` (`0001_init.sql`). Same treatment for `identity.audit_log` (`REVOKE DELETE`). Indices: `idx_pipeline_history_target (rateable_type, rateable_id, occurred_at DESC)`, `idx_pipeline_history_actor`.

##### Second write path into the pipeline

`POST /api/admin/publish/:type/:id` (`routes/admin.js:285-331`, **admin-only**) also drives the state machine. Inside one transaction it computes `version = COALESCE(MAX(version),0)+1` from `production.publications`, derives `cdn_path = catalog/<type>s/<id>.json` and `content_hash = sha256("<type>:<id>:<version>")` (note: hashed from *identifiers*, not content — `admin.js:298`), inserts the publication row, and — for `song`/`album` only — force-sets `pipeline_state.current_stage = 'published'` with a history row noted `'admin publish'` (`admin.js:305-326`). `type ∈ {song, album, playlist, program}`. Response `{rateable_type, rateable_id, published:true, cdn_base, version, cdn_path, content_hash}`. The DDL notes R2 is overwrite-in-place, so `publications` is the version trail. **No actual CDN write happens here** — that is the separate `/api/admin/publish` orchestrator below.

---

#### Awards — `routes/awards.js`

Mounted `app.use('/api/awards', writeLimiter, awardsRouter)` (`index.js:124`).

##### Model (§11, `production.*`)

```
award_categories ──1:N──> award_periods ──1:N──> nominations
                                       └──1:N──> awards
```

| Table | Key columns / constraints |
|---|---|
| `award_categories` | `name TEXT UNIQUE`, `description`, `rateable_type CHECK IN ('song','album')`, `active BOOLEAN DEFAULT TRUE` |
| `award_periods` | `category_id FK`, `year INTEGER CHECK 2020–2100`, `opens_at`, `closes_at`, `status CHECK IN ('open','closed','awarded') DEFAULT 'open'`, `UNIQUE (category_id, year)`, `CHECK (closes_at > opens_at)` |
| `nominations` | `period_id FK`, `rateable_type CHECK IN ('song','album')`, `rateable_id UUID` (no FK), `nominator_id FK users`, `reason TEXT`, `CONSTRAINT reason_min_length CHECK (length(trim(reason)) >= 250)`, `UNIQUE (period_id, rateable_type, rateable_id, nominator_id)` |
| `awards` | `period_id`, `rateable_type`, `rateable_id`, `award_type CHECK IN ('winner','honorable_mention') DEFAULT 'winner'`, `citation`, `awarded_by FK users`, `UNIQUE (period_id, rateable_type, rateable_id, award_type)` |

⚠️ **`production.awards` has no API surface at all** — winners are DB-managed. There is also no endpoint to create/edit categories or periods.

| # | Method + Path | Auth |
|---|---|---|
| 1 | `GET /api/awards/categories` | **public** |
| 2 | `GET /api/awards/periods/:year` | **public** |
| 3 | `POST /api/awards/nominations` | `content_editor` |
| 4 | `GET /api/awards/nominations` | **public** |

**1. `GET /api/awards/categories`** (`awards.js:11-20`). `?active=true` (**exact string match**, `awards.js:12` — `?active=1` or `?active=TRUE` do nothing) appends `WHERE active = TRUE`. `ORDER BY name`. Returns `[{id, name, description, rateable_type, active}]`.

**2. `GET /api/awards/periods/:year`** (`awards.js:22-35`). `Number(req.params.year)` must be `Number.isInteger` → `400 year must be an integer`. ⚠️ The check is integer-ness only, not the DB's 2020–2100 range, and `Number("2026.0")` passes. JOINs categories:

```json
[{ "id":"…", "category_id":"…", "category_name":"Song of the Year",
   "category_description":"…", "rateable_type":"song",
   "year":2026, "opens_at":"…", "closes_at":"…", "status":"open" }]
```

Unknown year → `[]`, not 404.

**3. `POST /api/awards/nominations`** — `requireRole('content_editor')` (`awards.js:39-72`).

Notably this route **does not use `validate()`/Zod** — it hand-rolls parsing and accepts **aliased field names** (`awards.js:41-43`):

| Field | Accepted as | Validation |
|---|---|---|
| `period_id` | `period_id` | `isUuid` → `400 period_id required (uuid)` |
| type | `rateable_type` **or** `type` | ∈ `{song, album}` → `400 rateable_type must be song or album` |
| id | `rateable_id` **or** `id` | `isUuid` → `400 rateable_id required (uuid)` |
| `reason` | `reason` | `trim().length >= 250` |

**The 250-character justification rule is defense-in-depth** — enforced in JS *and* by the `reason_min_length` CHECK (comment at `awards.js:37-38`). The JS rejection is a rich `422`:

```json
{ "error":"unprocessable", "message":"Justification too short",
  "current_length": 137, "required_length": 250 }
```

…with an inner `message` field in `extra` reading `"Justification must be at least 250 characters (after trim). Current: 137. Add 113 more."`. ⚠️ Because `extra` is spread **after** `message` in the error handler (`middleware/error.js:19-23`), the `extra.message` **overwrites** the outer `"Justification too short"`. The client sees only the detailed sentence. There is no upper bound on `reason`.

Then `SELECT id FROM production.award_periods WHERE id=$1` → `404 period not found`. ⚠️ `period.status` and the `opens_at`/`closes_at` window are **not checked** — nominations are accepted against `closed` and `awarded` periods.

INSERT `RETURNING *` → `201` with the full row. Duplicate `(period_id, rateable_type, rateable_id, nominator_id)` → `23505`, caught locally (`awards.js:69`) → **`409 You already nominated this object for this period`** (a more specific message than the generic handler's "Duplicate resource"). Note the unique key includes `nominator_id`, so *different* editors may each nominate the same object.

**4. `GET /api/awards/nominations`** (`awards.js:74-94`). **Public** — anyone can read every nomination and its author's display name. Filters, all optional and AND-combined: `?period=<year>` (→ `p.year`, note the param is named `period` but filters by *year*), `?category=<uuid>`, `?type=song|album`, `?id=<uuid>`. `ORDER BY n.created_at DESC`, **no LIMIT**.

```json
[{ "id":"…", "period_id":"…", "category_id":"…", "rateable_type":"song",
   "rateable_id":"…", "nominator_id":"…", "nominator_name":"Jane Doe",
   "reason":"…", "created_at":"…" }]
```

⚠️ All four filters are passed straight to Postgres with no shape validation (`awards.js:79-82`) — parameterized, so no injection, but `?category=abc` → `22P02` → **`500`**, and `?period=abc` → `Number("abc")` = `NaN` → `500`.

---

#### Cover art upload pipeline

Lives in `routes/admin.js` (not one of the listed files, but it is the whole cover pipeline). Mounted `app.use('/api/admin', writeLimiter, adminRouter)` (`index.js:138`), and `adminRouter` applies `router.use(requireRole('admin'))` at `admin.js:23`. **Every cover endpoint is admin-only.**

Mount ordering matters (`index.js:120,134-138`): `/api/admin/reviews`, `/api/admin/music`, `/api/admin/mobile`, `/api/admin/publish`, `/api/admin/tracks` are all mounted **before** the generic `/api/admin` router so their routes win.

##### `POST /api/admin/covers/:code`

`admin.js:199-243`. Middleware chain: `requireRole('admin')` → `raw({ type: COVER_TYPES, limit: '10mb' })` → handler.

**Accepted content types** (`COVER_TYPES`, `admin.js:198`): `image/png`, `image/jpeg`, `image/jpg`, `image/webp`. **Size limit: 10 MB.** The global `express.json({limit:'256kb'})` is bypassed because its type gate doesn't match an image content-type (comment at `admin.js:196-197`).

Steps:

1. Normalize `code`: uppercase, strip a trailing `.PNG` (`admin.js:200`) — so both `/covers/ABC123` and `/covers/ABC123.png` work.
2. `/^[A-Z0-9]+$/` → `400 invalid album code`.
3. `getAlbumByCode(code)`; missing album **or missing `album.path`** → `404 unknown album`.
4. `r2Configured()` → `503 Cover upload is not activated yet — R2 credentials are not set on the server.` **Fail-closed**: requires all four of `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (`util/r2.js:9-12`).
5. Body must be a non-empty `Buffer` → `400 no image data (send the file as the raw body with an image content-type)`. *(If the content-type doesn't match `COVER_TYPES`, `raw()` never populates the body, so a wrong type lands here as a 400 before the 415 below.)*
6. Re-read content-type, split off `;charset=…`, re-check against `COVER_TYPES` → **`415 unsupported image type`**.
7. **R2 PUT.** Key: `` `music/${album.path}/artwork/${code}.png` `` (`admin.js:212`). Note the key is **always `.png`** regardless of the uploaded type — "R2 ignores the source type for the key; we store the bytes as-is with the right content-type" (`admin.js:210-211`). A JPEG uploaded for `ABC` is stored at `…/ABC.png` with `Content-Type: image/jpeg`. `r2Put` (`util/r2.js:27-35`) sends `PutObjectCommand` with `CacheControl: 'public, max-age=31536000, immutable'`. The S3 client is built lazily with `region: 'auto'` (`util/r2.js:14-23`). No `forcePathStyle`, no checksum, no versioning — R2 is overwrite-in-place.
8. **Version bump.** Upsert into `production.cover_updates` (`admin.js:215-223`):
   ```sql
   INSERT INTO production.cover_updates
     (album_code, version, content_type, bytes, updated_by, synced_to_j, updated_at, synced_at)
   VALUES ($1, 1, $2, $3, $4, FALSE, NOW(), NULL)
   ON CONFLICT (album_code) DO UPDATE
     SET version = cover_updates.version + 1, content_type = $2, bytes = $3,
         updated_by = $4, synced_to_j = FALSE, updated_at = NOW(), synced_at = NULL
   RETURNING version
   ```
   First upload → `version = 1`; each replacement increments. Re-uploading always resets `synced_to_j = FALSE` and `synced_at = NULL`.
9. **`rewriteCoverVersions()`** (`util/coverVersions.js:12-18`) — `SELECT album_code, version FROM production.cover_updates` (**full table scan, every upload**) and `fs.writeFileSync` the whole map to `<manifestDir>/cover-versions.json` as `{ generated: ISO, versions: { CODE: n } }`. This file is the shared contract: the API reads it via `coverVersion()` and the web reads it via `lib/covers.ts#coverVersion`, both mtime-cached.
10. **ISR revalidation** (`admin.js:229-234`). Only when `config.revalidate.secret` (`REVALIDATE_SECRET`) is set: `POST ${WEB_INTERNAL_URL}/revalidate?secret=…` with `AbortSignal.timeout(5000)`, **best-effort** (bare `catch {}` — a failure never fails the upload). The Next handler (`web/app/revalidate/route.ts`) checks the secret (`401 unauthorized` on mismatch **or when the env var is unset**) and calls `revalidatePath('/', 'layout')` — nuking the cache for *every* route under the root layout, not just the affected album. Returns `{ok:true, revalidated:true, at}`.
11. **Audit.** `INSERT INTO identity.audit_log (actor_user_id, action='cover.update', target_type='album', target_id=<code>, payload={version, bytes})`, `.catch(() => {})` — audit failure is swallowed (`admin.js:236-240`).

Response `200`:
```json
{ "ok": true, "code": "AMIM1001EN", "version": 2,
  "url": "https://cdn.jubileeverse.com/music/albums/…/artwork/AMIM1001EN.png?v=2" }
```

⚠️ **Not atomic.** The R2 PUT happens before the DB write; if the DB or `writeFileSync` fails, R2 holds the new bytes while `cover-versions.json` still points at the old `?v=`, and the immutable 1-year CDN cache keeps serving the stale image indefinitely. There is no rollback and no compensating delete.

##### Why versioning exists

Covers are served with `Cache-Control: public, max-age=31536000, immutable` at three layers — the R2 object (`util/r2.js:33`), the Cloudflare edge, and the Next `/cover` proxy (`route.ts:24`). Overwriting the R2 object therefore does **not** propagate. The `?v=<n>` query is the only cache-buster: it changes the URL, which busts browser + edge + `next/image` optimizer caches, and the `/cover` route forwards it upstream so the origin fetch bypasses the stale edge copy (`route.ts:33-36,41`).

##### `GET /api/admin/covers/pending-sync`

`admin.js:247-258`, admin-only. `SELECT album_code, version, content_type, bytes, updated_at FROM production.cover_updates WHERE synced_to_j = FALSE ORDER BY updated_at` — served by the partial index `idx_cover_updates_pending`. Each row is decorated from the manifest with `path` and the R2 `key`:

```json
{ "pending": [{ "album_code":"AMIM1001EN", "version":2, "content_type":"image/png",
  "bytes":482913, "updated_at":"…",
  "path":"albums/inspire/amir-inspire/AMIM1001EN-…",
  "key":"music/albums/…/artwork/AMIM1001EN.png" }] }
```

`path`/`key` are `null` when the code is absent from the (sanitized) manifest — e.g. an album belonging to an `EXCLUDED_ARTISTS` artist. Consumed by a studio-side script that copies covers back to J: so the studio drive and the CDN don't diverge.

##### `POST /api/admin/covers/:code/mark-synced`

`admin.js:259-263`, admin-only. `UPDATE production.cover_updates SET synced_to_j = TRUE, synced_at = NOW() WHERE album_code = $1`. Uppercases the code. **No existence check** — a nonexistent code updates 0 rows and still returns `200 {ok:true, code}`. No body, no audit entry.

---

#### Track (audio) upload — `routes/tracks.js`

Mounted `app.use('/api/admin/tracks', writeLimiter, tracksRouter)` (`index.js:137`); `router.use(requireRole('admin'))` at `tracks.js:16`. **All three endpoints admin-only.**

These write to the **J: studio drive, not R2**. Uploaded tracks land on J: and go live only later via `/api/admin/publish` (header comment, `tracks.js:9-14`).

**Environment gate.** `J_ROOT = process.env.ARTWORK_BASE || 'J:/music'` (`tracks.js:18`) — note it reuses `ARTWORK_BASE`, the same var the web's `/cover` route uses. `jAvailable()` is `fs.existsSync(`${J_ROOT}/albums`)` in a try/catch (`tracks.js:19`) — checked **per request**, so a remounted drive is picked up without a restart. On the prod server (no J:) these degrade rather than error.

**Filename guard** — `safeName(n)` (`tracks.js:21`), all four must hold:
- `/\.mp3$/i` — must end `.mp3`
- `!/[/\\]/` — no forward or back slashes
- `!n.includes('..')` — no traversal
- `n.length <= 200`

`tracksDir(code)` (`tracks.js:23-26`) uppercases the code, resolves via the **sanitized** manifest, and returns `` `${J_ROOT}/${album.path}/tracks` `` — or `null` if the album is unknown *or* has no `path`. Because it uses `getAlbumByCode` (sanitized), **albums belonging to excluded artists are unreachable through this module**.

| # | Method + Path | Behavior when J: absent |
|---|---|---|
| 1 | `GET /api/admin/tracks/:code` | `200 {available:false, tracks:[]}` |
| 2 | `DELETE /api/admin/tracks/:code` | `400` |
| 3 | `POST /api/admin/tracks/:code` | `400` |

**1. `GET /api/admin/tracks/:code`** (`tracks.js:29-44`). Unknown album → `404 unknown album`. `fs.readdirSync(dir)`, filter `.mp3`, sort with `localeCompare(…, {numeric:true})` so `2 …` precedes `10 …`. Each entry is parsed against `/^(\d+)[ _-]+(.*)\.mp3$/i` to split leading track number from title; unparseable names get `n: null` and the whole basename as title. `sizeKB = Math.round(st.size/1024)`.

```json
{ "available": true, "code": "AMIM1001EN", "count": 12,
  "tracks": [{ "file":"01 Frankincense and Glory.mp3", "n":1,
               "title":"Frankincense and Glory", "sizeKB":8241 }] }
```

A missing `tracks/` directory is swallowed (`catch {}`, `tracks.js:42`) → `count: 0`.

**2. `DELETE /api/admin/tracks/:code`** (`tracks.js:47-57`). J: absent → `400 J: is not reachable here — use the studio machine.` Filename from `?file=` **or** `req.body.file`. `safeName` → `400 bad filename`. Missing file → `404 file not found`. `fs.unlinkSync` → `200 {ok:true, deleted:<file>}`. **No audit log entry** — unlike cover uploads and publish runs, track deletion is unrecorded.

**3. `POST /api/admin/tracks/:code`** (`tracks.js:61-72`). Middleware: `raw({ type: () => true, limit: '80mb' })`.

- **`type: () => true`** accepts **any** content-type. But the global `express.json` runs first (`index.js:75`) — so a client that sends an MP3 with `Content-Type: application/json` has it parsed as JSON, fails, and gets a JSON-parse `400` before reaching this route. Any other content-type (or none) falls through correctly.
- **80 MB limit** — vs. 10 MB for covers and 256 KB for JSON.
- Filename via `?name=`, `decodeURIComponent`'d (`tracks.js:65`), then `safeName` → `400 filename must be a .mp3 with no path separators`.
- Empty/non-Buffer body → `400 no audio data`.
- `fs.mkdirSync(dir, {recursive:true})` then `fs.writeFileSync(path.join(dir, name), buf)` — **overwrites silently** if the name already exists.

Response `200 {ok:true, file:<name>, bytes:<n>}`. **No audit entry.**

Minor: `tracks.js:5` imports `config` but never uses it.

---

#### Publish to Production — `routes/publish.js`

Mounted `app.use('/api/admin/publish', writeLimiter, publishRouter)` (`index.js:136`); `router.use(requireRole('admin'))` at `publish.js:20`.

**The "creative bridge"** (header comment, `publish.js:10-17`): the page lives on the public site, but J: is on the local network — so these endpoints only do real work when the API runs on the studio machine. On prod (no J:), `/candidates` reports `available:false` so the UI can guide the admin to open the page from localhost.

- `J_ROOT = process.env.ARTWORK_BASE || 'J:/music'` (`publish.js:21`)
- `ORCHESTRATOR = process.env.PUBLISH_SCRIPT || 'C:/jubileepraise-local/publish-to-production.js'` (`publish.js:22`)

**`GET /api/admin/publish/candidates`** (`publish.js:38-53`).

J: absent → `200 {available:false, candidates:[]}`.

⚠️ Reads the manifest **directly off disk** — `JSON.parse(fs.readFileSync(config.manifestPath))` (`publish.js:41`) — bypassing `manifest.js` entirely. Consequences: (a) it sees the **unsanitized** catalog, so excluded artists and un-merged children categories appear as publish candidates; (b) it pays a fresh 2.6 MB parse per call with no caching. Unreadable → `500 manifest unreadable`.

For every album with a `path`, compares:
- `j = jTrackCount(al.path)` — `readdirSync(`${J_ROOT}/${rel}/tracks`)`, filter `.mp3`, then count **distinct leading track numbers** via a Set (`publish.js:27-35`). This dedups Windows `" (1).mp3"` copies, matching the orchestrator's own logic — a dup shares its track number so the Set collapses it. Unreadable dir → `0`.
- `live = al.playable || 0` — what the manifest says is live on the CDN.

`j > live` ⇒ candidate. Sorted by artist then code.

```json
{ "available": true, "count": 3,
  "candidates": [{ "code":"AMIM1044EN", "title":"…", "artist":"Amir Inspire",
                   "jTracks":12, "live":0, "path":"albums/inspire/…" }] }
```

**`POST /api/admin/publish`** (`publish.js:57-90`).

J: absent → `400 The J: drive is not reachable here — open Publish to Production from the studio machine (localhost).`

Body: `{ codes: [...] }`. Each is uppercased and filtered by `/^[A-Z0-9]+$/` — **invalid codes are silently dropped**, not rejected. Empty result → `400 no album codes given`. `codes.length > 400` → `400 too many at once` (checked *after* filtering).

Then:

1. **Audit** — `INSERT INTO identity.audit_log (action='publish.run', target_type='album', target_id=codes[0], payload={codes})`, `.catch(()=>{})`. Note `target_id` is only the **first** code; the full list lives in `payload`.
2. **Spawn** `spawn('node', [ORCHESTRATOR, ...codes], { windowsHide: true })` (`publish.js:72`). Codes are passed as **argv, not a shell string** — no shell interpolation, and the `[A-Z0-9]` filter already precludes injection.
3. **NDJSON collection** — stdout is buffered and split on `\n`; each line is `JSON.parse`d into `steps`, falling back to `{raw: line}` on parse failure (`publish.js:74-81`). stderr is logged at `warn` level, truncated to 200 chars. Spawn error → pushes `{done:true, ok:false, error:'spawn failed: …'}`. On `close`, any trailing partial buffer is parsed and appended.
4. Resolves when the child closes.

Response: `{ ok: final.ok !== false, steps, codes }` where `final = steps[steps.length-1] || {}`. So **`ok` defaults to `true`** when the orchestrator emits nothing at all.

⚠️ **The request blocks for the orchestrator's entire runtime** with no timeout — and per `PUBLISH.md`, the orchestrator does rclone/R2 upload → manifest rebuild → site deploy, which for a large batch is minutes to hours. Any proxy or load-balancer idle timeout will sever the response while the child keeps running detached. There is also no concurrency guard: two admins can launch overlapping orchestrator processes against the same codes.

Per `PUBLISH.md`, the surrounding manual runbook is: **Step 0** rebuild the manifest (`node C:/jubileepraise-local/rebuild-manifest.js --apply` — a mandatory gate, since new J: albums do *not* auto-appear), re-derive `album-covers.json`/`album-genres.json`, `merge-genres-into-manifest.mjs`, and copy the results into `app/web/public/music/`; **Step 1** `r2-sync-music.js --apply` (diff-only upload, never deletes, `max-age=31536000, immutable` for media / `max-age=60` for catalog JSON); **Step 2** tar+ssh deploy + `pm2 restart jubileepraise`; **Step 3** verify 200s.

---

#### `util/sanitize.js` — review-text sanitization

Not used by any file in this subsystem (it serves §17 reviews, `routes/reviews.js`), but included for completeness.

Dependency-free by design (`sanitize.js:11`). `sanitizeText(input)` returns a trimmed plain-text string, or **`null`** for empty/blank input so optional fields collapse to SQL NULL.

Pipeline (`sanitize.js:28-39`), in order:

| Step | Regex | Purpose |
|---|---|---|
| 1 | `TAG_RE = /<\/?[a-zA-Z][^>]*>/g` | Strip complete HTML/XML tags. Requires an ASCII letter after `<` so `"I <3 this"` and `"a < b"` survive |
| 2 | `OPEN_TAG_RE = /<\/?[a-zA-Z][^<>]*$/` | Strip a trailing unterminated tag (truncated input) |
| 3 | `SCHEME_RE = /(?:javascript\|data\|vbscript)\s*:/gi` | Strip dangerous URI schemes that could execute if linkified downstream |
| 4 | `CONTROL_RE` = `[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]` | Strip C0/C1 controls, **keeping** tab, LF, CR |
| 5 | `/\r\n?/g → '\n'` | Normalize newlines |
| 6 | `/\n{3,}/g → '\n\n'` | Collapse blank-line runs |
| 7 | `.trim()` | |

It deliberately does **not** HTML-entity-encode (`sanitize.js:7-9`): the value is rendered as text (React escapes; nothing uses `dangerouslySetInnerHTML`), so encoding would surface a literal `&lt;` to readers. Note step 1 is a single non-recursive pass, which is safe for the stated plain-text threat model but would not be sufficient if the output were ever placed into an HTML context.

---

### Cross-cutting notes

**Rate limiting asymmetry.** `catalogRouter` is the only content router mounted **without** `writeLimiter` (`index.js:113` vs `124-138`). Since `writeLimiter` skips GET/HEAD anyway, the practical effect is nil for reads — but it means the catalog has *no* limiter at all, while every other mount caps writes at 120/min/IP.

**No pagination anywhere in this subsystem.** `GET /api/artists` (33 artists), `GET /api/playlists`, `GET /api/awards/nominations`, and `GET /api/pipeline/:type/:id/history` are all unbounded; `GET /api/pipeline` has a bare `LIMIT 1000` with no offset.

**Sync I/O on the request path.** Every catalog read does at least one `fs.statSync` (`manifest.js:163`), and `coverVersion()`/`hasCover()` each add another. `GET /api/admin/publish/candidates` and `GET /api/admin/tracks/:code` additionally do synchronous `readFileSync`/`readdirSync`/`statSync` per album. Fine at this scale on the studio machine; worth knowing.

**Two manifest read paths disagree.** `manifest.js` serves the *sanitized* view to public/mobile and the *raw* view to the admin CMS (`getFullManifest`, consumed only by `routes/mobileAdmin.js:69,545,552`). But `publish.js:41` parses the file itself and gets a *third*, uncached raw view. A code visible in publish candidates may be invisible to `/api/admin/tracks/:code` and `/api/admin/covers/:code`, both of which resolve through the sanitized `getAlbumByCode`.

**Audit coverage is uneven.** `cover.update` (`admin.js:236`) and `publish.run` (`publish.js:64`) write to `identity.audit_log`; both swallow their own failures with `.catch(()=>{})`. Track upload, track delete, and cover mark-synced write nothing. Pipeline transitions are audited separately and durably in `production.pipeline_history` (DELETE revoked).


---

## 7. Social & Engagement

Covers `routes/reviews.js`, `routes/reviewsAdmin.js`, `routes/ratings.js`, `routes/comments.js`, `routes/me.js`, and `services/notifications.js`.

### 0. Cross-cutting context

**Mounts** (`src/index.js:116-127`), all wrapped in `writeLimiter` (`index.js:80-83` — 120 req/min/IP, `skip` on `GET`/`HEAD`):

| Mount | Router | Note |
|---|---|---|
| `/api/ratings` | `ratings.js` | editorial |
| `/api/comments` | `comments.js` | editorial |
| `/api/admin/reviews` | `reviewsAdmin.js` | mounted **before** generic `/api/admin` so moderation routes win (`index.js:118-120`) |
| `/api/reviews` | `reviews.js` | public |
| `/api/me` | `me.js` | personal playlists + likes |

**Auth model.** `attachSession` (`middleware/session.js:7-14`) verifies a stateless `Authorization: Bearer <accessJWT>` — signature + iss/aud/exp only, **no DB hit, no cookie**. It is *non-fatal*: a missing/invalid token yields `req.auth = null`, which is what makes the public review reads guest-readable while still personalizing when a token is present.

**Role ladder** (`config.js:189`): `['viewer','reviewer','content_editor','executive','admin']`. `hasRole` takes the *max* index across the user's roles (`rbac.js:11-22`).

> ⚠️ **Gotcha:** `identity.user_roles` also permits `radio_producer` and `production_manager` (`0013_reviewer_role.sql`), and **neither is in `ROLE_ORDER`**. `roleLevel` returns `-1` for an unknown role, so a user holding *only* `radio_producer` fails even `requireRole('viewer')`. Only `requireAuth` is safe for them.

**Error envelope** (`middleware/error.js:12-34`): `{ error, message, ...extra }`. Status→code map: `400 error`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict`, `422 unprocessable`, `429 error`, `503 unavailable`. PG `23505`→409, `23514`→422; anything else →500 `internal`. `validate()` failures throw `HttpError(400,'Validation failed')` with `extra.issues = [{path, message}]` (`middleware/validate.js:8-13`).

**Sanitization** (`util/sanitize.js`) is applied **only in `reviews.js`** (review `title`/`body`, report `detail`). It is dependency-free and strips complete HTML tags, a trailing unterminated tag, `javascript:`/`data:`/`vbscript:` schemes, and C0/C1 control chars; normalizes CRLF; collapses 3+ newlines to 2; trims; **returns `null` for blank input** — that null-collapse is what makes "clear my review body" work through the upsert. It deliberately does *not* entity-encode. `comments.js` and `ratings.js` do **not** sanitize.

---

### 1. The polymorphic `:type/:id` addressing

There are **two different enums** in play, and conflating them is the single easiest mistake in this subsystem.

`production.rateable_type` (`0001_init.sql:53-59`) is one Postgres ENUM with five values: `song | album | artist | playlist | program`. Every polymorphic table stores `(type, uuid)` against it. There is **no FK** — integrity is enum-validated plus a trigger where the target table is known (`0001_init.sql:22-23`).

The routers then narrow it differently:

| Router | Accepted `type` | Guard |
|---|---|---|
| `ratings.js` | all 5: `song, album, artist, playlist, program` | `RATEABLE` set, `ratings.js:11-16` |
| `comments.js` | all 5 | `RATEABLE` set, `comments.js:12`, checked inline at `:31` and `:52` |
| `reviews.js` | **only `album`, `song`** | `TARGET` set, `reviews.js:23`; `checkTarget`, `:31-34` |
| `me.js` likes | **only `album`, `song`** | zod `z.enum`, `me.js:274`; inline array check on DELETE, `:289` |

`user_reviews`, `review_summaries`, and `user_likes` all additionally carry a **column-level `CHECK (target_type IN ('album','song'))`** on top of the wider enum (`0010_reviews.sql:70`, `:201`; `0011_likes.sql:11`), so the DB enforces the narrowing independently of the router.

**ID resolution.** `id` must pass `isUuid()` (`ids.js:12-13` — a strict 8-4-4-4-12 hex regex, case-insensitive). These are **not random UUIDs**: they are deterministic UUIDv5 over namespace `f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f` (`ids.js:5-9`):

- `albumUuid(code)` = `uuidv5('album:' + CODE.toUpperCase(), NS)`
- `songUuid(code, n)` = `uuidv5('song:' + CODE.toUpperCase() + ':' + n, NS)`
- `artistUuid(slug)` = `uuidv5('artist:' + slug.toLowerCase(), NS)`

The same scheme is duplicated in `app/db/ids.js` and `app/web/lib/ids.ts`, so a client can compute a target id **without a round-trip**. This is why the API never needs a lookup table to resolve `:id` — it just trusts the UUID shape and writes the row. A rating against a nonexistent album is structurally accepted; it simply never joins to anything.

Two consequences worth internalizing:

1. **Writes are not existence-checked** on the review/rating/comment path. The only endpoints that verify the target exists are the playlist item adds, which do `SELECT 1 FROM catalog.songs` (`me.js:169-170`, `:192`).
2. **Display names come from a different place than the id.** `reviewsAdmin.js:22-26` resolves titles by correlated subquery against `catalog.albums`/`catalog.songs`, which is only populated once `db/import-catalog.js` has run; otherwise `target_title` is `NULL` and the UI falls back to the UUID. Meanwhile `me.js` and `reviews.js:191` resolve through the **file-backed manifest** (`manifest.js`), not the DB. `me.js:106-116` even codifies this: manifest values win, DB titles are the fallback, `url` comes from the manifest because "the DB has no audio asset rows."

**Route-ordering discipline.** `reviews.js` is explicitly split into a "SPECIFIC ROUTES FIRST" block (`:106-108`) and a "GENERIC SINGLE-TARGET ROUTES (must be registered last)" block (`:356-358`). `GET /artist/:slug/summary` (`:191`) must precede `GET /:type/:id/summary` (`:378`) or every artist request would hit `checkTarget` and 400.

---

### 2. `/api/reviews` — public rating & review surface

Backed by the `production.user_reviews` family from `0010_reviews.sql`. **A rating and a review are the same row** (`reviews.js:19-20`, `0010_reviews.sql:14-18`): `stars` is required, `title`/`body` optional. `rating_count` counts all rows; `review_count` counts rows with a non-empty body.

Two module-level helpers shape everything:

- **`summariesFor(targets)`** (`reviews.js:54-67`) — one query that joins `production.review_summaries` against `unnest($1::text[], $2::uuid[])`, casting the text back to the enum (`t.tt::production.rateable_type`). This array-unnest-join pattern is how every batch endpoint avoids N+1.
- **`mineFor(userId, targets)`** (`reviews.js:70-93`) — the caller's own rows for those targets. Critically it filters only on `deleted_at IS NULL`, **not on `status`** (`:80`), so a user always sees their own hidden/rejected review in `mine` even though the public list excludes it.

#### 2.1 Batch & merged reads

##### `POST /api/reviews/summaries`
| | |
|---|---|
| **Auth** | None required; personalizes if `req.auth` present (`reviews.js:120`) |
| **Body** | `targets: [{type: 'album'\|'song', id: uuid}]`, `.min(1).max(200)` (`:112-117`) |
| **Behavior** | `Promise.all([summariesFor, mineFor])`, then builds an object keyed `"type:id"`, filling `EMPTY_SUMMARY` for targets with no cached row |
| **Response** | `{ summaries: { "album:<uuid>": { target_type, target_id, average, rating_count, review_count, distribution:{1..5}, mine } } }` |
| **Errors** | 400 validation |

`EMPTY_SUMMARY` (`:36-40`) returns `average: null`, all counts `0`, distribution all-zero — so the client never has to branch on "no data."

##### `POST /api/reviews/list`
| | |
|---|---|
| **Auth** | Optional |
| **Body** | `targets` (1–200), `sort?` ∈ `recent\|highest\|lowest\|helpful`, `page?` int ≥1, `limit?` int 1–50 (`:136-144`) |
| **Defaults** | `sort='recent'`, `page=1`, `limit=10` (`:147-149`) |
| **Response** | `{ items[], page, limit, total, has_more, sort }` |

This is the Reviews page's one query for "All Reviews" (album + every song), "Album Reviews" (album only), or a single song (`:133-135`). Two queries run: a `COUNT(*)` and the page. The `baseWhere` (`:158-159`) is the canonical public-visibility predicate, used verbatim by the single-target list too:

```sql
ur.deleted_at IS NULL AND ur.status = 'published'
  AND ur.body IS NOT NULL AND char_length(trim(ur.body)) > 0
```

So **star-only rows never appear in a review list** — they only move the summary. `mine` and `voted` are computed in-SQL against `$5` (the caller id, or `NULL` for guests), with `voted` guarded by `$5 IS NOT NULL AND EXISTS(...)` (`:172-174`).

`SORTS` (`reviews.js:24-29`) maps to raw ORDER BY fragments; interpolation is safe because the key is whitelisted before use (`:147`). Each maps to a partial index from `0010_reviews.sql:89-97`.

> **Note:** both batch endpoints are semantically reads but use `POST`, so they are **not** skipped by `writeLimiter` and consume the 120/min budget.

#### 2.2 Single-target reads

##### `GET /api/reviews/:type/:id/summary`
Auth optional. `checkTarget` → 400 `'target type must be album or song'` / `'target id must be a UUID'`. Returns the flat summary DTO plus `mine` (`:378-390`).

##### `GET /api/reviews/:type/:id`
Auth optional. Query: `sort` (whitelisted, default `recent`), `page` = `Math.max(1, parseInt||1)`, `limit` = `Math.min(50, Math.max(1, parseInt||10))` (`:396-398`) — note this clamps silently rather than 400-ing, unlike the zod-validated `POST /list`. Same `baseWhere`, same item DTO.

**Item DTO** (`reviewRowToDto`, `:360-375`):
```json
{ "id","target_type","target_id","stars","title","body","helpful_count","created_at",
  "edited": false,
  "author": { "display_name": "…"|"Anonymous", "avatar_url": null },
  "mine": false, "voted": false }
```
`edited` is derived as `updated_at > created_at` — which is reliable **only because** `user_reviews` deliberately has *no* generic touch trigger (`0010_reviews.sql:320-323`); the app sets `updated_at` solely on a genuine author edit, so moderation and helpful-count writes can't flip the flag. `author.display_name` falls back to `'Anonymous'`.

#### 2.3 Writes

##### `PUT /api/reviews/:type/:id` — upsert rating/review
| | |
|---|---|
| **Auth** | `requireAuth` (any authenticated user — 401 if absent) |
| **Body** | `stars: int 1–5` **required**; `title?: string ≤150 nullable`; `body?: string ≤5000 nullable` (`:433-437`) |
| **Tables** | `production.user_reviews` (+ trigger → `production.review_summaries`) |
| **Response** | `{ review: {id, stars, title, body, status, helpful_count, created_at, edited}, summary }` |

Handler: `checkTarget` → `sanitizeText(title)`, `sanitizeText(body)` → single `INSERT … ON CONFLICT (target_type, target_id, reviewer_user_id) DO UPDATE` (`:445-453`), then re-reads the summary. The conflict target is the `uq_user_reviews_one_per_target` unique constraint (`0010_reviews.sql:83-84`), which is what implements "one rating per user per target, latest replaces previous."

The `DO UPDATE` sets `stars, title, body, updated_at = NOW(), deleted_at = NULL` (`:449-450`).

> ⚠️ **`status` is not reset by the upsert** (`reviews.js:449-450`). If a moderator set the row to `hidden` or `rejected`, the author editing it leaves it hidden. Deliberate or not, it means edit-to-evade-moderation doesn't work — but it also means an author has no self-serve path back to `published`; only `POST /api/admin/reviews/:id/moderate` with `approve` can restore it.

> The `deleted_at = NULL` clause is the counterpart to the *partial* re-create story: the unique constraint is **not** partial (despite the comment at `0010_reviews.sql:81-82` claiming it is), so a soft-deleted row *does* occupy the slot; a re-rate resurrects that same row rather than inserting a new one. The behavior is correct; the comment is misleading.

##### `DELETE /api/reviews/:type/:id`
`requireAuth`. Soft-delete: `UPDATE … SET deleted_at = NOW() WHERE target_type/$1 AND target_id/$2 AND reviewer_user_id/$3 AND deleted_at IS NULL` (`:471-475`), then returns `{ deleted: true, summary }`.

> ⚠️ **No `rowCount` check** (`reviews.js:471-477`) — deleting a review you don't own, or one that doesn't exist, returns `200 {deleted:true}` with an unchanged summary. Harmless (the WHERE scopes to the caller) but not truthful.

The trigger `trg_user_review_summary` fires on the `deleted_at` update and recomputes the summary before the response reads it.

#### 2.4 Helpful votes (anti-abuse)

##### `POST /api/reviews/review/:reviewId/helpful` — toggle
| | |
|---|---|
| **Auth** | `requireAuth` |
| **Params** | `reviewId` must be UUID → else 400 `'invalid review id'` |
| **Tables** | `review_helpful_votes`, `user_reviews` (via trigger), `review_notifications` |
| **Response** | `{ voted: boolean, helpful_count: int }` |
| **Errors** | 400, 401, 404 `'review not found'` |

Runs in `withTransaction` (`:293-329`):
1. `SELECT id, reviewer_user_id, status, deleted_at` — 404 unless the row exists **and** `deleted_at` is null **and** `status === 'published'` (`:298-300`). You cannot vote on a hidden/rejected/deleted review.
2. `SELECT 1 FROM review_helpful_votes WHERE review_id AND user_id` — the dedupe probe.
3. Present → `DELETE`, `voted = false`. Absent → `INSERT`, `voted = true`.
4. On a new vote only, if `reviewer_user_id !== uid`, `notify(client, author, 'helpful_vote', reviewId, { by: displayName })` (`:319-322`).
5. Re-`COUNT(*)` the votes table and return that — not the denormalized column.

**Anti-abuse inventory — be precise here:**

| Mechanism | Present? | Where |
|---|---|---|
| One vote per user per review | ✅ Enforced structurally by `PRIMARY KEY (review_id, user_id)` (`0010_reviews.sql:119`), plus the app-level existence probe |
| Toggle (re-vote removes) | ✅ `reviews.js:306-312` |
| Vote on non-published review | ✅ Blocked, 404 (`:298`) |
| **Self-vote prevention** | ❌ **Not implemented.** A user *can* mark their own review helpful and it *does* increment `helpful_count`. Only the **notification** is suppressed for self-votes (`:319`) |
| Count integrity | ✅ `helpful_count` is trigger-maintained from a fresh `COUNT(*)` (`0010_reviews.sql:303-318`), so it self-heals |
| Summary churn from votes | ✅ Avoided — `trg_user_review_summary` lists `UPDATE OF stars, body, status, deleted_at, target_type, target_id`, deliberately excluding `helpful_count` (`0010_reviews.sql:292-298`) |

The self-vote gap is worth flagging: it inflates `helpful_count`, which is a **sort key** (`SORTS.helpful`), feeds `me/contributions.helpful_received`, and drives the admin `most_helpful_reviews` panel.

#### 2.5 Reporting

##### `POST /api/reviews/review/:reviewId/report`
| | |
|---|---|
| **Auth** | `requireAuth` |
| **Body** | `reason` ∈ `spam \| offensive_language \| hate_speech \| fake_review \| other` (required); `detail?: string ≤1000` (`:334-337`) |
| **Tables** | `production.review_reports` |
| **Response** | **`201`** `{ reported: true }` |
| **Errors** | 400, 401, 404 `'review not found'` |

Existence probe is `deleted_at IS NULL` only — you *can* report an already-hidden review. `detail` is passed through `sanitizeText` (`:351`).

Idempotency is done in SQL (`:345-352`): `ON CONFLICT (review_id, reporter_user_id) DO UPDATE SET reason, detail, status='open', created_at=NOW(), resolved_at=NULL, resolved_by=NULL`. So re-reporting **reopens** a previously dismissed report and re-timestamps it to the top of the moderator queue — one report slot per (review, reporter), reusable.

**A report never hides a review.** There is no auto-hide threshold anywhere in the codebase; the only status transitions come from `POST /api/admin/reviews/:id/moderate` (`0010_reviews.sql:147-148`).

#### 2.6 Profile endpoints

##### `GET /api/reviews/me/contributions` — `requireAuth`
Single aggregate over `user_reviews WHERE reviewer_user_id = $1 AND deleted_at IS NULL` (`:221-231`). Returns `{ albums_rated, songs_rated, reviews_written, total_contributions, helpful_received }`. Note it is **status-agnostic** — hidden/rejected rows still count toward your totals.

##### `GET /api/reviews/me/reviews` — `requireAuth`
All the caller's non-deleted rows, any status, `ORDER BY created_at DESC LIMIT 200` (hard cap, no pagination) (`:236-253`). Returns an array (not an envelope) of `{id, target_type, target_id, stars, title, body, status, helpful_count, created_at, edited}`. Returning `status` here is what lets the profile UI show "your review was hidden."

#### 2.7 Review notifications

##### `GET /api/reviews/notifications` — `requireAuth`
`SELECT id, kind, review_id, data, read_at, created_at FROM production.review_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100` (`:258-263`). Returns `{ items, unread }` where `unread` is computed **in JS over the fetched page** (`:265`) — so with >100 unread it saturates at 100.

##### `POST /api/reviews/notifications/read` — `requireAuth`
Body `{ ids?: uuid[] }`, `.max(100)`, optional (`:269`). With ids → `UPDATE … WHERE user_id AND id = ANY($2) AND read_at IS NULL`. Without (or empty array) → mark **all** the caller's unread as read (`:272-283`). Always `{ ok: true }`. Both branches scope on `user_id`, so passing someone else's notification id is a silent no-op.

---

### 3. `/api/admin/reviews` — moderation & analytics

`router.use(requireRole('admin'))` at `reviewsAdmin.js:19` — **every** route is admin-gated. `executive` (index 3) is *not* sufficient.

#### 3.1 Moderation queue

##### `GET /api/admin/reviews`
| | |
|---|---|
| **Query** | `status` (any value, or `all`→no filter), `target_type` ∈ `album\|song`, `reported=true`, `q` (substring), `include_deleted=true`, `page`, `limit` (1–100, default 25) |
| **Tables** | `user_reviews` ⋈ `identity.users` ⋈ aggregated `review_reports` |

The WHERE is assembled dynamically (`:47-58`). The first condition is the deleted-row toggle expressed as a SQL boolean rather than a JS branch:

```js
const conds = ['ur.deleted_at IS NULL OR $1::boolean'];
const params = [req.query.include_deleted === 'true'];
```
and it is parenthesized on join (`:58`) so the `OR` doesn't swallow the later `AND`s. `q` searches `ur.title ILIKE` OR `ur.body ILIKE` OR `u.display_name ILIKE` — all three reuse the *same* placeholder `$${p}` (`:52`).

`reported=true` swaps a `LEFT JOIN` for an inner `JOIN` against the open-report count subquery (`:54-56`) — that single flip is the entire "reported-only" filter. Ordering is `COALESCE(rep.n,0) DESC, ur.created_at DESC` (`:81`): **most-reported first**, which makes the default listing double as the triage queue.

Response: `{ items, page, limit, total, has_more }`. Each item carries `author_id/author_name/author_email`, `open_reports`, `deleted_at`, and `target_title` from `TARGET_TITLE_SQL`.

> ⚠️ **`status` is unvalidated** (`reviewsAdmin.js:39`, used at `:50`). `?status=bogus` reaches Postgres as a comparison against `production.review_status` and raises `22P02 invalid input value for enum` — which `errorHandler` does **not** map, so it surfaces as **500 `internal`**, not 400. `target_type` and `reported` *are* whitelisted (`:40-41`); `status` was missed.

##### `GET /api/admin/reviews/reports`
Open reports only, `LIMIT 200`, `ORDER BY rr.created_at DESC` (`:93-108`). Four-way join: `review_reports` ⋈ reporter ⋈ `user_reviews` ⋈ author, so one row gives the moderator the reason, the reporter, the full review text, and the author without follow-ups. Response `{ items }`.

##### `GET /api/admin/reviews/:id/history`
`review_moderation_log` for one review, `LEFT JOIN identity.users` for `moderator_name` (LEFT because `moderator_user_id` is `ON DELETE SET NULL`). `ORDER BY created_at DESC`, unbounded. 400 on non-UUID. Returns `{ items }` — an unknown id yields `{ items: [] }`, not 404.

#### 3.2 The moderation action

##### `POST /api/admin/reviews/:id/moderate`
| | |
|---|---|
| **Body** | `action` ∈ `approve\|reject\|hide\|restore\|delete` (required); `reason?: string ≤1000` (`:127-130`) |
| **Response** | `{ id, action, status }` |
| **Errors** | 400, 401, 403, 404 `'review not found'` |

The whole state machine is the `ACTIONS` table (`reviewsAdmin.js:29-35`):

| action | → status | notify kind | resolves reports as | `deleted_at` |
|---|---|---|---|---|
| `approve` | `published` | `review_approved` | `dismissed` | untouched |
| `restore` | `published` | `review_approved` | `dismissed` | **cleared to NULL** |
| `reject` | `rejected` | `review_rejected` | `actioned` | untouched |
| `hide` | `hidden` | `review_removed` | `actioned` | untouched |
| `delete` | *(unchanged)* | `review_removed` | `actioned` | **set to NOW()** |

`approve` vs `restore` is the meaningful pair: both publish, but only `restore` un-deletes. `delete` is a **soft** delete that leaves `status` alone — hence `newStatus = spec.status || prevStatus` (`:156`).

All five steps run in one `withTransaction` (`:138-189`):
1. `SELECT` current row → 404 if missing; capture `prevStatus`.
2. Build the `SET` list from the spec and `UPDATE user_reviews` (skipped entirely if `sets` is empty).
3. `UPDATE review_reports SET status = spec.resolve, resolved_at = NOW(), resolved_by = modId WHERE review_id = $1 AND status = 'open'` — **every** open report on the review resolves in one shot.
4. `INSERT INTO production.review_moderation_log (review_id, moderator_user_id, action, reason, prev_status, new_status)` — append-only; `review_id` is intentionally **not a FK** so the trail survives a hard delete (`0010_reviews.sql:153-154`), and `DELETE, TRUNCATE` are revoked from `PUBLIC` (`:169`).
5. `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)` with `action = 'review.' + action`, `target_type = 'review'` — the global audit mirror (§17).
6. `INSERT INTO production.review_notifications` for the author with the spec's `notify` kind and `data = { action, reason }`.

Because the review UPDATE and the summary trigger share the transaction, the aggregate and the moderation log commit atomically.

> **Design note:** this is the *only* code path that writes `user_reviews.status`. Reviews are **publish-on-submit** — `status` defaults to `'published'` (`0010_reviews.sql:77`) and nothing sets `'pending'`. `pending` exists in the enum reserved for a future pre-moderation / AI-moderation flow "without a schema change" (`0010_reviews.sql:32-33`). Moderation is therefore **post-hoc and reactive**, driven by the report queue.

#### 3.3 Analytics

##### `GET /api/admin/reviews/analytics`
Eight independent queries, **run sequentially** (each `await`ed — no `Promise.all`), returning:

| Key | Source | Shape |
|---|---|---|
| `highest_rated_albums` | `review_summaries` where `target_type='album' AND rating_count>0`, `ORDER BY avg_stars DESC NULLS LAST, rating_count DESC LIMIT 10` | `{target_id, avg_stars, rating_count, review_count, title}` |
| `highest_rated_songs` | same for `song` | idem |
| `most_reviewed_albums` | `review_count>0`, `ORDER BY review_count DESC LIMIT 10` | idem |
| `most_reviewed_songs` | same for `song` | idem |
| `most_active_reviewers` | `user_reviews ⋈ users`, `deleted_at IS NULL`, group by user, `ORDER BY contributions DESC LIMIT 10` | `{id, display_name, contributions, reviews}` |
| `platform` | `AVG(stars)` over `deleted_at IS NULL AND status='published'` | `{average, total_ratings, total_reviews}` |
| `over_time` | `date_trunc('day')` over last **90 days**, `deleted_at IS NULL` (no status filter) | `[{day:'YYYY-MM-DD', ratings, reviews}]` |
| `most_helpful_reviews` | `helpful_count > 0`, published, `ORDER BY helpful_count DESC LIMIT 10` | `{id, target_type, target_id, stars, title, helpful_count, author_name, target_title}` |

`average` is coerced `Number(...)` in JS because `pg` returns `NUMERIC` as a string (`:267`) — the same coercion appears in `summaryRowToDto` (`reviews.js:46`) and the artist rollup (`:211`). The top-N queries lean on `idx_review_summaries_album_top`/`_song_top` (`0010_reviews.sql:214-219`).

> Note the inconsistency: `highest_rated_*` filter `rating_count > 0` but apply **no minimum-vote threshold**, so a single 5-star rating tops the chart over a 500-rating 4.9. There is no Bayesian/Wilson smoothing anywhere.

---

### 4. Summaries & aggregates — how the numbers are actually computed

This is the architectural heart of the review module and it is worth being exact.

**Reviews use a trigger-maintained denormalized cache; ratings compute on the fly.** They are opposite strategies.

#### `production.review_summaries` (reviews)
One row per `(target_type, target_id)`, PK on that pair (`0010_reviews.sql:200-213`). Columns: `avg_stars NUMERIC(3,2)`, `rating_count`, `review_count`, `dist_1..dist_5`, `updated_at`.

`production.recompute_review_summary(type, id)` (`0010_reviews.sql:231-271`) does **one** scan producing all eight values via `COUNT(*) FILTER`, over the predicate:
```sql
WHERE target_type = p_type AND target_id = p_id
  AND deleted_at IS NULL AND status = 'published'
```
then `INSERT … ON CONFLICT (target_type, target_id) DO UPDATE`. So `avg_stars` is `ROUND(AVG(stars), 2)` over **published, non-deleted rows only** — hiding a review immediately removes its stars from the average.

`trg_user_review_summary` (`:294-298`) is `AFTER INSERT OR DELETE OR UPDATE OF stars, body, status, deleted_at, target_type, target_id`. The column list is the optimization: `helpful_count` updates don't retrigger it. `on_user_review_change` (`:273-290`) recomputes **both** old and new targets if a row's target moved.

Net effect: the hot read path is a **single PK lookup**, and every write path in `reviews.js` (`PUT`, `DELETE`, admin moderate) simply re-reads the cache afterward and trusts the trigger to have already run — correct because the trigger is `AFTER … FOR EACH ROW` in the same transaction.

`rating_count` vs `review_count`: `rating_count = COUNT(*)`, `review_count = COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body)) > 0)`. Same distinction as the list `baseWhere`, so the counts and the listings agree.

#### Batch fetch
`summariesFor` (`reviews.js:54-67`) fetches N summaries in one query via `JOIN unnest($1::text[], $2::uuid[]) AS t(tt, ti) ON s.target_type = t.tt::production.rateable_type AND s.target_id = t.ti`. The `::production.rateable_type` cast is required because `unnest` of a `text[]` yields `text`, which won't compare to the enum. Same pattern in `mineFor` (`:78-79`) and `POST /list` (`:156-157`). Cap is 200 targets — sized for "an album plus all its songs."

#### Artist rollup
`GET /api/reviews/artist/:slug/summary` (`:191-216`), **public, no auth**:
1. `getArtist(slug)` from the manifest (`manifest.js:261-281`) → 404 `'artist not found'`.
2. Map `artist.albums` → `albumUuid(code)` ids. Empty → early-return all-zeros with `album_count: 0`.
3. One query over `review_summaries WHERE target_type='album' AND target_id = ANY($1::uuid[])`.

The average is **rating-weighted, not a mean of means** (`:200`):
```sql
ROUND((SUM(avg_stars * rating_count) / NULLIF(SUM(rating_count), 0))::numeric, 2)
```
`NULLIF` guards the zero-ratings divide. `album_count` is `COUNT(*) FILTER (WHERE rating_count > 0)` — i.e. **rated** albums, aliased `rated_albums` internally and renamed on the way out (`:214`); it is not the artist's total album count.

Note the rollup covers **albums only** — song ratings for that artist are excluded. It also inherits a small imprecision: `avg_stars` is stored `NUMERIC(3,2)`, so the weighted sum multiplies already-rounded values.

#### `production.ratings` (editorial) — the contrast
No cache table. `aggregate()` (`ratings.js:18-49`) runs **up to three queries per call**: `COUNT + AVG`, a `GROUP BY stars` for the distribution, and (if authed) the caller's own row. Every `GET`/`PUT`/`DELETE` re-runs it.

Separately, `production.recompute_rating_aggregate` (`0001_init.sql:~718`) fires on `production.ratings` change and writes `avg_rating`/`rating_count` **back onto the parent entity row** — `catalog.songs`, `catalog.albums`, `catalog.artists`, `radio.playlists`, or `radio.programs`, dispatched by `rateable_type`. That is exactly what the public review module was designed **not** to touch (`0010_reviews.sql:8-12`): keeping them in separate tables means the public feature never perturbs the editorial aggregates on the catalog.

---

### 5. Ratings vs Reviews — why both exist

They look like duplicates and are not. The split is a **trust boundary**, and the role gates are the tell.

| | `/api/ratings` (`production.ratings`) | `/api/reviews` (`production.user_reviews`) |
|---|---|---|
| **Audience** | Internal editorial team | The public |
| **Read gate** | none (GET is public) | none (GET is public) |
| **Write gate** | **`requireRole('content_editor')`** (`ratings.js:60`, `:75`) | **`requireAuth`** — any `viewer`+ (`reviews.js:438`, `:467`) |
| **Target types** | all 5 rateable types | `album`/`song` only |
| **Free text** | `note ≤2000`, **unsanitized**, private | `title ≤150` + `body ≤5000`, **sanitized**, public |
| **Moderation** | none — no status, no reports, no log | full: status enum, reports, moderation log, audit mirror, notifications |
| **Delete** | **hard** `DELETE` (`ratings.js:78-81`) | **soft** `deleted_at` |
| **Aggregates** | computed live; trigger writes back to `catalog.*.avg_rating` | trigger-maintained `review_summaries`; **never touches `catalog.*`** |
| **Helpful votes / reporting** | none | yes |

**What the role gate implies.** `content_editor` sits at index 2 — above `viewer` and `reviewer`. So an ordinary signed-in listener can `PUT /api/reviews/album/<id>` but gets **403 `'Requires role: content_editor or higher'`** from `PUT /api/ratings/album/<id>`. Concretely:

1. **The catalog's canonical `avg_rating` is staff-controlled.** Because only `production.ratings` feeds `catalog.albums.avg_rating` / `catalog.songs.avg_rating` / `catalog.artists.avg_rating`, and only editors can write it, the public can never move the numbers that the catalog — and anything serialized from it to the public CDN — reports. Public sentiment lives entirely in `review_summaries`, a parallel universe.
2. **Unmoderated free text is safe only because it's staff-only.** `ratings.note` and `comments.body` skip `sanitizeText` entirely; that's tolerable precisely because the writers are trusted employees. The public path sanitizes on every write.
3. **The editorial surface needs no moderation apparatus** — no report table, no status, no audit log — because a content_editor is already accountable via role.
4. **Ratings are polymorphic across all five types** because editors rate playlists and programs during production; the public only ever sees albums and songs.

`0010_reviews.sql:8-12` states the intent outright: keeping them in separate tables means "the public feature never touches the editorial aggregates… so the existing experience is unaffected."

**Account deletion** cleans up both, hard: `auth/session.js:42-43` runs `DELETE FROM production.ratings WHERE rater_user_id = $1` and `DELETE FROM production.comments WHERE author_user_id = $1`. `user_reviews` needs no explicit statement — its FK is `ON DELETE CASCADE`.

---

### 6. `/api/comments` — editorial annotations

`production.comments` (`0001_init.sql:463-484`). Threaded **one level** via `parent_id` (self-FK, `ON DELETE CASCADE`), with `@mentions UUID[]`, an optional `lyric_line` anchor, and soft delete. Header comment: *"Never serialized to the public CDN."*

| Endpoint | Auth | Body / params | Behavior |
|---|---|---|---|
| `GET /api/comments/:type/:id` | **none** | `type` ∈ all 5, `id` UUID; else 400 `'invalid target'` | `⋈ identity.users`, `deleted_at IS NULL`, **`ORDER BY created_at ASC`**. Returns a bare array. |
| `POST /api/comments/:type/:id` | `content_editor` | `body: trim().min(1).max(8000)`; `parent_id?: uuid`; `lyric_line?: int positive`; `mentions?: uuid[]` (`:44-49`) | `INSERT … RETURNING *`, **201**, DTO with `author_name` taken from the caller's own token |
| `PATCH /api/comments/:commentId` | `content_editor` | `{ body: trim().min(1).max(8000) }` | ownership check → `UPDATE … SET body`; 200 |
| `DELETE /api/comments/:commentId` | `content_editor` | — | ownership check → `SET deleted_at = NOW()`; `{ id, deleted: true }` |

PATCH/DELETE both do a two-step: `SELECT author_user_id … AND deleted_at IS NULL` → 404 `'comment not found'`, then `!== req.auth.user.id` → **403 `'not the author'`** (`:69-71`, `:83-85`). So `content_editor` is necessary but not sufficient — even an admin cannot edit another editor's comment through this route (there is no admin override).

`edited` on the DTO (`:24`) works because `trg_comments_touch` is a generic `BEFORE UPDATE` touch trigger (`0001_init.sql:708`) — the exact opposite of the `user_reviews` design, which omits that trigger on purpose.

**Gaps worth knowing:**
- `parent_id` is **not validated** — no check that the parent exists, targets the same object, or is itself a root comment. The "one level deep" contract is convention only; the DB self-FK permits arbitrary nesting.
- `mentions` UUIDs are stored but **nothing consumes them** — no notification is generated for a mention anywhere in the codebase. Comments produce **zero** notifications of any kind.
- The response is a flat list; the client must build the tree from `parent_id`.
- No pagination — every active comment on a target is returned.
- `lyric_line` has no upper bound beyond "positive int"; nothing cross-checks it against the lyric.

---

### 7. `/api/me` — personal playlists & likes

`router.use(requireAuth)` at `me.js:17` — **every** route here needs a session, but **no role**, so `viewer` is enough.

#### 7.1 Ownership

`ownedPlaylist(id, userId)` (`me.js:20-26`) is the gate on every playlist route:
1. `!isUuid(id)` → 400 `'invalid playlist id'`
2. no row → 404 `'playlist not found'`
3. `owner_user_id !== userId` → **403 `'not your playlist'`**

Distinguishing 404 from 403 leaks the existence of other users' playlist ids — a deliberate-looking tradeoff, but worth noting since `is_public` exists on the table yet **no route serves another user's playlist**. `is_public` is currently write-only metadata.

#### 7.2 Playlists

##### `GET /api/me/playlists`
Two steps. First, an **idempotent auto-provision** of the default playlist (`me.js:38-46`):
```sql
INSERT INTO production.user_playlists (owner_user_id, name, description)
  SELECT $1, 'My Favorites', 'Your go-to mix of saved songs.'
   WHERE NOT EXISTS (SELECT 1 FROM production.user_playlists
                      WHERE owner_user_id = $1 AND name = $2)
```
`DEFAULT_PLAYLIST_NAME = 'My Favorites'` (`:31`). This is a **listing side-effect** — a GET that writes. There is no unique index on `(owner_user_id, name)`, so the `WHERE NOT EXISTS` is racy: two concurrent first-listings can create two "My Favorites."

Then the listing (`:48-59`), `LEFT JOIN` items for `COUNT(pi.id)::int AS item_count`, with a correlated subquery for the lowest-`position` `song_id`. Ordering is `ORDER BY (pl.name = $2) DESC, pl.created_at DESC` — a boolean sort key that **pins "My Favorites" first**, then newest-first. This is why it's the default entry in the Add-to-Playlist menu (`:28-30`).

Each row gets `is_default: pl.name === DEFAULT_PLAYLIST_NAME` (name-based, not a column) and `cover` resolved from the manifest via `getSongById(first_song_id)?.cover` (`:61-65`). `first_song_id` is destructured out and not returned.

##### `POST /api/me/playlists`
Body: `name: trim().min(1).max(200)` required; `description?: ≤2000`; `is_public?: boolean` (default `false`). **201** with the raw row.

##### `GET /api/me/playlists/:id`
`ownedPlaylist` → items query joining `catalog.songs ⋈ catalog.albums ⋈ catalog.artists`, `LEFT JOIN catalog.assets` for `storage_url`, `ORDER BY pi.position` (`:88-101`). Then the manifest-overlay pass (`:106-116`): manifest wins for `url` and `cover`, DB titles are the fallback (`it.song_title || m?.title || 'Unknown track'`), because the DB carries no audio asset rows. Response: the playlist row spread plus `items[]`.

##### `PATCH /api/me/playlists/:id`
Body: all three fields optional — `name` (trim, 1–200), `description` (`≤2000`, **nullable**), `is_public`. The SQL (`:146-153`) is `COALESCE($2, name)` for name and `COALESCE($4, is_public)` for the flag, with description handled specially:
```sql
description = CASE WHEN $3::text IS NULL THEN description ELSE NULLIF($3, '') END
```
> ⚠️ The JS binds `description === undefined ? null : description` (`:152`). So **omitting** `description` and **explicitly sending `null`** both arrive as SQL `NULL` and both leave the value unchanged. To actually clear a description you must send `""`, which `NULLIF` converts to `NULL`. The zod schema advertises `.nullable()`, which is misleading.

Same pattern means `name: null` and `is_public: null` are silently ignored rather than rejected.

##### `DELETE /api/me/playlists/:id`
`DELETE FROM production.user_playlists WHERE id = $1` → **204** no body. Items cascade (`0003:30`). No protection for "My Favorites" — it can be deleted, and the next `GET /playlists` silently recreates it empty.

#### 7.3 Item mutation & ordering semantics

Ordering is an explicit integer `position` column with **`UNIQUE (playlist_id, position)`** and **`UNIQUE (playlist_id, song_id)`** (`0003:34-35`) — stable order, no duplicate songs.

##### `POST /api/me/playlists/:id/items` — append one
Body `{ song_id: uuid }`. Verifies the song exists in `catalog.songs` → 404 `'song not found'`. Then the append (`:171-178`):
```sql
INSERT INTO production.user_playlist_items (playlist_id, song_id, position)
  SELECT $1, $2, COALESCE(MAX(position) + 1, 0)
    FROM production.user_playlist_items WHERE playlist_id = $1
ON CONFLICT (playlist_id, song_id) DO NOTHING
RETURNING *
```
First item lands at **position 0**. `updated_at` is bumped separately. Response is **201** with the item row, or — when the conflict swallowed the insert — **200** `{ playlist_id, song_id, duplicate: true }` (`:180`). The 200-vs-201 split is the client's "already in this playlist" signal.

##### `POST /api/me/playlists/:id/items/bulk` — add many
Body `{ song_ids: uuid[] }`, `.min(1).max(100)`. Loops **serially inside one `withTransaction`** (`:190-205`): per id, existence check (missing → `continue`, silently skipped), then the same append-with-`DO NOTHING`, counting only rows that actually inserted. One `updated_at` bump at the end. Response **200** `{ playlist_id, added, total }` — `added` ≤ `total`, and the gap tells the client how many were dupes-or-missing without saying which. This is the "add a whole album" path.

Note: the `MAX(position)+1` subquery re-runs per iteration, so it's N round-trips and N scans — fine at ≤100, but it is not a set-based insert.

##### `DELETE /api/me/playlists/:id/items/:itemId`
Deletes by **item id** (not song id), scoped `AND playlist_id = $2`. → **204**. **Positions are not renumbered**, leaving gaps — harmless because reads only `ORDER BY position`.

##### `PATCH /api/me/playlists/:id/items` — reorder / bulk set
Body `{ items: [{ song_id: uuid }] }`, `.max(1000)` — **no `.min`**. This is **replace-the-whole-list**, not a diff (`:225-242`), inside one transaction:
1. `DELETE FROM user_playlist_items WHERE playlist_id = $1` — *all* items
2. re-`INSERT` each in array order with `position = pos++` starting at 0, `ON CONFLICT (playlist_id, song_id) DO NOTHING`
3. bump `updated_at`

Response `{ playlist_id, item_count: items.length }`.

Three consequences: (a) **an empty `items: []` clears the playlist** — a legal, silent destructive call; (b) `added_at` is destroyed and reset on every reorder, since rows are recreated; (c) if the payload repeats a `song_id`, the conflict drops it but `pos` still increments, leaving a position gap — and `item_count` in the response reports the **payload** length, not what was actually stored, so it over-reports on duplicates.

##### `GET /api/me/playlist-song-ids`
Cross-playlist rollup (`:122-134`): `user_playlist_items ⋈ user_playlists WHERE owner_user_id = $1 GROUP BY song_id`. Returns `{ counts: { "<song_uuid>": n } }` — how many of *your* playlists contain each song. Drives the "already added ✓" indicator in track lists in one request instead of one-per-playlist.

#### 7.4 User playlists vs radio playlists

Two entirely separate systems that share a word (`me.js:11-13`, `0003_user_playlists.sql:2-8`):

| | `production.user_playlists` | `radio.playlists` |
|---|---|---|
| Router | `me.js` at `/api/me/playlists` | `radio.js`, mounted `app.use('/api', …)` → `/api/playlists` (`index.js:126`) |
| Gate | `requireAuth` — any listener | `radio_producer` role |
| Purpose | personal saved collections | station/producer programming |
| Ownership | `owner_user_id` FK, per-user | station/program scoped |
| Rateable | no | **yes** — `playlist` is a `rateable_type`, and `recompute_rating_aggregate` writes `avg_rating` back to `radio.playlists` |

Note the URL collision hazard: personal playlists live under `/api/me/playlists` specifically because `/api/playlists` was already taken by radio.

#### 7.5 Likes

`production.user_likes` (`0011_likes.sql`) — `PRIMARY KEY (user_id, target_type, target_id)`, no surrogate id, no soft delete. Purpose per the migration header: *"Replaces the per-browser localStorage 'Liked' set with a DB-backed, per-user favorites list so likes persist across devices."*

| Endpoint | Body / params | Behavior | Response |
|---|---|---|---|
| `GET /api/me/likes/ids` | — | raw select, no joins, no manifest | `{ ids: ["album:<uuid>", "song:<uuid>", …] }` |
| `GET /api/me/likes` | — | `ORDER BY created_at DESC`, then manifest-resolve each | `{ items: [{target_type, target_id, liked_at, ...manifestFields}] }` |
| `POST /api/me/likes` | `{ target_type: 'album'\|'song', target_id: uuid }` | `INSERT … ON CONFLICT DO NOTHING` | **201** `{ liked: true, target_type, target_id }` |
| `DELETE /api/me/likes/:type/:id` | path params, validated inline (`:289`) | unconditional delete | **200** `{ liked: false, target_type, target_id }` |

**Why `/likes/ids` exists as a separate endpoint.** It is the **client-side hydration** primitive. The ♥/✓ state has to be correct on *every* tile the moment a page renders — album grids, hover tiles, track rows — and those tiles are rendered from the manifest, not from a likes API. Three properties make the flat form the right shape:

- **One request for the whole app.** The client fetches the complete like-set once on session start and holds it in memory. Without it, every tile would need its own "am I liked?" call, or every list endpoint would need a `liked` column threaded through it.
- **`"type:id"` string keys drop straight into a `Set`.** `isLiked(\`album:${id}\`)` is an O(1) membership test with no per-item object allocation and no key-composition logic on the client — the *server* owns the key format, and the same `"type:id"` convention is reused by `POST /reviews/summaries` (`reviews.js:125`), so the client has one composite-key idiom throughout.
- **No manifest resolution, no join.** Contrast `GET /likes` (`:259-271`), which calls `getAlbumById`/`getSongById` per row and **drops any row the manifest can't resolve** (`.filter(Boolean)`). That's correct for the "Liked" page — you can't render a card for a delisted album — but it would be wrong for hydration, where a delisted-but-liked item must still read as liked. `/likes/ids` returns the *truth*; `/likes` returns the *renderable subset*. They intentionally disagree.

`POST` is not a toggle (unlike the helpful vote) — like and unlike are separate verbs, both idempotent: re-liking hits `ON CONFLICT DO NOTHING` and still returns 201; unliking something you never liked returns 200. Neither validates that the target exists.

---

### 8. Notifications — two independent systems

There are **two unrelated notification tables** with near-identical read/mark-read APIs. Nothing bridges them; the review module does *not* import `services/notifications.js`.

#### 8.1 Review notifications (in `reviews.js` / `reviewsAdmin.js`)

`production.review_notifications` (`0010_reviews.sql:178-191`): `id, user_id (FK CASCADE), kind, review_id (no FK), data JSONB, read_at, created_at`. `kind` is constrained by `CHECK (kind IN ('helpful_vote','review_approved','review_rejected','review_removed'))`.

**Four generators, and only four:**

| kind | Generated by | Payload `data` |
|---|---|---|
| `helpful_vote` | `reviews.js:320` — on a **new** vote only, and only when `reviewer_user_id !== uid` | `{ by: <voter displayName> }` |
| `review_approved` | admin `approve` **or** `restore` (`reviewsAdmin.js:30-31`, insert at `:182-186`) | `{ action, reason }` |
| `review_rejected` | admin `reject` | `{ action, reason }` |
| `review_removed` | admin `hide` **or** `delete` | `{ action, reason }` |

The local helper `notify(client, userId, kind, reviewId, data)` (`reviews.js:98-104`) takes a **transaction client**, not the pool — notifications are written *inside* the caller's transaction, so a vote and its notification commit or roll back together. `reviewsAdmin.js` inlines the same INSERT (`:182-186`) rather than importing the helper — duplicated logic across the two files.

**Delivery is pure pull.** No email, no push, no websocket, no fanout worker. The client polls `GET /api/reviews/notifications`. Read-marking is `POST /api/reviews/notifications/read` with optional `ids` (≤100) or all-unread. Both are covered by `idx_review_notifs_unread`, a partial index `ON (user_id) WHERE read_at IS NULL` (`0010_reviews.sql:189`).

Nothing notifies on: a new review of your album, a reply, an `@mention` in a comment, or a report filed against you.

#### 8.2 Subscription notifications (`services/notifications.js`)

A separate billing-feed module — **not** part of the social subsystem, despite the filename. Header (`:5-9`): both the feed row and the email are best-effort, because *"a notification failure must never roll back a billing state change, so callers fire-and-forget."*

```js
export async function notify({ userId, type, title, body = null, metadata = {}, email = null })
```

Behavior (`:35-57`):
1. Resolve the title: explicit `title` → `TEMPLATES[type]?.title` → `'Subscription update'`.
2. `INSERT INTO production.subscription_notifications (user_id, type, title, body, metadata, email_sent)` with `email_sent = !!email` — note this records **intent**, set before the send is attempted, so it stays `true` even if delivery then fails.
3. On failure: `logger.warn(…, 'subscription notification insert failed')` and `id` stays `null` — **swallowed, never thrown**.
4. If `email?.to`, `await sendSubscriptionEmail(email)` (`services/email.js:179` — `{to, subject, heading, intro, rows[], ctaLabel, ctaUrl, note}`, builds both text and HTML). Failure → `logger.warn(…, 'subscription email failed')`, also swallowed.
5. Returns the row id or `null`.

Both try/catches are why callers can fire-and-forget: `notify()` never rejects.

`TEMPLATES` (`:19-32`) — 12 types: `subscription_activated`, `payment_succeeded`, `payment_failed`, `renewal_upcoming`, `renewed`, `expired`, `cancelled`, `reactivated`, `plan_changed`, `family_invite_sent`, `family_invite_accepted`, `family_member_removed`. Unlike the review table, `subscription_notifications.type` is plain `TEXT` with **no CHECK** (`0014_subscriptions.sql:272`), so the template list is convention, not constraint.

`nameParts(user)` (`:13-16`) → `{ fullName, firstName }`, both `''` when the user has no `displayName`, so email templates can fall back to an impersonal greeting.

**Callers:** `services/subscriptions.js:4`, `routes/subscriptions.js:10`, `routes/subscriptionsWebhook.js:7`. **Read API:** `GET /api/subscriptions/notifications` (LIMIT 50, returns `{ notifications }` — a different envelope key from the review feed's `{ items, unread }`, and with **no unread count**) and `POST /api/subscriptions/notifications/read` (`subscriptions.js:359-374`) — all-or-nothing, **no `ids` support**.

#### Comparison

| | Review notifications | Subscription notifications |
|---|---|---|
| Table | `production.review_notifications` | `production.subscription_notifications` |
| Kind/type | 4 kinds, DB `CHECK`-constrained | 12 types, free `TEXT` |
| Payload | `data JSONB` | `metadata JSONB` + `title`/`body` columns |
| Written | **inside** the caller's transaction | own connection, fire-and-forget |
| Failure | propagates, rolls back the action | swallowed, logged `warn` |
| Email | none | optional via `sendSubscriptionEmail` |
| Read API | `LIMIT 100`, `{items, unread}` | `LIMIT 50`, `{notifications}` |
| Mark read | selective (`ids`) or all | all only |

The transactional-vs-fire-and-forget split is the right call in both directions: a helpful-vote notification is worthless if the vote didn't commit, whereas a billing state change must survive a dead SMTP host.

---

### 9. `docs/REVIEWS_API.md` — accuracy audit

**Verdict: substantially accurate, mildly stale in three places.** It documents `/api/reviews` and `/api/admin/reviews` only — `/api/ratings`, `/api/comments`, and `/api/me` have no doc coverage at all.

**Correct:** the editorial-vs-public framing and role gates (lines 4-6); polymorphic targets and the deterministic-UUID scheme (10-12); the 120 req/min write limiter (13); the error envelope (14-15); every endpoint path, method, and auth requirement; all zod constraints — `stars 1..5`, `title ≤150`, `body ≤5000`, `detail ≤1000`, `limit 1–50 default 10`, the four sort values; report reasons; the five moderation actions; the analytics payload keys (107-110); and the two important behavioral claims — "server-sanitized" (67) and "**A report never hides a review** — only a moderator can" (82-83).

**Issues:**

1. **Response shapes are illustrative, not literal.** The `GET /:type/:id/summary` sample (23-30) shows `mine` nested inside — correct — but omits that `average` is `null` and counts are `0` for an unrated target. The list sample (44-46) omits `target_type`/`target_id`, which `reviewRowToDto` always emits (`reviews.js:362-363`).

2. **Line 15 lists `409 conflict` among the errors.** No endpoint in `reviews.js` or `reviewsAdmin.js` can produce a 409 — every uniqueness collision is absorbed by `ON CONFLICT` (upsert, idempotent report, vote toggle), which is precisely the design that makes 409 unreachable. The generic `23505`→409 mapping in `error.js:26-27` would only fire on an unhandled constraint. Stale/aspirational.

3. **Line 88's `me/contributions` field list is right but the section header "Profile & notifications (require auth)" undersells `me/reviews`** — line 89 says "(any status)" which is correct and useful; it should also note the hard `LIMIT 200` with no pagination.

4. **Missing entirely:** the `targets` array bounds (**1–200**) on both `POST /summaries` and `POST /list` — a client sending 250 targets gets a 400 with no documented cause. Also undocumented: `me/contributions` counts non-published rows; `mine` includes hidden/rejected reviews; `PUT` does **not** reset a moderated `status`; and helpful votes are **not** self-vote-protected.

5. **Line 13 says "writes share the global write limiter"** — technically true but incomplete: `POST /summaries` and `POST /list` are *reads* that also consume that budget, because `writeLimiter.skip` only exempts `GET`/`HEAD` (`index.js:82`).

6. Line 99's admin list documents `status` as a query param without noting it is **unvalidated** and that a bad value yields a 500 rather than a 400 (see §3.1).

The §-numbers scattered through the doc (§2, §9, §10, §11, §14, §19…) reference an external Build-Spec not present in the repo; they match the same markers in the route files and `0010_reviews.sql`, so the cross-referencing is internally consistent.

---

### 10. Summary of notable findings

| # | Finding | Location |
|---|---|---|
| 1 | **Self-votes on helpful are not prevented** — only the self-*notification* is suppressed. Inflates a sort key and the admin "most helpful" panel. | `reviews.js:319` |
| 2 | **`?status=<invalid>` on the admin list returns 500**, not 400 — the value is unwhitelisted and reaches Postgres as an enum cast (`22P02`), which `errorHandler` doesn't map. `target_type`/`reported` *are* whitelisted. | `reviewsAdmin.js:39,50`; `error.js:12-15` |
| 3 | **`PUT /:type/:id` doesn't reset `status`** — a moderated (hidden/rejected) review stays hidden after an author edit, with no self-serve path back to published. | `reviews.js:449-450` |
| 4 | **`PATCH /playlists/:id` can't clear a description via `null`** — `null` and "omitted" are indistinguishable at the SQL layer; only `""` clears it, despite the schema advertising `.nullable()`. | `me.js:148,152` |
| 5 | **`PATCH /playlists/:id/items` accepts `items: []`** (no `.min`) and it silently wipes the playlist; it also resets every `added_at`, and `item_count` reports the payload length rather than rows stored. | `me.js:222-242` |
| 6 | **`DELETE /reviews/:type/:id` never checks `rowCount`** — always returns `{deleted:true}` even when nothing matched. | `reviews.js:471-477` |
| 7 | **`GET /me/playlists` writes on read** and the auto-provision is racy — no unique index on `(owner_user_id, name)`, so concurrent first-listings can create duplicate "My Favorites". Nothing protects it from deletion either. | `me.js:38-46` |
| 8 | **`comments.mentions` is stored but never consumed** — no mention notifications exist; comments generate no notifications at all. `parent_id` is also unvalidated, so "one level deep" is convention only. | `comments.js:48,59` |
| 9 | `POST /reviews/summaries` and `/list` are reads over `POST`, so they consume the 120/min **write** budget. | `index.js:82` |
| 10 | `radio_producer` / `production_manager` exist in the DB role CHECK but **not** in `ROLE_ORDER` → `roleLevel` = `-1`, failing even `requireRole('viewer')`. | `config.js:189` vs `0013_reviewer_role.sql` |
| 11 | `0010_reviews.sql:81-82` claims the one-per-target unique constraint is **partial**; it is not. Behavior is still correct (the upsert clears `deleted_at`), but the comment misleads. | `0010_reviews.sql:81-85` |
| 12 | Admin `highest_rated_*` charts apply **no minimum-vote threshold** — one 5-star rating outranks a 500-rating 4.9. | `reviewsAdmin.js:195-210` |
| 13 | `/likes/ids` and `/likes` **intentionally disagree**: the latter drops manifest-unresolvable rows via `.filter(Boolean)`, the former returns the full truth. Correct, but undocumented and easy to "fix" wrongly. | `me.js:250-271` |


---

## 8. Analytics & Telemetry

Two physically separate data paths share this subsystem:

| Path | Table | Nature | Written by | Read by |
|---|---|---|---|---|
| **Analytics log** | `production.playback_events` + `production.analytics_daily` | Durable, append-only | `POST /api/analytics/play` | All admin dashboard reads |
| **Presence** | `production.now_playing` | Ephemeral, upsert/delete | `POST /api/analytics/now-playing[/stop]` | `GET /api/admin/active-listeners` |

Mounts (`src/index.js:123`, `:138`):
- `app.use('/api/analytics', writeLimiter, analyticsRouter)`
- `app.use('/api/admin', writeLimiter, adminRouter)`

`writeLimiter` (`index.js:80-83`) is 120 req/min per IP but **skips GET/HEAD**, so it only throttles `/play` and the two `/now-playing` posts; every dashboard read is unthrottled. `app.set('trust proxy', 1)` (`index.js:45`) — `req.ip` is the first `X-Forwarded-For` hop, which is what lands in `ip_address`.

### Auth matrix

| Endpoint | Auth |
|---|---|
| `POST /api/analytics/play` | `requireAuth` — **any** logged-in listener |
| `POST /api/analytics/now-playing` | `requireAuth` — any logged-in listener |
| `POST /api/analytics/now-playing/stop` | `requireAuth` — any logged-in listener |
| `GET /api/analytics/*` (all 10 reads) | `requireRole('admin')` + audit log |
| `GET /api/admin/active-listeners` | `requireRole('admin')` (router-level, `admin.js:23`) |

The admin gate is applied as **router-level middleware at `analytics.js:107`**, i.e. positionally — everything registered *below* that line is admin-only. The three write endpoints are registered above it. Immediately after the gate, `analytics.js:108-115` inserts an `identity.audit_log` row (`action='analytics.access'`, `target_type='analytics'`, `target_id=req.path`, `payload={query}`) for **every** admin read; it is fire-and-forget (`.catch` → `logger.warn`) so an audit failure never blocks the response.

### POST /api/analytics/play — record a playback event

**Auth:** any authenticated user. **Success:** `201 {"recorded": true}`.

Zod schema (`analytics.js:30-40`):

| Field | Type | Constraint | Required |
|---|---|---|---|
| `song_id` | string | `.uuid()` | ✅ |
| `listening_seconds` | number | int, 0–86400 | ✅ |
| `session_id` | string | max 120 | — |
| `source` | enum | `album\|playlist\|search\|recommendation\|radio\|direct\|other` | — |
| `started_at` | string | **no format validation** | — |
| `ended_at` | string | **no format validation** | — |
| `duration_seconds` | number | int, 0–86400 | — |
| `completed` | boolean | — | — |
| `skipped` | boolean | — | — |

**Handler steps** (`analytics.js:42-80`):

1. `getSongById(b.song_id)` → manifest lookup. **Album/artist ids are derived server-side**, never client-supplied: `album_id = albumUuid(song.code)`, `artist_id = artistUuid(song.artistSlug)` (`:45-46`). These are deterministic UUIDv5 over namespace `f3a1e2d4-…` (`ids.js:5-9`), so they match the DB importer and web client. An unknown `song_id` yields `null` for both — the row still inserts, orphaned but valid.
2. `parseUserAgent(req.get('user-agent'))` → `{device, browser, os}`.
3. **Completion** (`:50-52`): if `duration_seconds > 0`, `clamp(0,100, round(listening/dur*10000)/100)` — a 2-dp percentage. Otherwise falls back to `completed ? 100 : 0`. Note `listening_seconds` is **not** clamped to `duration_seconds`, so an over-long report is clamped only at 100.
4. **Derived flags** (`:53-54`): `completed ??= completion >= 90`; `skipped ??= (!completed && completion < 80)`. Completion in the 80–90 band with no explicit flags produces `completed=false, skipped=false` — a deliberate "partial play" bucket.
5. **Timestamps** (`:55-56`): `started_at ?? now - listening_seconds*1000`; `ended_at ?? now`.
6. **One transaction, two writes** (`:58-78`):
   - `INSERT INTO production.playback_events` (17 columns).
   - `INSERT INTO production.analytics_daily … ON CONFLICT (day) DO UPDATE` incrementing `plays+1`, `listening_seconds+$2`, `completed_plays`, `skipped_plays`, `updated_at=NOW()`. The bucket key is `($1 AT TIME ZONE 'UTC')::date` where `$1` is **`startedAt`, not now** — a backdated event lands in its historical day bucket.

**Errors:** `400` validation (with `issues[]`), `401` no token, `429` rate limit.

#### What a "play" is, and the dedupe model

A "play" is **one client-reported listening segment**, emitted by `player.ts:162-181` `endPlay()` when a track ends, is skipped, or is replaced. The client suppresses segments under 1 second (`player.ts:168`, and again in `analytics.ts:38`).

**There is no dedupe and no idempotency — at all.** `playback_events` has a bare `BIGSERIAL` PK (`0012_analytics.sql:27`), no natural-key unique constraint, and the handler does no existence check. Consequences worth being explicit about:

- Any retry, double-fire, or replayed request inserts a **second event** *and* double-increments `analytics_daily` in the same transaction. The rollup cannot drift from the log, but both inflate together.
- The client uses `fetch(..., {keepalive: true})` (`analytics.ts:44`) specifically so the event survives page unload — which is exactly the condition under which browsers may retransmit.
- `session_id` is **not** a dedupe key. It is a free-text grouping label, and nothing enforces that it belongs to the caller.
- A malicious authenticated listener can inflate their own play counts arbitrarily, subject only to the 120/min limiter.

#### How `session_id` works

Client-generated and client-owned: `getSessionId()` (`analytics.ts:22-32`) is a **`crypto.randomUUID()` stored in `sessionStorage` under `jvAnalyticsSession`** — i.e. stable **per browser tab**, regenerated on a new tab, lost on tab close. If `sessionStorage` throws (private mode / blocked), it degrades to the literal string `'anon'`, meaning **all such users collapse into one shared session bucket**.

Server-side it is stored verbatim in `playback_events.session_id` (`TEXT`, nullable) and used only as `COUNT(DISTINCT session_id)` for the `sessions` metric in `/users` and `/users/:id`. The same value doubles as the **primary key of `now_playing`**, which is where it becomes load-bearing — see below.

### POST /api/analytics/now-playing — presence heartbeat

**Auth:** any authenticated user. **Success:** `200 {"ok": true}`.

Schema (`analytics.js:87`): `{ song_id: uuid (required), session_id: string min 1 max 120 (required) }`. Note `session_id` is **required and non-empty** here, unlike on `/play`.

Handler (`:88-98`) is a single upsert:

```sql
INSERT INTO production.now_playing (session_id, user_id, song_id, ip_address, started_at, updated_at)
  VALUES ($1,$2,$3,$4,NOW(),NOW())
ON CONFLICT (session_id) DO UPDATE
  SET song_id=EXCLUDED.song_id, user_id=EXCLUDED.user_id,
      ip_address=EXCLUDED.ip_address, updated_at=NOW()
```

`started_at` is preserved across heartbeats (only set on first insert) — it is the "listening since" timestamp; `updated_at` is the liveness clock.

> ⚠️ **Security note.** The conflict target is `session_id` alone, and `user_id` is overwritten from the token on conflict. Since `session_id` is a client-chosen string, one user can post a `session_id` already in use and **hijack another user's presence row**, reassigning it to themselves. The impact is confined to a cosmetic admin page, and collisions are unlikely with UUIDs, but the row is not scoped to its owner on write.

### POST /api/analytics/now-playing/stop

**Auth:** any authenticated user. Schema: `{ session_id: string min 1 max 120 }`. **Success:** `200 {"ok": true}`.

`DELETE FROM production.now_playing WHERE session_id=$1 AND user_id=$2` (`:100`) — correctly scoped to the caller, so you can only clear **your own** presence. Returns `ok:true` whether or not a row matched (no 404).

#### TTL / staleness model

There is **no TTL, no expiry column, and no reaper job** — the only writers of `now_playing` anywhere in the repo are these two handlers. Liveness is purely a **read-time filter**: `WHERE np.updated_at > NOW() - INTERVAL '45 seconds'` (`admin.js:172`), matched to the client's 25s heartbeat (`FooterPlayer.tsx:147`, `setInterval(..., 25000)`), giving one full missed beat of tolerance.

The practical consequence: any session that ends without a clean `/stop` — tab crash, network drop, force-quit — **leaves its row in the table forever**. Those rows are invisible (filtered by the 45s window) but never reclaimed. The only cleanup is `ON DELETE CASCADE` when the user is deleted (`0018_now_playing.sql:10`). Growth is bounded by distinct `session_id` values, i.e. roughly tabs-that-ever-played; a periodic `DELETE WHERE updated_at < NOW() - INTERVAL '1 hour'` would be the obvious fix.

Client lifecycle (`FooterPlayer.tsx:143-149`): the effect keys on `[song?.songId, p.isPlaying]`; if either is falsy it calls `stopNowPlaying()`, otherwise it pings immediately then every 25s. `pingNowPlaying` deliberately routes through the `api` client rather than raw `fetch` so an expired 1h access token is **transparently refreshed mid-playback** — the inline comment at `analytics.ts:55-57` records that a previous raw-fetch version silently killed the heartbeat after an hour and listeners vanished from the page. `stopNowPlaying` uses raw `fetch` with `keepalive` (it must survive unload) and therefore no-ops if the access token is already gone.

### GET /api/admin/active-listeners

**Auth:** admin (`admin.js:23`). **Handler:** `admin.js:166-191`. No query params.

1. Selects live presence rows joined to `identity.users`, `WHERE np.updated_at > NOW() - INTERVAL '45 seconds' ORDER BY np.updated_at DESC`.
2. For each row (in parallel via `Promise.all`): resolves the song from the manifest, builds a display name as `"first last"` falling back to `display_name`, and awaits `geoLookup(x.ip_address)`.
3. Response: `{ count, listeners: [{ session_id, name, location, album, track, song, code, cover, since }] }` — `album`/`song` fall back to `'—'`, `cover` is `/cover/{code}.png` or `null`, `since` is `started_at`.

The `JOIN identity.users` is inner, so a presence row whose user was deleted is dropped (though the FK cascade should already have removed it).

**Latency note:** geo lookups run concurrently but each can block up to 1.5s on a cold cache, so a first page load with many distinct new IPs is bounded by the slowest single lookup, not their sum.

### Geo + user-agent enrichment

**User-agent** (`util/ua.js`) — a dependency-free classifier, applied **only** on `POST /play`, deriving three low-cardinality strings:

- `device`: `tablet` if `/ipad|tablet|playbook|silk|android(?!.*mobile)/`, else `mobile` if `/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/`, else `desktop`. Never returns `'other'` despite the column comment in `0012_analytics.sql:33` listing it.
- `os`: `Windows | iOS | macOS | Android | Linux | other` (first match wins, iOS checked before macOS).
- `browser`: `Edge | Opera | Chrome | Firefox | Safari | other` — ordered so Edge is caught before Chrome and Safari only matches when Chrome/CriOS is absent.

The file's own header calls this "best-effort… not fingerprinting," and that is accurate: three coarse buckets, no version, no model.

> **Dead-end dimension.** `device_type`, `browser`, and `os` are written on every play and read back by **nothing**. No endpoint in `analytics.js` selects or groups by them — there is no device/browser breakdown in the dashboard. The data is accumulating for a report that doesn't exist yet.

**Geo** (`util/geo.js`) — used **only** by `/active-listeners`, never on the analytics path:

1. `normalize()` strips an `::ffff:` IPv4-mapped prefix and any `/nn` CIDR suffix (`geo.js:9`) — the latter matters because Postgres `INET` round-trips can carry a mask.
2. `isPrivate()` short-circuits loopback/RFC1918/link-local/IPv6 ULA to the literal `'Local network'` — no outbound call (`geo.js:11-17`).
3. Cache hit within a **1h TTL** returns immediately. The cache is a plain in-process `Map` (`geo.js:4`) — unbounded, never evicted, and lost on restart.
4. Otherwise `fetch('http://ip-api.com/json/<ip>?fields=status,city,regionName,country')` with a **1.5s `AbortController` timeout**.
5. On `status === 'success'`: `"City, Region"`, else `country`, else `'—'`. Any throw is swallowed and `'—'` is kept — geo can never fail the page. **The failure result is cached too** (`:31` runs unconditionally), so a single timeout pins that IP to `'—'` for an hour.

**Privacy considerations worth flagging:**

- Listener IP addresses are transmitted **to a third party (ip-api.com) over plaintext HTTP, not HTTPS** (`geo.js:24`). The IP, and by extension the fact that a specific user is listening right now, is exposed to that provider and to any network observer on the path.
- ip-api.com's free tier is rate-limited (~45 req/min per origin IP) and its ToS restricts commercial use; the 1h cache mitigates the former but there is no fallback or circuit breaker when it starts refusing — results silently degrade to `'—'`.
- Precision is deliberately coarse: city/region only, no coordinates, no postcode.
- Separately, raw IPs are retained **indefinitely** in `playback_events.ip_address` (`INET`, `0012_analytics.sql:36`) with no retention policy or anonymization, alongside `user_id` — that is a durable, individually-attributable location trail. `now_playing.ip_address` is the ephemeral counterpart. There is no data-retention or right-to-erasure handling here beyond the `ON DELETE SET NULL` on `playback_events.user_id`, which orphans the events but **leaves the IP addresses in place**.

### Shared query helpers (admin reads)

**`range(req, col='started_at', startIdx=1)`** (`analytics.js:118-125`) builds the `?from=`/`?to=` filter. `from` → `col >= $n`; `to` → `col < ($n::date + 1)` — the `+1` makes `to` **inclusive of the whole named day**. Values are passed as bind parameters (no injection), but they are **not validated as dates** — a malformed `to` reaches Postgres and raises `22007`, which the error handler does not special-case, so it surfaces as **`500 internal`** rather than 400. With neither param the clause is the literal `TRUE`.

**`pageOf(req)`** (`analytics.js:127-131`): `page = max(1, parseInt||1)`, `limit = min(200, max(1, parseInt||25))`, `offset=(page-1)*limit`. **Hard cap 200, default 25.**

**Sorting** (`:213`, `:254-256`): `?sort` ∈ `plays|listening|unique|rating|reviews`, mapped through `ALBUM_SORTS` then `sortMapField` to a response field; unknown values silently fall back to `plays`. Sorting is always **descending, numeric, in JavaScript** (`(b[k]||0)-(a[k]||0)`) — never in SQL — so `null` ratings sort as 0 (last), and there is no ascending option.

### GET /api/analytics/overview

**Admin.** No params. Handler `:136-208`. Runs **8 sequential queries** (each `await`ed separately, not `Promise.all` — the slowest of the read endpoints) plus two synchronous manifest reads.

| Metric | Source |
|---|---|
| `total_albums` / `total_songs` / `total_artists` | Manifest map sizes (`byAlbumCode`, `bySongId`, `byArtist`) — **catalog, not DB** |
| `available_*` / `studio_*` | `statusCounts('all')` — album is *ready* if `playable > 0`, else *studio* (`manifest.js:297-298`) |
| `total_users` | `COUNT(*) FROM identity.users` |
| `active_users` | `COUNT(DISTINCT user_id)` from `playback_events` where `started_at >= NOW() - 30 days` |
| `total_plays` / `completed_plays` / `skipped_plays` | `SUM` over the whole `analytics_daily` rollup |
| `total_listening_hours` | `round(seconds/360)/10` — seconds→hours to 1 dp |
| `total_ratings` / `total_reviews` | `user_reviews` where `deleted_at IS NULL AND status='published'`; a *review* additionally requires `body IS NOT NULL AND char_length(trim(body))>0` |
| `avg_album_rating` / `avg_song_rating` | `AVG(stars) FILTER (WHERE target_type=…)`, 2 dp |
| `most_played_album` / `most_played_song` | `GROUP BY … ORDER BY COUNT(*) DESC LIMIT 1` — **unfiltered by date** |
| `most_active_listener` | Top user by play count, joined to `identity.users`; returns `{name, plays, hours}` |
| `most_rated_album` / `most_reviewed_album` | `review_summaries` ordered by `rating_count` / `review_count` `DESC NULLS LAST LIMIT 1` |

`albumName()`/`songName()` (`:24-25`) spread manifest metadata (`title/artist/cover/code`) into each result; a manifest miss yields `{...null}` → the object carries only the numeric field.

The `total_plays`/`active_users` pairing is subtly inconsistent: totals come from the rollup while active users come from the raw log, so any rollup drift shows up as a mismatch between the two cards.

### GET /api/analytics/albums

**Admin.** Params: `?from= &to= &q= &sort= &page= &limit=`. Handler `:215-252`.

Per-album aggregate over `playback_events` where `album_id IS NOT NULL AND <range>`, `GROUP BY album_id`: `plays=COUNT(*)`, `listeners=COUNT(DISTINCT user_id)`, `seconds=SUM(listening_seconds)`, `avg_seconds=ROUND(AVG(listening_seconds),0)`, `avg_completion=ROUND(AVG(completion_pct),1)`, `last_played=MAX(started_at)`. A second query pulls **all** `review_summaries` rows for `target_type='album'` into a `Map` for the join.

`?q` is a case-insensitive **substring** filter applied in JS against title and artist (`:247`) — post-SQL, so it filters the manifest-resolved names the DB doesn't have.

Response: `{ total, page, limit, items[] }` where `total` is the **post-filter** count. **Pagination is in-memory** (`items.slice(offset, offset+limit)`, `:251`) — the full grouped result set is always fetched and sorted before slicing.

### GET /api/analytics/albums/:id

**Admin.** `400 invalid album id` if `!isUuid(id)` (`:260`). Handler `:258-286`. Three queries: album aggregate (adds `first_played=MIN(started_at)`), per-song breakdown (`GROUP BY song_id ORDER BY plays DESC`), and the album's `review_summaries` row. Returns the aggregate + manifest fields + `songs[]` + `most_played_song` (`songs[0]`) and `least_played_song` (last element).

**No range filter** — always all-time. Returns a zero-filled body rather than 404 for an unknown-but-valid UUID (`COUNT(*)` over no rows is 0).

### GET /api/analytics/songs

**Admin.** Same params as `/albums`. Handler `:291-324`. Adds over the album shape: `complete_plays=COUNT(*) FILTER (WHERE completed)`, `skips=COUNT(*) FILTER (WHERE skipped)`, `first_played=MIN(started_at)`, and a computed `partial_plays = plays - complete_plays`. `?q` matches title, album, **or** artist. Same in-memory sort/paginate.

### GET /api/analytics/songs/:id

**Admin.** `400 invalid song id`. Handler `:326-356`. Song aggregate + `review_summaries` + **`listeners_detail[]`** — a per-user history via `LEFT JOIN identity.users`, `GROUP BY pe.user_id, u.display_name ORDER BY plays DESC` **`LIMIT 200`** (`:343`). This is the one place a null display name is rendered as the string `'Deleted user'` (`:354`), which is why the join is `LEFT` here and `INNER` elsewhere — it survives `ON DELETE SET NULL` on `user_id`.

### GET /api/analytics/users

**Admin.** Params: `?q= &page= &limit=`. **No `from`/`to`.** Handler `:361-388`.

`identity.users u JOIN production.playback_events pe` (inner — **users with zero plays never appear**), `GROUP BY u.id, u.display_name, u.email ORDER BY plays DESC LIMIT $1 OFFSET $2`. Per user: `plays=COUNT(pe.id)`, `songs=COUNT(DISTINCT song_id)`, `albums=COUNT(DISTINCT album_id)`, `sessions=COUNT(DISTINCT session_id)`, `seconds=SUM(listening_seconds)`, `first_listen=MIN(started_at)`, `last_listen=MAX(started_at)`.

`?q` here is a real **SQL `ILIKE '%q%'`** on `display_name` only (`:363-365`) — unlike `/albums` and `/songs`, this filter runs in the database and does **not** cover email. This is the only read endpoint with true SQL pagination.

> **Inconsistency.** `total` comes from `COUNT(DISTINCT user_id) FROM playback_events` (`:380`) — computed **without the `q` filter**. Searching returns a correct `items[]` but a `total` for the unfiltered population, so client pagination over a search result will overcount pages.

### GET /api/analytics/users/:id

**Admin.** `400 invalid user id`; **`404 user not found`** if the user row is missing (`:394`) — the only read endpoint that 404s. Handler `:390-422`. Six queries.

Returns identity (`name/email/joined`), the same aggregate set as `/users`, plus:
- `avg_daily_minutes = (seconds/60)/days`, `avg_weekly_minutes = (seconds/60)/max(1, days/7)`, `avg_monthly_minutes = (seconds/60)/max(1, days/30)` — where `days = max(1, round((now - first_listen)/86400000))` (`:408`). **Tenure-normalized, not window-normalized**: a user active in one burst two years ago shows near-zero daily minutes.
- `favorite_artist` / `favorite_album` / `favorite_song` — top-1 by play count. `artistNameById` (`:424-429`) is a **linear scan over every manifest artist recomputing `artistUuid(slug)` per candidate** to invert the one-way UUIDv5, since there is no reverse map.
- `ratings_submitted` / `reviews_submitted` from `user_reviews WHERE reviewer_user_id=$1 AND deleted_at IS NULL` — note this **omits the `status='published'` filter** used elsewhere, so it counts pending/hidden rows too.

### GET /api/analytics/trends

**Admin.** Param `?days=` → `min(730, max(7, parseInt||90))` — clamped **7…730, default 90** (`:435`). Handler `:434-465`. Five queries.

| Series | Shape |
|---|---|
| `daily[]` | From `analytics_daily WHERE day >= CURRENT_DATE - $1`; `{day:'YYYY-MM-DD', plays, hours, completed, skipped}` |
| `dau[]` | Raw log, `GROUP BY (started_at AT TIME ZONE 'UTC')::date`, `COUNT(DISTINCT user_id)` — matches the `idx_pbe_day` expression index (`0012:54`) |
| `monthly[]` | `date_trunc('month', day)` over `analytics_daily`; **hard-coded 730-day window, ignores `?days`** (`:448`) |
| `peak_hours[]` | `EXTRACT(hour FROM started_at)` — **all time, ignores `?days`**, and in the **server's TZ**, not UTC |
| `peak_days[]` | `EXTRACT(dow FROM started_at)`, 0=Sunday — also all-time |

So `?days` governs only `daily` and `dau`. Note `dau` uses `($1 || ' days')::interval` string-building on a bound int while `daily` uses `CURRENT_DATE - $1::int` — two different idioms for the same window, and the `dau` interval is relative to `NOW()` while `daily` is relative to `CURRENT_DATE`, so their boundaries differ by up to a day.

### GET /api/analytics/ratings

**Admin.** No params. Handler `:470-503`. Universe throughout: `user_reviews WHERE deleted_at IS NULL AND status='published'`.

- `total_album_ratings` / `total_song_ratings` — `COUNT(*) FILTER (WHERE target_type=…)`.
- `average_rating` — `AVG(stars)` across both types, 2 dp.
- `raters` — `COUNT(DISTINCT reviewer_user_id)`.
- `distribution` — always a full `{1..5}` object, pre-zeroed then overlaid (`:482-483`), so absent star values render 0 rather than missing.
- Five top-10 lists from `review_summaries WHERE rating_count>0`: `highest_rated_albums` (`avg_stars DESC`), `lowest_rated_albums` (`ASC`), `highest_rated_songs` (`DESC`), `most_rated_albums` / `most_rated_songs` (`rating_count DESC`). All tie-break on `rating_count DESC`. These five run under `Promise.all` (`:492`) — the only parallelized read.

**No minimum-ratings threshold:** a single 5-star rating tops `highest_rated_albums`, and a single 1-star tops the lowest list.

### GET /api/analytics/reviews

**Admin.** No params. Handler `:508-535`. Universe: `deleted_at IS NULL` (**note: not restricted to published** for the totals query, unlike `/ratings`).

- `total_album_reviews` / `total_song_reviews` — non-empty-body counts per type.
- `reviewers` — `COUNT(DISTINCT reviewer_user_id) FILTER (non-empty body)`.
- `avg_review_length` — `ROUND(AVG(char_length(body)),0)`, `|| 0` if null.
- `pending_moderation` — `COUNT(*) FILTER (WHERE status IN ('pending','hidden'))`.
- `most_reviewed_album` / `most_reviewed_song` — top-1 by `review_count` from `review_summaries`.
- `latest[]` — 10 most recent **published, non-empty-body** reviews joined to `identity.users`, each spread with the resolved album/song name and returning `{target_type, stars, title, body, by, created_at}`. Full review bodies (up to 5000 chars, per `0010_reviews.sql:75`) ride in this response.

### GET /api/analytics/export

**Admin.** Params: `?kind=albums|songs|users` (whitelist-validated, **silently defaults to `albums`** on anything else, `:549`), plus `?from=`/`?to=`.

**Format:** CSV via a local `toCsv` (`:540-546`) that quotes any value containing `"`, `,`, or newline and doubles inner quotes. Joined with `\n` (LF, not CRLF). Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="jubileepraise-analytics-<kind>.csv"`. Status `200`.

| kind | Columns | Range filter? |
|---|---|---|
| `albums` | Album, Artist, Plays, Unique Listeners, Listening Hours (2 dp), Last Played (ISO) | ✅ |
| `songs` | Song, Album, Artist, Plays, Unique Listeners, Listening Hours, Avg Completion % | ✅ |
| `users` | User, **Email**, Plays, Distinct Songs, Listening Hours | ❌ — the users query takes no `range()` params (`:565-567`) |

**No `LIMIT` on any of the three queries and no streaming** — the entire result set is materialized into a JS array, then a single concatenated string, then `res.send()`. With `playback_events` at scale this is the endpoint most likely to blow memory. It is also the only endpoint that emits user **email addresses** in bulk (the `/users` JSON read includes email too, but paginated at ≤200).

Two smaller notes: no BOM is emitted, so Excel may mis-render non-ASCII titles despite the client's `.xls` rename path (`analytics.ts:96-109`); and CSV injection is not mitigated — a title beginning `=`/`+`/`-`/`@` passes through unescaped, which matters because these files are opened in Excel by design.

### Underlying table shapes

**`production.playback_events`** (`0012_analytics.sql:26-60`) — `id BIGSERIAL PK`, `user_id UUID REFERENCES identity.users ON DELETE SET NULL`, `session_id TEXT`, `album_id/song_id/artist_id UUID` (**no FKs** — they're manifest-derived, not catalog rows), `device_type/browser/os TEXT`, `ip_address INET`, `source production.playback_source NOT NULL DEFAULT 'other'`, `started_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ`, `listening_seconds INTEGER NOT NULL DEFAULT 0 CHECK >= 0`, `duration_seconds INTEGER CHECK NULL OR >= 0`, `completion_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK 0..100`, `completed`/`skipped BOOLEAN NOT NULL DEFAULT FALSE`, `created_at TIMESTAMPTZ DEFAULT NOW()`.

Six indexes: `(song_id, created_at DESC)`, `(album_id, created_at DESC)`, `(artist_id)`, `(user_id, created_at DESC)`, `(created_at)`, and the expression index `(((started_at AT TIME ZONE 'UTC')::date))`. `REVOKE UPDATE, DELETE, TRUNCATE … FROM PUBLIC` enforces append-only.

> **Index/query mismatch.** The composite indexes lead with `created_at`, but every dashboard query filters and sorts on **`started_at`** (the `range()` default column, and `MIN`/`MAX`/`EXTRACT` throughout). Only the expression index covers `started_at`, and only for exact-date equality — the `?from`/`?to` range scans have no supporting index.

The header comment (`0012:9-12`) notes the table is *designed* for monthly RANGE partitioning on `created_at` but ships unpartitioned, deferred as non-breaking because all access is via aggregates.

**`production.analytics_daily`** (`0012:65-72`) — `day DATE PK`, `plays INTEGER`, `listening_seconds BIGINT`, `completed_plays INTEGER`, `skipped_plays INTEGER`, `updated_at TIMESTAMPTZ`. All `NOT NULL DEFAULT 0`. Pure incremental cache, only ever written by the `/play` upsert; there is **no rebuild/reconcile job**, so if it ever diverges from the log there is no path back.

**`production.now_playing`** (`0018_now_playing.sql:8-17`) — `session_id TEXT PK`, `user_id UUID REFERENCES identity.users ON DELETE CASCADE`, `song_id UUID`, `ip_address INET`, `started_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. One index on `(updated_at DESC)`, which serves the 45s liveness filter.

**`production.user_reviews`** / **`production.review_summaries`** (`0010_reviews.sql:67-107`, `:200-220`) — read-only from this subsystem's perspective. `user_reviews`: `stars SMALLINT CHECK 1..5`, `title ≤150`, `body ≤5000`, `status production.review_status DEFAULT 'published'`, soft-delete via `deleted_at`, unique `(target_type, target_id, reviewer_user_id)`. `review_summaries` is a trigger-maintained denormalization keyed `(target_type, target_id)` with `avg_stars NUMERIC(3,2)`, `rating_count` (every active published row) and `review_count` (those with a non-empty body).

### `docs/ANALYTICS_API.md` — accuracy assessment

**Broadly accurate but materially incomplete.** Everything it states is correct: the `/play` contract, the server-side fill of `album_id`/`artist_id`/device/IP, the `201 {"recorded": true}`, the derived completion/`completed`/`skipped`, the admin-role gate, the audit note, the per-endpoint summaries, the `sort` enum, and the `401/403/400` error list all match the code.

Gaps and drift:

1. **Both `/now-playing` endpoints are entirely undocumented** — the doc predates migration 0018. This is the biggest omission: an undocumented pair of write endpoints open to every authenticated user.
2. **`GET /api/admin/active-listeners` is not mentioned**, which is reasonable since it lives under a different mount, but nothing else documents the presence model either.
3. **No pagination limits stated** — `limit` is capped at 200, defaults to 25; `?days` is clamped 7–730 with a default of 90. None of this appears.
4. **`/users` is listed with `?q=` but not the `from`/`to` gap** — the doc's blanket "All filters are optional; `from`/`to` … filtering on the play's `started_at`" implies range support on `/users`, `/users/:id`, `/albums/:id`, `/songs/:id`, and `export?kind=users`, **none of which accept it**.
5. **`/songs/:id` `listeners_detail[]` is bolded as a feature but its `LIMIT 200` truncation is not mentioned.**
6. The error list omits `429` (rate limit on `/play`) and `404` (only `/users/:id`), and it doesn't note that a malformed `from`/`to` yields **500**, not 400.
7. The `/overview` row doesn't mention the `available_*`/`studio_*` ready-vs-studio split, which the code comments call out explicitly (`analytics.js:180-182`).

Treat it as a correct-but-partial quickstart. The `/now-playing` heartbeat contract (required non-empty `session_id`, 25s cadence, 45s server window) is the piece a client integrator most needs and is completely absent.

---

## 9. Subscriptions, Billing & Quota

### Mounting & request pipeline

`src/index.js` mounts three routers, and the ordering is load-bearing:

| Mount | Router | Middleware chain | index.js |
|---|---|---|---|
| `/api/billing/webhook` **and** `/api/subscriptions/webhook` | `routes/subscriptionsWebhook.js` | `express.raw({ type: '*/*' })` → router. **No** JSON parser, **no** `attachSession`, **no** rate limiter. | `index.js:69-73` |
| `/api/subscriptions` | `routes/subscriptions.js` | `express.json({limit:'256kb'})` → `attachSession` → `writeLimiter` | `index.js:75-76,130` |
| `/api/listening` | `routes/listening.js` | same as above | `index.js:131` |

`writeLimiter` = 120 requests / 60s per IP, `skip: req.method === 'GET' || 'HEAD'` (`index.js:80-83`) — so only the POSTs are limited. The webhook is mounted **above** `express.json` and therefore also above every limiter and the session resolver.

**Auth model.** `requireAuth` (`middleware/rbac.js:25-28`) throws `HttpError(401,'Authentication required')` when `req.auth` is absent. `req.auth` is populated by `attachSession` from a stateless `Authorization: Bearer <access token>`. No RBAC role is required anywhere in this subsystem — every endpoint is plain "any signed-in user", except `GET /plans` which is fully public.

**Error envelope** (`middleware/error.js:12-23`): `{ error: <code>, message: <string>, ...extra }` where code maps `400→"error"`, `401→"unauthorized"`, `403→"forbidden"`, `404→"not_found"`, `409→"conflict"`, `422→"unprocessable"`, `503→"unavailable"`. **502 is not in the map**, so gateway-failure responses come back as `{"error":"error","message":"..."}` with HTTP 502. Zod failures produce `400 {error:"error", message:"Validation failed", issues:[{path,message}]}` (`middleware/validate.js:9-12`).

Schemas are plain `z.object(...)` — **not** `.strict()` — so unknown body keys are silently stripped, and `req.body` is replaced by the parsed value (`validate.js:13`).

### The provider-adapter abstraction

#### Selection

`services/payments/index.js:26-39` — a **module-level memoized singleton** (`cached`), resolved on first call from `config.payments.provider`:

```js
provider: (process.env.PAYMENT_PROVIDER || (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock')).toLowerCase()
```
(`config.js:133`)

So: explicit `PAYMENT_PROVIDER` wins; otherwise the mere presence of `STRIPE_SECRET_KEY` flips the whole system to Stripe; otherwise `mock`. An unrecognized name logs a warning and **falls back to mock** (`index.js:33-36`) rather than failing closed. Because the provider is cached at first use, changing env at runtime has no effect without a restart.

#### Interface contract

Declared as a comment block at `services/payments/index.js:12-23`; both adapters implement it exactly:

| Member | Stripe | Mock |
|---|---|---|
| `id` | `'stripe'` | `'mock'` |
| `autoActivates` | `false` — activation arrives by webhook/confirm | `true` — activate inline at checkout |
| `isConfigured()` | `!!STRIPE_SECRET_KEY` | always `true` |
| `createCheckoutSession({user,plan,successUrl,cancelUrl,customerId})` | real hosted Checkout Session | synthesized ids, `url = successUrl` |
| `retrieveCheckoutSession(id)` | `sessions.retrieve` with `expand:['subscription','invoice','subscription.latest_invoice']` | returns `null` |
| `cancelSubscription({providerSubscriptionId, atPeriodEnd})` | `subscriptions.update({cancel_at_period_end:true})` or `subscriptions.cancel()` | `{ok:true}` |
| `reactivateSubscription({providerSubscriptionId})` | `update({cancel_at_period_end:false})` | `{ok:true}` |
| `changeSubscription({providerSubscriptionId,newPlan})` | swap item price, `proration_behavior:'create_prorations'` | `{ok:true}` |
| `createRefund({providerPaymentIntentId,amountCents})` | `refunds.create` | fake refund id |
| `getBillingPortalUrl({customerId,returnUrl})` | `billingPortal.sessions.create(...).url` | echoes `returnUrl` |
| `verifyWebhook({rawBody,signature})` | `stripe.webhooks.constructEvent` — throws on bad sig | **accepts anything**, returns `{type:'mock.noop'}` |

**`createRefund` is dead code** — no caller anywhere in `src/` (only the two adapter definitions and the interface comment). `payment_records.refunded_cents` is likewise only ever *read* (in `/billing`), never written. Refunds are currently a gateway-side-only operation.

#### Stripe adapter specifics

- The `stripe` SDK is **lazy-imported** (`stripe.js:24`) so the API boots without the dependency when running on mock. `getStripe()` throws `STRIPE_UNCONFIGURED` if the secret key is missing; the client is pinned to `apiVersion: '2024-06-20'` (`stripe.js:26`).
- **Price resolution** (`stripe.js:136-141`): env override first — `STRIPE_PRICE_INDIVIDUAL` for `plan.code === 'individual'`, `STRIPE_PRICE_FAMILY` for `'family'` — else the DB column `subscription_plans.provider_price_id`. Any other plan code can *only* use the DB column. Missing price throws `STRIPE_NO_PRICE`, which surfaces as a **500** from `/checkout` (it is not caught into an `HttpError`) but as a **502** from `/change` (which does wrap it, `subscriptions.js:265-268`).
- Checkout session is created with `mode:'subscription'`, `allow_promotion_codes:true`, `client_reference_id: user.id`, and `plan_code`/`user_id` metadata on **both** the session and `subscription_data.metadata` so the linkage survives into `customer.subscription.*` events (`stripe.js:44-56`). `success_url` gets `session_id={CHECKOUT_SESSION_ID}` appended with correct `?`/`&` handling (`stripe.js:47`).
- `customer` is reused when we already have one; otherwise `customer_email` is prefilled (`stripe.js:49-50`).

#### Mock adapter specifics

`mock.js:19-34` returns `url = successUrl` (no hosted page) plus synthesized `mock_cs_*` / `mock_cus_*` / `mock_sub_*` / `mock_in_*` / `mock_pi_*` ids. The customer id is a **deterministic** sha1 of the user id (`mock.js:21`), so repeat checkouts by the same user reuse the same customer reference. Because `autoActivates` is true, `/checkout` performs the full `activateSubscription` inline and `/confirm` degenerates into a read (`subscriptions.js:119-122`).

> **Security note.** The webhook route is mounted unconditionally, so on a mock deployment `POST /api/billing/webhook` accepts **any unsigned payload** — but `handleEvent` receives `{type:'mock.noop'}` and falls to the `default:` debug-log branch (`subscriptionsWebhook.js:189-191`), mutating nothing.

### Plans catalog

#### `GET /api/subscriptions/plans` — public, no auth

`subscriptions.js:34-36` → `listPlans()` (`services/subscriptions.js:17-24`).

- SQL: `SELECT * FROM production.subscription_plans WHERE is_active = TRUE ORDER BY sort_order, price_cents`. (The `includeInactive` option exists but no route passes it.)
- Each row goes through `planView()` (`services/subscriptions.js:36-55`).

**Response** `200`:
```json
{"plans":[{"id","code","name","tagline","description","price_cents","price_display","currency",
 "billing_interval","max_members","daily_song_limit","preview_seconds","is_paid","highlighted",
 "cta_label","features":[]}]}
```
`price_display` is `"Free"` when `price_cents === 0`, else `"$X.XX"`. `daily_song_limit: null` means unlimited. `features` is coerced to `[]` if not an array.

**Seeded catalog** (migration `0014` lines 304-322, amended by `0025`):

| code | name | price_cents | interval | max_members | daily_song_limit | preview_seconds | is_paid | highlighted | sort_order |
|---|---|---|---|---|---|---|---|---|---|
| `free` | Free | 0 | month | 1 | **36** (was 7) | 60 | false | false | 0 |
| `individual` | Individual | **395** ($3.95) | month | 1 | `NULL` | 60 | true | **true** | 1 |
| `family` | Family | **795** ($7.95) | month | **6** | `NULL` | 60 | true | false | 2 |

### My entitlement

#### `GET /api/subscriptions/me` — auth

`subscriptions.js:39-47`. Calls `getEntitlement(userId)` + `getActiveSubscription(userId)`.

**`getEntitlement`** (`services/subscriptions.js:61-90`) resolves in three ordered steps:

1. **Own subscription** — `getActiveSubscription()`; accepted only if `status ∈ ENTITLED_STATUSES = ['trialing','active','past_due']` (`:14`) **and** `notExpired()` (`:104-106`: `current_period_end` null or in the future). `source` = `'family'` if `plan_code==='family'` else `'individual'`.
2. **Family membership** — joins `family_members → family_groups → subscriptions → subscription_plans` where `fm.status='active'` and `s.status = ANY(ENTITLED_STATUSES)`, ordered `s.current_period_end DESC NULLS LAST LIMIT 1` (`:70-85`). `source='family'`.
3. **Free fallback** — `getPlanByCode('free')`, `source='free'`, `status='free'`.

**Response** `200`:
```json
{"entitlement":{"isPaid":bool,"status":string,"source":"individual|family|free",
  "plan":PlanView|null,"subscription":SubscriptionView|null,
  "dailySongLimit":number|null,"previewSeconds":number},
 "subscription":SubscriptionView|null}
```

Two subtleties worth flagging:

- `dailySongLimit: isPaid ? null : (plan?.daily_song_limit ?? 36)` (`services/subscriptions.js:99`) — the **`36` fallback is hard-coded in JS**, duplicating migration `0025`. `previewSeconds` falls back to `60` (`:100`).
- `getActiveSubscription` (`:109-121`) selects on the **wider** status set `['trialing','active','past_due','payment_failed','suspended']`. So a `payment_failed` or `suspended` user gets a non-null `subscription` in the top-level field while `entitlement.isPaid` is `false` and `source` is `"free"` — the client must key entitlement off `entitlement`, not off the presence of `subscription`.

`subscriptionView` (`:137-154`) exposes: `id, status, plan_code, plan_name, provider, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, trial_end, started_at, next_billing_amount ("$X.XX" or null), reference (provider_subscription_id || id)`.

### Checkout

#### `POST /api/subscriptions/checkout` — auth

Body: `{ plan_code: z.string().min(1).max(40) }` — **required** (`subscriptions.js:50-52`).

Handler (`subscriptions.js:54-105`), step by step:

1. `getPlanByCode(plan_code)` → **404** `"Unknown plan"` if missing **or** `!is_active`.
2. **400** `"The Free plan does not require checkout"` if `!plan.is_paid`.
3. `getEntitlement()` → **409** ``You are already subscribed to the ${plan.name} plan`` if `ent.isPaid && ent.subscription?.plan_code === plan.code`. (Note this compares against `entitlement.subscription`, so a family *member* is treated as already-subscribed to `family`.)
4. **503** `"Payments are not configured..."` if `!provider.isConfigured()`.
5. Builds `successUrl = config.webBaseUrl + config.payments.successPath` (default `/account/subscription?checkout=success`) and `cancelUrl = config.webBaseUrl + config.payments.cancelPath` (default `/subscription?checkout=cancelled`) — `config.js:136-137`.
6. `provider.createCheckoutSession({user, plan, successUrl, cancelUrl, customerId: existing?.provider_customer_id || null})`.
7. **INSERT `production.subscription_transactions`** — `type='checkout'`, `provider_ref = session.sessionId`, `amount_cents = plan.price_cents`, `status = provider.autoActivates ? 'succeeded' : 'pending'`, `metadata = {plan: code}` (`subscriptions.js:81-87`).
8. If `provider.autoActivates` (mock only): `activateSubscription({... periodStart: now, periodEnd: monthFrom(now), status:'active', actor:'user', invoiceId/invoiceUrl/paymentIntentId from the session ...})` and return `{url, activated:true, provider}`.
9. Otherwise return `{url, activated:false, provider}`.

**Tables touched:** `subscription_plans` (r), `subscriptions` (r; +w via activate), `subscription_transactions` (w), and on mock also `payment_records`, `subscription_renewals`, `subscription_history`, `family_groups`, `family_members`, `subscription_notifications`.

> **Known wart.** In Stripe mode the `type='checkout'` ledger row is written `status='pending'` and **is never updated**. Successful activation inserts a *separate* `type='activation'` row rather than settling the checkout row, so `subscription_transactions` accumulates permanently-pending checkout rows.

#### `POST /api/subscriptions/confirm` — auth

Body: `{ session_id: z.string().min(1).max(200) }` (`subscriptions.js:112`).

This is the success-page verification path — it makes activation work **without a webhook tunnel** locally and acts as a production safety net. Handler (`subscriptions.js:114-160`):

1. If `provider.autoActivates` → return `{activated: !!live, subscription}` from the DB; no gateway call.
2. `provider.retrieveCheckoutSession(session_id)` → **404** `"Checkout session not found"` if falsy.
3. **Ownership check:** `ref = session.client_reference_id || session.metadata?.user_id`; if `ref` is truthy and `!== user.id` → **403** `"This checkout belongs to a different account"` (`:126-127`). Note the guard is skipped entirely when both refs are absent.
4. `paid = session.payment_status === 'paid' || session.status === 'complete'`; if not → `200 {activated:false, pending:true}`.
5. **Idempotency:** `findActivatedByProviderSub(user.id, providerSubscriptionId)` (`services/subscriptions.js:125-135`) — looks for a row with that `provider_subscription_id` in status `['trialing','active','past_due']`. If found → `200 {activated:true, subscription}` with no writes. This is what makes confirm and the webhook mutually safe.
6. `plan = getPlanByCode(session.metadata.plan_code)` → **422** `"Could not resolve the plan for this checkout"` if unresolvable.
7. Period derived from the **expanded** subscription object: `current_period_start/end * 1000`, falling back to `now` / `monthFrom(now)` (`:146-147`).
8. `activateSubscription({... amountCents: session.amount_total ?? plan.price_cents, currency: session.currency || plan.currency, invoiceId, invoiceUrl: invoice.hosted_invoice_url, invoicePdfUrl: invoice.invoice_pdf, actor:'user' ...})`.
9. Re-reads and returns `{activated:true, subscription}`.

### Activation core — `activateSubscription`

`services/subscriptions.js:159-290`. Shared by mock checkout, `/confirm`, and the webhook. Everything below runs inside one `withTransaction`:

1. Look for an existing row in `['trialing','active','past_due','payment_failed','suspended']` for the user, newest first.
2. **If found → UPDATE in place** (`:179-188`): sets `plan_id, status, provider`, `provider_customer_id = COALESCE($5, provider_customer_id)`, `provider_subscription_id = COALESCE($6, ...)` (so a null from the gateway never wipes an existing ref), new period bounds, and **resets `cancel_at_period_end=FALSE, cancelled_at=NULL`**. Captures `fromStatus` + `fromPlanCode`.
3. **Else INSERT** a new `production.subscriptions` row.
   This upsert-in-place design is mandated by the partial unique index `uq_subscriptions_one_live_per_user ON subscriptions(user_id) WHERE status IN ('trialing','active','past_due','payment_failed','suspended')` (migration `0014:112-114`) — **at most one live subscription per user**.
4. If `plan.code === 'family'`: upsert `family_groups` (`ON CONFLICT (subscription_id) DO UPDATE SET max_members`) and upsert the owner into `family_members` with `is_owner=TRUE, status='active', removed_at=NULL`.
5. **Payment/renewal records, guarded on invoice id** (`:222-242`): if `amountCents != null` and no existing `payment_records` row has this `provider_invoice_id`, insert `payment_records` (`status='succeeded'`, `description = "${plan.name} plan — ${plan.billing_interval}ly"`, `paid_at=NOW()`) plus a `subscription_renewals` row (`status='succeeded'`) linked by `payment_record_id`.
   > ⚠️ **Asymmetry:** this dedupe query checks *any* status (`:224`), whereas the webhook's dedupe checks `status='succeeded'` only (`subscriptionsWebhook.js:89`). A prior `failed` row for the same invoice will therefore suppress the activation's payment record but not the webhook's.
6. INSERT `subscription_transactions` `type='activation'`, `provider_ref = providerSubscriptionId || invoiceId`.
7. INSERT `subscription_history` with `event = fromStatus ? 'plan_changed' : 'activated'`, plus `from_status/to_status/from_plan/to_plan/actor`, and `actor_user_id` only when `actor === 'user'` (`:256`).
8. **After** the transaction commits, best-effort `notify()` with an email — type `plan_changed` if the plan actually changed, else `subscription_activated`.

### Lifecycle mutations

#### `POST /api/subscriptions/cancel` — auth

Body: `{ immediate?: z.boolean().optional() }` (`subscriptions.js:163`). Absent ⇒ falsy ⇒ **cancel at period end** (the default).

`subscriptions.js:165-217`:

1. `getActiveSubscription()` → **404** `"No active subscription to cancel"`.
2. If `sub.provider_subscription_id` exists, `provider.cancelSubscription({providerSubscriptionId, atPeriodEnd: !immediate})`. Any throw → logged and **502** `"Could not cancel with the payment provider. Please try again."` — the local DB is left untouched, so the operation is all-or-nothing against the gateway.
3. In a transaction:
   - `immediate`: `UPDATE subscriptions SET status='cancelled', cancel_at_period_end=FALSE, cancelled_at=NOW()`.
   - otherwise: `UPDATE subscriptions SET cancel_at_period_end=TRUE, cancelled_at=NOW()` — **status stays `active`**, so entitlement continues until `current_period_end`. (`cancelled_at` is set on the *at-period-end* path too, meaning it records "when cancellation was requested", not when access ended.)
   - INSERT `subscription_transactions` `type='cancellation'`, `status='succeeded'`, `metadata={immediate}`.
   - `transition(...)` → `subscription_history` `event='cancelled'`, `to_status = immediate ? 'cancelled' : sub.status`, `actor='user'`.
4. `notify({type:'cancelled'})` + email; the non-immediate copy interpolates `fmtDate(current_period_end)` (`en-US`, long month).
5. `200 {subscription: viewLive(updated, sub)}` — `viewLive` (`subscriptions.js:390-392`) re-attaches `plan_code/plan_name/price_cents` from the pre-update row, because `UPDATE ... RETURNING *` lacks the joined plan columns.

#### `POST /api/subscriptions/reactivate` — auth

**No body schema, no validation** — the body is ignored entirely (`subscriptions.js:220`).

1. `getActiveSubscription()` → **404** `"No subscription to reactivate"`.
2. **409** `"Subscription is already active and renewing"` if `!cancel_at_period_end && status==='active'`.
3. `provider.reactivateSubscription(...)` if a gateway ref exists; failure → **502** `"Could not reactivate with the payment provider."`.
4. Transaction: `UPDATE subscriptions SET status='active', cancel_at_period_end=FALSE, cancelled_at=NULL`; `transition(event='reactivated', to_status='active', actor='user')`.
5. `notify({type:'reactivated'})` — **in-app only, no email**.
6. `200 {subscription: viewLive(...)}`.

> Because step 2 only blocks the `active && !cancel_at_period_end` case, this endpoint doubles as a **manual un-suspend / un-past_due**: a `past_due`, `payment_failed`, or `suspended` subscription will be forced to `status='active'` locally even though nothing was actually paid.

#### `POST /api/subscriptions/change` — auth

Body: `{ plan_code: z.string().min(1).max(40) }` (`subscriptions.js:250`).

`subscriptions.js:252-331`:

1. `getActiveSubscription()` → **400** `"No active subscription — use checkout to subscribe"`.
2. `getPlanByCode()` → **404** `"Unknown plan"` if missing, `!is_active`, **or `!is_paid`** — you cannot "change" down to `free`; that is what cancel is for.
3. **409** ``Already on the ${newPlan.name} plan`` if same code.
4. `provider.changeSubscription({providerSubscriptionId, newPlan})` → on Stripe this retrieves the subscription, swaps `items[0].price` to the new price id, sets **`proration_behavior: 'create_prorations'`**, and writes `metadata.plan_code` (`stripe.js:95-101`). Proration is entirely Stripe's; the API computes nothing. Failure → **502**.
5. Transaction:
   - `UPDATE subscriptions SET plan_id=$2` — **only the plan id**. Period bounds, status, `cancel_at_period_end` are untouched; the authoritative period correction arrives later via `customer.subscription.updated`.
   - **Upgrading into `family`:** upsert `family_groups` + owner `family_members` row (same shape as activation).
   - **Downgrading out of `family`:** `UPDATE family_members SET status='removed', removed_at=NOW()` for all `is_owner=FALSE AND status='active'` rows of that group (`subscriptions.js:289-294`) — the owner row is deliberately left active, and the `family_groups` row is not deleted.
   - INSERT `subscription_transactions` `type='plan_change'`, `metadata={from, to}`.
   - INSERT `subscription_history` `event='plan_changed'` with `from_status=to_status=sub.status` (note `$3` is bound twice, `:303`) and `from_plan/to_plan`.
6. `notify({type:'plan_changed'})` + email containing rows New plan / Price / Renews.
7. Re-reads and returns `200 {subscription: subscriptionView(live)}`.

#### `POST /api/subscriptions/portal` — auth

No body. `subscriptions.js:377-386`:

1. `getActiveSubscription()`; **404** `"No billing account to manage"` if there is no subscription **or** no `provider_customer_id`.
2. `provider.getBillingPortalUrl({customerId, returnUrl: config.webBaseUrl + '/account/subscription'})`.
3. `200 {url}`. On mock this simply echoes the return URL. Stripe SDK errors are **not** wrapped → 500.

### Billing history

#### `GET /api/subscriptions/billing` — auth

`subscriptions.js:334-356`. Two independent queries, no pagination parameters:

- **payments** — `production.payment_records WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, selecting `id, amount_cents, currency, status, description, invoice_url, invoice_pdf_url, refunded_cents, provider_invoice_id, provider_payment_intent, paid_at, created_at`. Each row is augmented with `amount_display: "$X.XX"`.
- **renewals** — `production.subscription_renewals r JOIN subscriptions s ON s.id=r.subscription_id WHERE s.user_id=$1 ORDER BY r.period_end DESC LIMIT 100`, selecting `id, period_start, period_end, amount_cents, currency, status, created_at`.

**Invoice PDF handling:** migration `0016` adds `payment_records.invoice_pdf_url` alongside the pre-existing `invoice_url`. These are the two distinct Stripe links — `hosted_invoice_url` (a web page, → `invoice_url`) and `invoice_pdf` (a direct `.pdf`, → `invoice_pdf_url`). Both are **references only**; no document is stored or proxied, and the PDF is served by Stripe under its own signed URL. They are populated in exactly three places: `activateSubscription` (`services/subscriptions.js:230-233`, from the expanded invoice on `/confirm`), the `invoice.paid` handler (`subscriptionsWebhook.js:96-98`), and the `invoice.payment_failed` handler (`:145-147`). The webhook `checkout.session.completed` path passes `invoiceId` but **no URLs**, so a subscription activated purely by webhook has a payment record with `invoice_url = NULL` until the first renewal.

### Notifications

#### `GET /api/subscriptions/notifications` — auth
`subscriptions.js:359-366`. `SELECT id, type, title, body, read_at, created_at FROM production.subscription_notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`. Returns `{notifications:[...]}`. Note `metadata` is deliberately **not** exposed.

#### `POST /api/subscriptions/notifications/read` — auth
`subscriptions.js:368-374`. No body validation. `UPDATE ... SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL` — marks **all** unread as read; there is no per-id variant. Returns `{ok:true}`.

#### The notification service

`services/notifications.js`. `notify({userId, type, title, body, metadata, email})`:
- Inserts one `subscription_notifications` row with `email_sent = !!email` — set **optimistically before the send is attempted**, so the flag means "an email was intended", not "an email was delivered".
- Both the insert and `sendSubscriptionEmail` are wrapped in `try/catch` with `logger.warn` only (`:45-47`, `:52-54`) — **a notification failure can never roll back a billing state change**. Every caller invokes `notify` *outside* the enclosing transaction.
- `nameParts(user)` (`:13-16`) splits `user.displayName` for greetings, returning empty strings so callers fall back to impersonal copy.
- `TEMPLATES` (`:19-32`) supplies default titles for: `subscription_activated, payment_succeeded, payment_failed, renewal_upcoming, renewed, expired, cancelled, reactivated, plan_changed, family_invite_sent, family_invite_accepted, family_member_removed`.

Emitted in practice:

| Event | type | Email? | Source |
|---|---|---|---|
| Activation / first payment | `subscription_activated` | ✅ plan/price/renews rows | `services/subscriptions.js:266-286` |
| Activation that changed plan | `plan_changed` | ✅ | same call site |
| Explicit plan change | `plan_changed` | ✅ | `routes/subscriptions.js:310-327` |
| Cancel (either mode) | `cancelled` | ✅ copy branches on `immediate` | `routes/subscriptions.js:198-214` |
| Reactivate | `reactivated` | ❌ in-app only | `routes/subscriptions.js:245` |
| Renewal paid | `renewed` | ✅ amount / renewed-on / next-renewal + invoice link in `note` | `subscriptionsWebhook.js:119-136` |
| Renewal charge failed | `payment_failed` | ✅ "Action needed" | `subscriptionsWebhook.js:151-161` |
| Gateway subscription deleted | `expired` | ❌ in-app only | `subscriptionsWebhook.js:185` |

`payment_succeeded`, `renewal_upcoming`, and all three `family_*` templates are **defined but never emitted** — there is no upcoming-renewal reminder job.

### The webhook

#### `POST /api/billing/webhook` and `POST /api/subscriptions/webhook` — signed, no session

`/api/billing/webhook` is the URL to configure in Stripe; `/api/subscriptions/webhook` is a back-compat alias for the identical handler (`index.js:67-72`).

**Why pre-JSON raw body:** Stripe signs the *exact bytes* of the request. `express.json()` consumes the stream and leaves only a parsed object, and re-serializing it (key order, whitespace, unicode escaping) will not reproduce the signed payload — signature verification would fail 100% of the time. So the raw parser is mounted at `index.js:71` with `type: '*/*'` (not `application/json`) so the body is captured as a `Buffer` regardless of the declared content type, and it is registered **above** `app.use(express.json(...))` at `index.js:75`. Because Express matches middleware in registration order and these are path-scoped, only these two paths bypass JSON parsing; everything else still gets a parsed body. The webhook also sits above `attachSession` and above `writeLimiter` — a gateway retry storm is never rate-limited away.

**Signature verification** (`subscriptionsWebhook.js:26-34`): `provider.verifyWebhook({rawBody: req.body /* Buffer */, signature: req.get('stripe-signature')})` → `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` (`stripe.js:130`). A missing `STRIPE_WEBHOOK_SECRET` throws `STRIPE_NO_WEBHOOK_SECRET` — which is caught by the same handler, so an unconfigured deployment answers **400 `{error:'invalid_signature'}`** to every event rather than crashing. Any verification failure → `logger.warn` + **400**.

**Retry semantics** (`:36-44`): `handleEvent` throwing is logged and answered **500 `{error:'handler_error'}`** deliberately, so Stripe retries with backoff. Success → **200 `{received:true}`**.

#### Handled events

| Stripe event | Lookup | Mutations |
|---|---|---|
| `checkout.session.completed` | `client_reference_id \|\| metadata.user_id` + `metadata.plan_code` | Returns early (warn-logged) if either ref is missing, or if the plan code is unknown. **Idempotency:** returns if `findActivatedByProviderSub(userId, obj.subscription)` hits. Otherwise loads the user and calls `activateSubscription({provider:'stripe', periodStart: now, periodEnd: monthFrom(now), status:'active', actor:'webhook', amountCents: obj.amount_total ?? plan.price_cents, invoiceId: obj.invoice})` (`:50-69`). Note the period is derived from **wall-clock now + 1 month**, not from the Stripe subscription object. |
| `invoice.paid` **and** `invoice.payment_succeeded` | `subByProviderId(obj.subscription)` | Both event names fall through to one block (`:71-72`). Always runs the idempotent period sync: `UPDATE subscriptions SET status='active', current_period_end=$2` using `obj.lines.data[0].period.end * 1000`, else `monthFrom(now)`. Then, **guarded on `provider_invoice_id` + `status='succeeded'`** (`:87-93`) — inserts `payment_records` (succeeded, `description='Subscription renewal'`, `invoice_url`, `invoice_pdf_url`, `paid_at=NOW()`), `subscription_renewals` (succeeded, `period_start=NOW()`), `subscription_transactions` (`type='renewal'`), `subscription_history` (`event='renewed'`, `actor='webhook'`), and the `renewed` notification+email. |
| `invoice.payment_failed` | `subByProviderId(obj.subscription)` | `UPDATE subscriptions SET status='past_due'`; INSERT `payment_records` with `status='failed'`, `amount_cents = obj.amount_due ?? 0`, `description='Failed renewal charge'`; `payment_failed` notification + "Action needed" email (`:140-163`). No dedupe guard — repeated failures append rows. |
| `customer.subscription.updated` | `subByProviderId(obj.id)` | `UPDATE subscriptions SET status=mapStripeStatus(obj.status), plan_id=<from obj.metadata.plan_code if resolvable, else unchanged>, current_period_end=obj.current_period_end*1000, cancel_at_period_end=!!obj.cancel_at_period_end` (`:165-179`). This is the channel through which **Stripe-portal-initiated** cancels/plan changes are mirrored back. |
| `customer.subscription.deleted` | `subByProviderId(obj.id)` | `UPDATE subscriptions SET status='cancelled', cancelled_at=NOW()`; `expired` in-app notification (no email) (`:181-187`). |
| anything else | — | `logger.debug` no-op (`:189-191`). |

Every handler **returns silently** when `subByProviderId` finds no local row — an event for an unknown subscription is a successful 200, not an error.

**Status mapping** (`:194-199`): `trialing→trialing, active→active, past_due→past_due, unpaid→payment_failed, canceled→cancelled, incomplete_expired→expired`, **default `'active'`**. The permissive default means Stripe's `incomplete` (and any future status) silently becomes `active` locally.

**`loadUser`** (`:207-210`) reads `identity.users(id, email, display_name)` and maps to `{id, email, displayName}` for name personalization.

#### Idempotency / replay protection — summary

Four distinct layers, because Stripe emits overlapping events and retries on any 5xx:

1. `findActivatedByProviderSub` gates `checkout.session.completed` against an already-activated `provider_subscription_id` — and the same call gates `/confirm`, making the two paths **mutually** idempotent (whichever lands first wins).
2. `activateSubscription` upserts the single live subscription row in place rather than inserting, so replays converge instead of violating `uq_subscriptions_one_live_per_user`.
3. `payment_records.provider_invoice_id` dedupe — in `activateSubscription` (any status) and in the invoice handler (`status='succeeded'` only, so a prior `failed` row from a failed-then-retried charge is intentionally preserved, `:81-86`).
4. The period-sync `UPDATE` is naturally idempotent and therefore runs *before* the dedupe check, so retries always converge the period even when the payment rows are skipped.

There is **no** event-id ledger — `event.id` is never persisted, so dedupe is entirely invoice/subscription-keyed, not event-keyed. Non-invoice events (`customer.subscription.updated`) are replay-safe only because they are pure last-write-wins upserts.

Cosmetic oddity at `:78`: `SET ... cancel_at_period_end=cancel_at_period_end` is a self-assignment no-op, presumably intended to document "don't clobber this flag".

### Free-plan listening quota

#### Configuration

`config.listening.timezone = process.env.LISTENING_TZ || 'UTC'` (`config.js:151-153`). The limit itself is **data**, not config: `subscription_plans.daily_song_limit` on the `free` row = **36** (raised from 7 by migration `0025`), with `preview_seconds` = **60**. JS fallbacks of `36`/`60` appear at `services/subscriptions.js:99-100,318-319,368`.

#### Table

`production.daily_listening_counters` (migration `0014:257-264`): `PRIMARY KEY (user_id, day)`, `day DATE`, `songs_played INTEGER DEFAULT 0` (full plays counted against the limit), `limited_plays INTEGER DEFAULT 0` (previews served after the limit), `updated_at`.

#### Timezone-based midnight reset

There is **no cron job and no reset routine**. The reset is structural: every read and write keys the row by

```sql
(NOW() AT TIME ZONE $2)::date
```

(`services/subscriptions.js:326`, `:364`). `NOW()` is `timestamptz`; `AT TIME ZONE 'America/New_York'` renders it as local wall-clock in that zone; `::date` truncates. At local midnight the expression yields a new date, no row exists for it, the `INSERT ... ON CONFLICT` creates one with `songs_played = 0`, and the user is fresh. Old rows are simply never read again (there is no retention/cleanup job). Changing `LISTENING_TZ` shifts every user's reset moment globally — the quota day is **server-configured, not per-user**.

#### `POST /api/listening/intent` — auth

Body: `{ song_id?: z.string().max(80).optional() }` (`routes/listening.js:22-26`). The song id is accepted for future per-song policy/logging but is **completely ignored** — `resolvePlayIntent(req.auth.user.id)` never receives it (`routes/listening.js:29`). The quota is strictly per-user-per-day.

`resolvePlayIntent` (`services/subscriptions.js:312-353`):

1. `getEntitlement(userId)`. If `isPaid` → short-circuit, **no counter row is created or touched**:
   `{mode:'full', unlimited:true, plays_today:null, daily_limit:null, remaining:null, preview_seconds, status: ent.status}`.
2. Otherwise, inside `withTransaction`:
   - `INSERT INTO daily_listening_counters (user_id, day) VALUES ($1, (NOW() AT TIME ZONE $2)::date) ON CONFLICT (user_id, day) DO UPDATE SET updated_at = NOW() RETURNING day, songs_played`. The `DO UPDATE` (rather than `DO NOTHING`) is deliberate: it makes the conflicting row **return its values and take a row lock**, serializing concurrent intents for the same user so two parallel plays can't both read the same count.
   - If `songs_played < limit` → `UPDATE ... SET songs_played = songs_played + 1` and return
     `{mode:'full', unlimited:false, plays_today:n, daily_limit:limit, remaining: max(0, limit-n), preview_seconds, status:'free'}` — `plays_today` is the **post**-increment value.
   - Else → `UPDATE ... SET limited_plays = limited_plays + 1` and return
     `{mode:'limited', unlimited:false, plays_today:played, daily_limit:limit, remaining:0, preview_seconds, status:'free'}`.

The 37th play of the day is the first `limited` one. Being server-side, a tampered client cannot grant itself extra full plays — but note the counter increments on **intent**, not on actual listening, so skipping through tracks burns quota.

#### `GET /api/listening/status` — auth

`routes/listening.js:33-35` → `getListeningStatus` (`services/subscriptions.js:356-370`). Read-only, **no increment, no row creation**.

- Paid: `{unlimited:true, plays_today:0, daily_limit:null, remaining:null, preview_seconds}` — note `plays_today` is hard-coded `0` for paid users, not a real figure.
- Free: single `SELECT songs_played ... WHERE user_id=$1 AND day=(NOW() AT TIME ZONE $2)::date`; missing row ⇒ `0`. Returns `{unlimited:false, plays_today, daily_limit, remaining: max(0, limit-played), preview_seconds}`.

This backs UI copy like "N of 36 free songs left today".

#### What the client does on denial

The web client treats this as a soft cap, not a hard block (`app/web/lib/subscription.ts:77-84`, `app/web/stores/player.ts:140-161`, `app/web/components/FooterPlayer.tsx:56-69`):

1. On each **new** track, `beginPlay()` fires `resolvePlayIntent(songId)` asynchronously — playback starts immediately and is corrected after the response.
2. **Fails open**: no access token, a network error, or any non-2xx returns `null` and no cap is applied (`subscription.ts:78-83`, `player.ts:160`). A backend hiccup never hard-blocks listening.
3. A race guard drops a late response if the user already skipped: `if (get().nowPlaying?.songId !== songId) return` (`player.ts:155`).
4. On `mode === 'limited'`: `useUpgradeModal.arm(intent)` and `set({capSeconds: intent.preview_seconds || 60})`.
5. The `timeupdate` handler enforces the cap: at `currentTime >= cap` it pauses, clamps `currentTime` back to `cap`, and syncs `isPlaying:false`. Because this re-pauses on **every** tick past the cap, a manual resume cannot bypass the preview (`FooterPlayer.tsx:60-69`). The upgrade modal is shown once per capped track (`promptedRef`) so it stays dismissible while the pause keeps enforcing.

### `docs/SUBSCRIPTION_API.md` accuracy

Structurally accurate and current on routes, verbs, auth, response shapes, error codes, and the webhook contract. **Stale in one specific dimension: the free-plan limit was never updated after migration 0025 (7 → 36).**

| Doc line | Claim | Reality |
|---|---|---|
| 48 | "For a Free user: … `dailySongLimit:7`" | **36** (`0025_free_plan_daily_36.sql`) |
| 135-136 | intent example `"daily_limit": 7, "remaining": 4` | `daily_limit` is **36** |
| 143 | status example `"daily_limit": 7` | **36** |
| 129-131 | "Free-plan listening enforcement" heading | fine, but never states the 60s preview comes from `preview_seconds` on the plan row |

Other gaps (omissions, not errors):
- `POST /confirm` documents 403/404 but not the **422** `"Could not resolve the plan for this checkout"` (`subscriptions.js:142`).
- `/cancel`, `/reactivate`, `/change`, `/portal` do not document the **502** gateway-failure responses, nor reactivate's **409**.
- The `/billing` payments example omits `invoice_pdf_url`, `refunded_cents`, `provider_invoice_id`, `provider_payment_intent`, `currency`, `created_at`, and the `LIMIT 100` on both collections.
- The doc doesn't state that `/reactivate`, `/portal`, and `/notifications/read` accept no body at all.
- No mention that the counter increments on *intent* rather than on completed playback.
- `SUBSCRIPTION_FEATURE.md` is referenced at line 7 — that file was not verified to exist.

### Cross-cutting observations

- **`production.family_invitations` is entirely unimplemented.** The table, its enum, its partial unique index and its `token` secret column all exist in migration `0014:151-169`, but a grep of `app/api/src` for `family_invitations` returns **zero** hits. Family groups/members are only ever created as a side effect of the *owner's* activation or plan change — there is no invite-send, invite-accept, or member-remove endpoint, and the three `family_*` notification templates are dead. A `family` subscriber today gets a group of exactly one.
- **`getPlanById` is imported into `routes/subscriptions.js:12` but never used.**
- **Free is not a row.** Per the design note at migration `0014:21-22`, "Free" is the *absence* of an entitled subscription; `getEntitlement` computes it. The `free` plan row exists only to carry `daily_song_limit`/`preview_seconds`/marketing copy.
- **`past_due` still grants full playback** (`ENTITLED_STATUSES`, `services/subscriptions.js:14`) — a deliberate grace window while Stripe retries. `payment_failed` and `suspended` do not.
- **An expired period silently demotes to free** regardless of status, via `notExpired()` (`:104-106`) — so even if a webhook is missed, entitlement lapses at `current_period_end` on its own.
- **Money is integer cents everywhere** (`CHECK (price_cents >= 0)`), formatted only at the view boundary. No card data is stored anywhere — only opaque `provider_*` references (migration `0014:10-11`, `stripe.js:6-11`).
- **`subscription_history` is hardened append-only** at the DB level: `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC` (`0014:252`).
- **Gateway-first ordering** is consistent across cancel/reactivate/change: the provider call happens *before* the local transaction, and a provider failure aborts with 502 leaving local state untouched. The inverse failure (gateway succeeds, DB transaction fails) is not compensated — it relies on `customer.subscription.updated` to re-converge.

---

## 10. Admin, Manage Music & Mobile CMS

Source root: `W:\JubileePraise.com\app\api\src` (Express 4.19, ESM, zod 3, `pg`).

### Cross-cutting mechanics

**Mount order** (`src/index.js:112-138`) — more specific admin routers are mounted *before* the generic `/api/admin`, so their paths win:

| Mount | Router | Limiter |
|---|---|---|
| `/api/app-version` | `routes/appVersion.js` | none |
| `/api/mobile` | `routes/mobile.js` | none |
| `/api/admin/music` | `routes/music.js` | `writeLimiter` |
| `/api/admin/mobile` | `routes/mobileAdmin.js` | `writeLimiter` |
| `/api/admin` | `routes/admin.js` | `writeLimiter` |

`writeLimiter` = 120 req / 60 s per IP, **skipped for GET/HEAD** (`index.js:80-83`). Body parser is `express.json({limit:'256kb'})` (`index.js:75`) — mounted *before* `attachSession`, so the raw cover upload in `admin.js` works because `express.json` ignores `image/*`.

**Auth.** `attachSession` (`middleware/session.js`) sets `req.auth = { user: {id,email,displayName}, roles: [...] }` from `Authorization: Bearer <token>`, or `null`. Tokens are JI-format `base64url(JSON).base64url(HMAC-SHA256)`, not standard JWTs; verification re-loads the user from the DB and enforces `is_active`, so role changes take effect on the next request (`auth/session.js:154-160`).

`requireRole('admin')` (`middleware/rbac.js:32-40`) throws **401** `Authentication required` when `req.auth` is null and **403** `Requires role: admin or higher` otherwise. Roles are privilege-ordered: `['viewer','reviewer','content_editor','executive','admin']` (`config.js:189`) — `hasRole` compares the *maximum* index held against the required index. **Every route in all three admin routers is admin-only** (`admin.js:23`, `music.js:35`, `mobileAdmin.js:20`).

**Validation.** `validate(schema, source='body')` (`middleware/validate.js`) `safeParse`s and **replaces** `req[source]` with the parsed value (so zod defaults/coercions land on the handler). Failure → **400** `{error:'error', message:'Validation failed', issues:[{path,message}]}`.

**Error envelope** (`middleware/error.js:12-34`): `{error, message, ...extra}` with codes `400 error · 401 unauthorized · 403 forbidden · 404 not_found · 409 conflict · 422 unprocessable · 503 unavailable · 500 internal`. PG `23505` → 409, `23514` → 422 (with `detail: err.constraint`).

**Manifest.** `manifest.js` mtime-caches `web/public/music/catalog-manifest.json` in two forms:
- `getManifest()` — **sanitized**: drops 22 excluded artist slugs (`manifest.js:31-43`) and merges `party-giggles` + `tiny-tiggles` into one synthetic `children` category. This is what the public + mobile surfaces see.
- `getFullManifest()` — **unsanitized**, entire catalog. Used only by the mobile-CMS admin so an operator can curate from everything (`manifest.js:181-195`).

Both expose `byAlbumCode`, `byArtist`, `byAlbumId`, `bySongId`. Deterministic UUIDs: `albumUuid(code)` / `songUuid(code,n)` = uuid-v5 under namespace `f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f` (`ids.js`), identical across DB importer / API / web.

---

### 10.1 — `routes/admin.js` (`/api/admin`)

All routes `requireRole('admin')`. `GRANTABLE_ROLES = ['reviewer','content_editor','executive','admin']` (`admin.js:18`); `viewer` is the implicit baseline and is never listed.

#### Admin user management

##### `GET /api/admin/users`
No params. One query joining `identity.users` LEFT JOIN `identity.user_roles`, `GROUP BY u.id`, `ORDER BY u.created_at`. Roles come back as a sorted array via `COALESCE(array_agg(ur.role ORDER BY ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}')` — users with no rows get `[]`, not `[null]`.

Response: **array** (not wrapped) of `{id, email, display_name, first_name, last_name, is_active, last_login_at, created_at, roles[]}`.

> Note: there is no filtering, search, or pagination on this endpoint — the whole user table is returned. Any filtering is client-side.

##### `PATCH /api/admin/users/:id` — rename
Body (`admin.js:41-44`):

| field | zod | notes |
|---|---|---|
| `first_name` | `z.string().trim().max(120).optional().default('')` | |
| `last_name` | `z.string().trim().max(120).optional().default('')` | |

1. `isUuid(id)` else **400** `invalid user id`.
2. Empty strings coerced to `null`; `display` = `[first,last].filter(Boolean).join(' ').trim()`. If `display` is empty → **400** `a first or last name is required` (so at least one name part is mandatory even though both fields are individually optional).
3. `UPDATE identity.users SET first_name, last_name, display_name, updated_at=NOW()`. `rowCount===0` → **404** `user not found`.
4. Inserts `identity.audit_log` action `user.rename`, `target_type='user'`, payload `{first_name,last_name}`.

Response: `{id, email, display_name, first_name, last_name}`.

`display_name` is a **derived** field kept in sync here — it is what tokens and the rest of the UI read.

##### `DELETE /api/admin/users/:id` — hard delete
1. `isUuid` else **400**.
2. **Self-delete guard** (`admin.js:75`): `id === req.auth.user.id` → **400** `you cannot delete your own account from here`. This is the *only* self-protection; see the escalation note below.
3. Lookup user → **404** `user not found` if absent.
4. In a transaction: `purgeUserAccount(client, id, email)` then audit `user.delete` with payload `{email}`.

**Cascade performed by `purgeUserAccount`** (`auth/session.js:41-50`), in order:

| statement | effect |
|---|---|
| `DELETE FROM production.ratings WHERE rater_user_id` | destroys their ratings |
| `DELETE FROM production.comments WHERE author_user_id` | destroys their comments |
| `DELETE FROM production.nominations WHERE nominator_id` | destroys their nominations |
| `UPDATE identity.audit_log SET actor_user_id = NULL` | **anonymizes**, keeps the audit trail |
| `UPDATE production.pipeline_state SET assignee_user_id = NULL` | unassigns |
| `UPDATE catalog.assets SET uploaded_by = NULL` | orphans uploads |
| `DELETE FROM identity.users WHERE id` | the row itself; FK cascades handle `user_roles`, `refresh_tokens`, etc. |
| `DELETE FROM identity.signup_verifications WHERE email` | clears pending OTP so the address can re-register |

Response: `{ok:true, deleted:<id>}`.

##### `PATCH /api/admin/users/:id/roles` — role assignment
Body: `{ roles: z.array(z.enum(GRANTABLE_ROLES)).max(4) }` (`admin.js:94`; `.max()` is `GRANTABLE_ROLES.length`).

1. `isUuid` else **400**.
2. `want = new Set(['viewer', ...req.body.roles])` — **`viewer` is force-added and can never be revoked** (`admin.js:98`). Duplicates in the request collapse in the Set.
3. Transaction: read current `identity.user_roles`; `INSERT ... ON CONFLICT DO NOTHING` for each wanted-but-missing role (recording `granted_by = req.auth.user.id`); `DELETE` each held-but-unwanted role.
4. Audit `role.set` with payload `{roles:[...want]}`.

Response: `{user_id, roles:[...]}`.

**Privilege-escalation guards — what exists and what doesn't.** The only enforcement is the enum (you cannot invent a role) and the forced `viewer`. There is **no** guard preventing an admin from:
- granting `admin` to any other account (horizontal escalation is permitted by design),
- **removing `admin` from their own account** (unlike `DELETE`, this endpoint has no self-target check) — a self-demotion locks the actor out on their next request, since `verifyAccessToken` re-reads roles from the DB,
- removing `admin` from the *last* remaining admin — no "last admin" invariant exists anywhere in this file.

The one asymmetry worth flagging: the delete route explicitly refuses self-targeting (`admin.js:75`) while the roles route does not.

#### `GET /api/admin/subscribers`
No params. Single query (`admin.js:129-143`):
- `production.subscriptions s` JOIN `production.subscription_plans p` JOIN `identity.users u`
- filter `p.is_paid = TRUE AND s.status IN ('active','past_due')`
- `monthly_cents` = `ROUND(p.price_cents/12.0)::int` when `p.billing_interval='year'`, else `p.price_cents` — annual plans are normalized to a monthly figure
- `ORDER BY (s.status='active') DESC, monthly_cents DESC, u.display_name`

Then in JS: `monthly_total_cents` = sum of `monthly_cents` (current MRR), and a per-plan rollup keyed on `plan_name || plan_code`.

Response:
```
{ currency,                       // subscribers[0]?.currency || 'usd'
  count,
  monthly_total_cents,
  by_plan: [{plan, count, monthly_cents_each, subtotal_cents}],
  subscribers: [{id,user_id,display_name,email,plan_code,plan_name,currency,
                 billing_interval,price_cents,monthly_cents,status,
                 current_period_end,cancel_at_period_end,started_at}] }
```
`by_plan[].monthly_cents_each` is taken from the *first* subscriber seen for that plan (`admin.js:150`) — correct only while a plan has one price.

#### Cover upload endpoints

##### `POST /api/admin/covers/:code`
Body parser: `raw({ type: ['image/png','image/jpeg','image/jpg','image/webp'], limit: '10mb' })` (`admin.js:198-199`). The image arrives as the **raw request body**, not multipart, not base64.

Step by step (`admin.js:200-243`):
1. `code` = uppercased param with a trailing `.PNG` stripped; must match `/^[A-Z0-9]+$/` else **400** `invalid album code`.
2. `getAlbumByCode(code)` (sanitized manifest, so an excluded artist's album is unreachable). Missing album or missing `album.path` → **404** `unknown album`.
3. `r2Configured()` — all of `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` must be set (`util/r2.js:9-12`), else **503** `Cover upload is not activated yet — R2 credentials are not set on the server.`
4. Empty / non-Buffer body → **400**; content-type not in the whitelist → **415** `unsupported image type`.
5. **R2 PUT** to the canonical key `music/${album.path}/artwork/${CODE}.png` — always the `.png` path regardless of the uploaded type; bytes stored as-is with the true content-type and `Cache-Control: public, max-age=31536000, immutable` (`util/r2.js:27-35`).
6. Upsert `production.cover_updates` `ON CONFLICT (album_code) DO UPDATE SET version = version + 1, ... synced_to_j=FALSE, synced_at=NULL` → returns the new `version`.
7. `rewriteCoverVersions()` (`util/coverVersions.js:12-18`) rewrites `<manifest dir>/cover-versions.json` = `{generated, versions:{CODE:version}}` from the whole table. This is the shared `?v=` cache-bust map the web reads.
8. **Best-effort ISR revalidate**: if `REVALIDATE_SECRET` is set, `POST ${WEB_INTERNAL_URL}/revalidate?secret=...` with a 5 s `AbortSignal.timeout`, all failures swallowed (`admin.js:229-234`).
9. Audit `cover.update` on `identity.audit_log` (`.catch(()=>{})` — never blocks).

Response: `{ok:true, code, version, url: "${CDN_BASE}/${key}?v=${version}"}`.

##### `GET /api/admin/covers/pending-sync`
Selects `album_code, version, content_type, bytes, updated_at` from `production.cover_updates WHERE synced_to_j = FALSE ORDER BY updated_at`. Each row is decorated with `path` and `key` (`music/<path>/artwork/<CODE>.png`) resolved from the manifest, `null` when the album is unknown. Response `{pending:[...]}`. Consumed by the studio-side J:-drive sync script.

##### `POST /api/admin/covers/:code/mark-synced`
Uppercases the code, `UPDATE production.cover_updates SET synced_to_j=TRUE, synced_at=NOW()`. **No existence check** — always **200** `{ok:true, code}` even for an unknown code.

#### `GET /api/admin/audit`
Query: `since` (optional string, passed straight to Postgres as a timestamp comparand — no zod validation, so a malformed value surfaces as a PG cast error → 500). Selects the last **500** `identity.audit_log` rows, `LEFT JOIN identity.users` for `actor` (`display_name`), `ORDER BY created_at DESC`. Note the `LIMIT 500` is applied *after* the `since` filter but there is no pagination.

Response: array of `{id, action, target_type, target_id, payload, created_at, actor}`.

Actions written into `identity.audit_log` across this subsystem: `user.rename`, `user.delete`, `role.set`, `cover.update` (this file) and `music.access` (from `routes/music.js`).

#### `POST /api/admin/publish/:type/:id`
Params: `type ∈ {song, album, playlist, program}` else **400** `invalid type`; `id` must be a UUID else **400** `invalid id`.

Inside one transaction (`admin.js:290-328`):
1. `version` = `COALESCE(MAX(version),0)+1` over `production.publications` for that `(rateable_type, rateable_id)`.
2. `cdnPath = catalog/${type}s/${id}.json`; `contentHash = sha256("${type}:${id}:${version}")` — a *synthetic* hash of the identity triple, **not** a hash of any real content.
3. `INSERT INTO production.publications (rateable_type, rateable_id, version, cdn_path, content_hash, published_by)`.
4. For `song`/`album` only: read `production.pipeline_state.current_stage` as `from`; UPDATE it to `'published'` with `entered_stage_at=NOW()` if the row exists, otherwise INSERT the row at `'published'`; then append `production.pipeline_history (from_stage=from, to_stage='published', actor_user_id, note='admin publish')`.

Response: `{rateable_type, rateable_id, published:true, cdn_base, version, cdn_path, content_hash}`.

**No CDN write actually happens** — the code comment at `admin.js:285-287` is explicit that only the DB side of §17 is implemented. `playlist`/`program` get a publication row but no pipeline transition.

---

### 10.2 — Manage Music (`routes/music.js`, `/api/admin/music`)

### The CDN sync model

The `production.music_*` tables (migration `0015_manage_music.sql`) are a **management/publishing-state layer over the manifest**. No media is duplicated — only metadata + CDN *references*. The manifest (a folder-scan of `cdn.jubileeverse.com`) stays authoritative for what exists; these tables add what the manifest cannot carry: publish visibility, sync history, validation results, an activity trail, and the schedule.

#### What `musicSync.js` scans

`runSync({trigger, actorUserId, probe})` (`services/musicSync.js:193-381`):

1. **Open the run** — `INSERT INTO production.music_sync_runs (trigger, status='running', actor_user_id, started_at) RETURNING id`. An in-memory `log[]` accumulates `{at, msg, ...}` step records that are persisted at the end.
2. **Flatten the sanitized manifest** — triple loop `categories → artists → albums`, building album state via `deriveAlbumState` and song state via `deriveSongStates`.
3. **Dedupe** — `dedupeBy(rows, 'album_code')` / `'song_id'` keeping the *last* occurrence (`musicSync.js:57-61`). This is load-bearing: the manifest can carry duplicate folder trees, and a single `ON CONFLICT` upsert touching one row twice raises PG's *"cannot affect row a second time"*.
4. **Load prior state** — `album_code, song_count, audio_present_count, cover_present, visibility, visibility_source, title` from `music_album_state`; `song_id, mp3_available, visibility_source` from `music_song_state`. Used both to classify new-vs-updated and to *respect manual overrides*.
5. **Probe cover art** — the `probe` mode selects the candidate set (`musicSync.js:238-243`):
   - `'all'` → every album
   - `'none'` → nothing
   - `'missing'` (default) → albums with no prior row, or `cover_present` `NULL` (never probed) or `FALSE`
   
   Probes run through `mapLimit(toProbe, 24, ...)` — **bounded concurrency 24**, so the CDN never sees thousands of simultaneous HEADs (`musicSync.js:64-76, 246`).
6. **Resolve `cover_present`** — probed value if probed this run, else the last known value, else `null`. `missingCovers` counts explicit `false`. Validation JSON is computed per album here.
7. **Resolve visibility** — the core rule (`musicSync.js:264-284`):
   - New album → `visibility = auto_visibility`, `visibility_source='auto'`.
   - Existing album → `visibility_source` is carried over; `visibility = (source==='manual') ? previous : auto_visibility`. **Sync never clobbers an admin's explicit choice.**
   - `auto_visibility` is `'published'` when `audio_present_count > 0`, else `'draft'` (`musicSync.js:105`). For songs: `'published'` when the track has `audio && url`, else `'draft'`.
   - "Updated" is counted when `song_count`, `audio_present_count`, `cover_present`, or `title` changed.
   - ⚠️ `published_at`/`hidden_at` are **re-stamped to the current run time** on every sync for any album currently in that state (`musicSync.js:275-276`), so the original publish timestamp is not preserved across syncs.
8. **Write** — inside one transaction: `bulkUpsert` into `music_album_state` (22 columns, conflict on `album_code`) and `music_song_state` (17 columns, conflict on `song_id`), chunked **200 rows per statement** to keep the parameter list bounded (`musicSync.js:169-187`).
9. **Flag vanished rows** — `UPDATE ... SET present_in_manifest=FALSE WHERE present_in_manifest=TRUE AND album_code <> ALL($1::text[])` (and the `uuid[]` equivalent for songs); `rowCount` becomes `albums_removed` / `songs_removed`. ⚠️ Because `x <> ALL('{}')` is TRUE in Postgres, a run against an *empty* manifest marks the entire catalog broken.
10. **Mirror validation** — per album, per check, upsert into `production.music_validation_results` `ON CONFLICT (album_code, check_name)`. Note this is a nested per-check loop inside the transaction, i.e. `albums × 6` round-trips.
11. **Close the run** — write the counters, `summary` JSONB, `log` JSONB, `status='success'`, `finished_at=NOW()`; then `UPDATE music_sync_config SET last_run_at = NOW()`.

On any throw: the run row is set `status='error'`, `finished_at=NOW()`, `error=err.message`, `log=<steps so far>` — and the error is re-thrown, so the HTTP caller gets a **500**.

Return value (also the `POST /sync` body): `{runId, status:'success', albums_scanned, songs_scanned, albums_new, songs_new, albums_updated, songs_updated, albums_removed, songs_removed, missing_covers, missing_audio}`.

#### State derivation

`deriveAlbumState` (`musicSync.js:82-108`) produces: `album_code` (uppercased), `album_id`, `title`, `artist_slug`, `artist_name`, `category` (category key), `release_year` (from an optional `year`/`released`, first 4 chars parsed — the manifest carries no release date, so this is usually `null`, `musicSync.js:110-115`), `cdn_path` (`/music/<path>`), `cover_url` (`${CDN}/music/${path}/artwork/${CODE}.png`), `song_count` (`trackCount || tracks.length`), `audio_present_count` (tracks with both `audio` and `url`), `audio_missing_count`, `metadata_complete` (title ∧ artist name ∧ `songCount>0` ∧ every track has a non-blank title), `auto_visibility`, `last_modified_at` (the manifest's `generated` timestamp).

`deriveSongStates` (`musicSync.js:117-138`): `song_id`, `album_code`, `album_id`, `track_number`, `title`, `artist_name`, `duration_seconds` (rounded), `cdn_path` (relative), `mp3_url` (absolute), `mp3_available`, `lyrics_available`, `metadata_complete` (non-blank title), `auto_visibility`.

#### `probeUrl` (`musicSync.js:32-50`)
`fetch(url, {method:'HEAD'})` behind an 8 s `AbortController`. **Never throws** — a network failure returns `{ok:false, status:0, error}`. Success returns `{ok, status, contentType, contentLength, lastModified}`.

#### Validation checks (`validateAlbum`, `musicSync.js:143-163`)
Six checks, in order, each `{check, passed, detail}`:

| check | passes when | detail |
|---|---|---|
| `Album Cover Exists` | `coverPresent === true` | `'Not yet probed'` when null, else `Found` / `Missing cover image` |
| `MP3 Files Exist` | `audio_present_count > 0` | `"N/M songs have audio"` |
| `Song Count Matches Metadata` | `audio_missing_count === 0` | `All tracks present` / `"N missing audio"` |
| `Artist Exists` | `artist_name` truthy | the name, or `No artist` |
| `Album Metadata Complete` | `metadata_complete` | `Complete` / `Missing title / artist / track titles` |
| `Required Metadata Present` | title ∧ artist ∧ `song_count>0` | `Title, artist and at least one track` |

Stored twice: as a JSONB cache on `music_album_state.validation` and normalized into `music_validation_results` (UNIQUE `(album_code, check_name)`, so only the latest result per check survives).

#### Scheduler (`services/musicScheduler.js`)
`startMusicScheduler()` is called from `index.js:149` at listen time. It is **opt-in per instance**: it returns immediately unless `process.env.MUSIC_SYNC_SCHEDULER` lowercases to exactly `'on'` (`musicScheduler.js:51`). This is deliberate — in a multi-instance deployment only ONE box should run it, otherwise every instance fires duplicate syncs.

When enabled: `setInterval(tick, 60_000)` with `timer.unref()` so it never holds the process open. `tick()`:
1. Module-level `running` flag makes it **overlap-safe** — a still-running sync causes the tick to no-op.
2. Reads `music_sync_config` row 1; bails when `!enabled` or `schedule === 'off'`.
3. Due when `!next_run_at || next_run_at <= now`.
4. Runs `runSync({trigger:'scheduled', probe:'missing'})` — note scheduled runs always use the cheap probe mode and carry `actor_user_id = null`.
5. Advances `next_run_at = nextRunAt(schedule, now)`. On failure it **still advances** `next_run_at` by one cadence so a persistent error can't hot-loop (`musicScheduler.js:41-43`).

`nextRunAt(schedule, from=now)` (`musicSync.js:434-437`) maps `hourly→1h`, `6h`, `12h`, `daily→24h`, `weekly→7d`; anything else (`off`) → `null`.

#### Visibility enforcement (`services/musicVisibility.js`)
The public catalog endpoints are manifest-backed and synchronous, so hidden albums must be suppressed out-of-band. This module caches the sets of explicitly-hidden ids:

- **Only `visibility = 'hidden'` is collected** — `'draft'` is deliberately *not* suppressed here, because draft/studio albums are governed by the separate reviewer/studio gating in the web layer (`musicVisibility.js:6-9, 26-29`).
- TTL **30 s**; `inflight` promise dedupes concurrent loads (`musicVisibility.js:44-47`).
- **Fails OPEN**: any DB error logs a warning and installs empty sets, so a transient DB blip can never black out the catalog (`musicVisibility.js:35-39`).
- `invalidateVisibilityCache()` is called by every route that changes visibility, so the public site reflects the change immediately rather than up to 30 s later.

Exports: `isAlbumHidden(code)` (case-insensitive), `isSongHidden(songId)`, `hiddenSets()` for bulk list filtering.

#### Read-access audit + activity log
`music.js:36-43` — a router-level middleware fires on **every request** (including GETs), inserting `identity.audit_log` action `music.access`, `target_type='music'`, `target_id = req.path`, payload `{method, query}`. It is fire-and-forget (`.catch` logs a warning) and does **not** await, so it never delays the handler.

`logActivity()` (`music.js:46-55`) appends to `production.music_activity_log` with `actor_user_id`, `actor_name` (`displayName || email`), `action`, `target_type ∈ {album,song,sync,config,bulk}`, `target_id`, `previous_value`, `new_value`. The table has `REVOKE UPDATE, DELETE, TRUNCATE ... FROM PUBLIC` (migration `0015:191`) — append-only by grant.

### Endpoints

#### Dashboard

##### `GET /api/admin/music/dashboard`
No params. Four queries: an aggregate over `music_album_state`, one over `music_song_state`, the newest `music_sync_runs` row, and the `music_sync_config` singleton.

```
{ cards: { total_albums_cdn, albums_published, albums_hidden, albums_missing_cover,
           total_songs_cdn, songs_published, songs_hidden, songs_missing_audio,
           total_artists, albums_pending_review, albums_missing_metadata,
           songs_missing_metadata, broken_references },
  last_sync: {id,trigger,status,started_at,finished_at,summary} | null,
  schedule:  {schedule,enabled,last_run_at,next_run_at} | null,
  initialized: bool }
```

Semantics worth pinning down (`music.js:63-107`): every card except `*_hidden` and `broken_refs` is filtered on `present_in_manifest` — so counts describe what is *currently on the CDN*. `albums_pending_review` is literally `visibility='draft'`. `total_artists` = `COUNT(DISTINCT artist_slug)`. `initialized` = `total_albums + broken_refs > 0`, i.e. "has a sync ever run".

#### Sync

##### `POST /api/admin/music/sync`
Body: `{ probe?: 'none'|'missing'|'all' }` (`music.js:113`); defaults to `'missing'`. Runs `runSync({trigger:'manual', actorUserId:req.auth.user.id, probe})`, then `invalidateVisibilityCache()`, then logs activity `sync.executed` (`target_type='sync'`, `target_id=runId`). Response = the `runSync` result object. **Synchronous** — the HTTP request is held for the whole reconcile; a sync failure propagates as **500**.

##### `GET /api/admin/music/sync/runs`
Query `limit` — `Math.min(100, Math.max(1, parseInt||25))`. Returns an **array** of run rows with all counters + `summary` + `error`, but **not** `log`, `ORDER BY started_at DESC`.

##### `GET /api/admin/music/sync/runs/:id`
`parseInt(id)`; non-finite → **400** `invalid run id`. `SELECT *` (this one *does* include the `log` JSONB step trace). Not found → **404** `sync run not found`.

##### `GET /api/admin/music/sync/config`
Returns `{schedule, enabled, last_run_at, next_run_at, updated_at}` from row 1, or the literal fallback `{schedule:'off', enabled:false}` if the singleton is missing.

##### `PUT /api/admin/music/sync/config`
Body (`music.js:144-147`), **both required**:

| field | zod |
|---|---|
| `schedule` | `z.enum(['off','hourly','6h','12h','daily','weekly'])` |
| `enabled` | `z.boolean()` |

`next_run_at` is computed server-side: `enabled && schedule!=='off' ? nextRunAt(schedule) : null` (`music.js:150`). Updates row 1 with `updated_by`/`updated_at`. Logs `sync.config_updated` (`target_type='config'`, `target_id='schedule'`). Response: `{schedule, enabled, last_run_at, next_run_at}`.

#### Albums

##### `GET /api/admin/music/albums` — searchable / filterable / sortable / paginated

| query | behavior |
|---|---|
| `q` | `lower(title) LIKE %q%` OR `lower(artist_name)` OR `lower(album_code)` |
| `artist` | `artist_slug =` |
| `category` | `category =` |
| `year` | `release_year = parseInt(year) \|\| 0` |
| `visibility` | `visibility =` (unvalidated string → an invalid enum value raises a PG cast error → 500) |
| `cover` | `missing` → `cover_present IS FALSE`; `present` → `IS TRUE` |
| `audio` | `missing` → `audio_missing_count > 0` |
| `metadata` | `missing` / `complete` → `metadata_complete IS FALSE/TRUE` |
| `broken` | `'1'` → only `present_in_manifest IS FALSE`; `'all'` → no filter; **anything else / absent → only `present_in_manifest IS TRUE`** (`music.js:185-186`) |
| `sort` | whitelisted map `SORTABLE` (`music.js:163-166`): `album_name→title`, `artist→artist_name`, `release→release_year`, `updated→last_synced_at`, `songs→song_count`, `visibility→visibility`, `cdn→cover_present`; default `title` |
| `dir` | `desc` → `DESC`, anything else → `ASC` |
| `page` | `max(1, parseInt \|\| 1)` |
| `pageSize` | `min(200, max(1, parseInt \|\| 50))` |

Ordering is always `ORDER BY <col> <dir> NULLS LAST, album_code ASC` — the secondary key makes paging stable. Sort column and direction are whitelisted; `LIMIT`/`OFFSET` are interpolated but only ever from clamped integers.

Response: `{items:[{album_code, album_id, title, artist_name, artist_slug, category, release_year, cover_url, cover_present, song_count, audio_present_count, audio_missing_count, metadata_complete, visibility, present_in_manifest, published_at, last_synced_at}], total, page, pageSize}`.

##### `GET /api/admin/music/albums/:code`
Code uppercased. Not in `music_album_state` → **404** `album not found in Manage Music — run a sync first`. Four sources combined:
```
{ album: <full music_album_state row>,
  songs: [{song_id,track_number,title,duration_seconds,mp3_url,cdn_path,
           mp3_available,lyrics_available,metadata_complete,visibility,
           present_in_manifest}],           // ORDER BY track_number
  validation: [{check_name,passed,detail,checked_at}],  // ORDER BY check_name
  manifest: <decorateAlbum(...) | null> }   // canonical titles + folder path
```

##### `PATCH /api/admin/music/albums/:code/visibility`
Body `{visibility: z.enum(['published','hidden','draft'])}` (`visSchema`, `music.js:224`). Reads prior visibility (**404** `album not found` if absent), then:
```sql
SET visibility=$2, visibility_source='manual',
    published_at = CASE WHEN $2='published' THEN NOW() ELSE published_at END,
    hidden_at    = CASE WHEN $2='hidden'    THEN NOW() ELSE hidden_at END
```
Setting `visibility_source='manual'` is what makes the choice **survive future syncs**. Then `invalidateVisibilityCache()` and activity `album.published` / `album.hidden` / `album.draft` with `prev`/`next`. Response `{album_code, visibility}`.

##### `PATCH /api/admin/music/albums/:code/metadata`
Body (`music.js:244-247`): `release_year` `z.number().int().min(1900).max(2100).nullable().optional()`, `category` `z.string().max(120).nullable().optional()`. Explicit tri-state: `undefined` keeps the prior value, `null` clears it (`music.js:252-253`). **404** if absent. Logs `album.metadata_edited`. Response `{album_code, release_year, category}`. Does *not* touch visibility or invalidate the cache.

##### `POST /api/admin/music/albums/:code/refresh`
Calls `refreshAlbum(code)` (`musicSync.js:384-431`): re-derives state from the manifest, HEAD-probes the cover **unconditionally**, re-validates, preserves a `manual` visibility (else uses `auto_visibility`), then upserts `music_album_state` and all six `music_validation_results` rows in a transaction. `null` (not in the sanitized manifest) → **404** `album not in manifest`. Logs `album.refreshed`. Response `{album_code, refreshed:true, cover_present, validation}`.

Note: `refreshAlbum` touches **only album state** — song rows are not refreshed.

##### `POST /api/admin/music/albums/:code/validate`
Re-runs `validateAlbum` against the **stored** row (no new probe — it reuses `cover_present` as recorded). **404** if absent. Transaction writes the JSONB cache and upserts each check row. Logs `album.validated`. Response `{album_code, validation:[...]}`.

##### `DELETE /api/admin/music/albums/:code`
Transaction: delete from `music_song_state`, then `music_validation_results`, then `music_album_state` (**404** `album not found` if the last delete matched nothing — the throw rolls back the first two). `invalidateVisibilityCache()`. Logs `album.local_reference_deleted`.

Response: `{album_code, deleted:true, note:'Local reference removed; CDN files untouched. A future sync will re-import it.'}` — **CDN media is never touched**, and the next sync resurrects the row.

#### Songs

##### `GET /api/admin/music/songs`
Same shape as `/albums`. Filters: `q` (title/artist/album_code), `album` (uppercased `album_code =`), `visibility`, `audio` (`missing`/`present` → `mp3_available IS FALSE/TRUE`), `metadata=missing`, `broken` (same three-way logic). Sort map is `{title, album→album_code, updated→last_synced_at}`, default `album_code`; secondary key `track_number ASC`. Same page/pageSize clamps (max 200). Response `{items, total, page, pageSize}`.

##### `GET /api/admin/music/songs/:id`
`isUuid` else **400** `invalid song id`; **404** `song not found`. Returns the full `music_song_state` row.

##### `PATCH /api/admin/music/songs/:id/visibility`
Same `visSchema`. `isUuid` else **400**; **404** if absent. Sets `visibility` + `visibility_source='manual'`; invalidates the cache; logs `song.<visibility>`. Response `{song_id, album_code, visibility}`.

#### Missing-asset diagnostics

##### `GET /api/admin/music/missing`
Six independent queries, no params, each with a hard cap:

| key | source | filter | limit |
|---|---|---|---|
| `albums_missing_cover` | album_state | `present_in_manifest AND cover_present IS FALSE` | 500 |
| `albums_missing_metadata` | album_state | `present_in_manifest AND metadata_complete IS FALSE` | 500 |
| `songs_missing_audio` | song_state | `present_in_manifest AND mp3_available IS FALSE` | 1000 |
| `songs_missing_metadata` | song_state | `present_in_manifest AND metadata_complete IS FALSE` | 1000 |
| `broken_cover_references` | album_state | `present_in_manifest IS FALSE` | 500 |
| `broken_audio_references` | song_state | `present_in_manifest IS FALSE` | 1000 |

The distinction throughout: **"missing"** = exists on the CDN per the manifest but an asset is absent; **"broken"** = the row exists locally but has disappeared from the manifest entirely.

##### `GET /api/admin/music/probe`
Query `url` (raw string). Calls `probeUrl(url)` and returns `{url, ok, status, contentType, contentLength, lastModified}` or `{url, ok:false, status:0, error}`. This is the manual "download test" button. ⚠️ Despite the comment *"Must target the CDN"* (`music.js:397`) there is **no host allow-list** — the server will HEAD any URL an admin supplies (an admin-gated SSRF surface).

#### Bulk operations

##### `POST /api/admin/music/bulk`
Body (`music.js:407-411`):

| field | zod |
|---|---|
| `action` | `z.enum(['publish','hide','draft','publish_songs','hide_songs','refresh','validate'])` |
| `albumCodes` | `z.array(z.string().max(40)).max(2000).optional()` |
| `songIds` | `z.array(z.string().uuid()).max(5000).optional()` |

Three dispatch branches:

1. **`publish` / `hide` / `draft`** — one set-based `UPDATE ... WHERE album_code = ANY($1::text[])` over the uppercased codes, applying the same `visibility_source='manual'` + conditional `published_at`/`hidden_at` stamping as the single-album route. `affected = rowCount`. Cache invalidated.
2. **`publish_songs` / `hide_songs`** — `UPDATE music_song_state ... WHERE song_id = ANY($1::uuid[])`, mapping the action to `published`/`hidden`. `affected = rowCount`. Cache invalidated. (There is no bulk `draft_songs`.)
3. **`refresh` / `validate`** — sequential, and **hard-capped at the first 200 codes** regardless of the 2000-item schema limit (`music.js:436`). Each item is wrapped in try/catch: a failure logs a warning and is skipped, so `affected` counts only successes. `refresh` re-probes the CDN per album (so 200 items = 200 HEADs, serially); `validate` recomputes checks against stored state and writes only the JSONB cache — unlike the single-album validate route it does **not** update `music_validation_results`. Cache invalidated only for `refresh`.

Always logs `bulk.<action>` with `{action, affected, albums:albumCodes.length, songs:songIds.length}`. Response `{action, affected}`. An action with the wrong companion array (e.g. `publish` with only `songIds`) silently yields `affected: 0`.

#### Activity log

##### `GET /api/admin/music/activity`
Query: `limit` `min(200, max(1, parseInt||50))`; `page` `max(1, parseInt||1)`; `target_type` exact match; `action` **prefix** match (`action LIKE '<value>%'`, `music.js:467`) — so `?action=album.` returns every album event. Response `{items:[{id, actor_user_id, actor_name, action, target_type, target_id, previous_value, new_value, created_at}], total, page, pageSize}` where `pageSize` echoes `limit`.

#### Export

##### `GET /api/admin/music/export`
Query: `kind ∈ {albums, songs, missing, activity}` (default `albums`), `format` (default `csv`). Any other format → **400** `only csv export is implemented (xlsx/pdf are a planned enhancement)`; unknown kind → **400** `unknown export kind`.

`toCsv` (`music.js:480-486`) quotes only cells matching `/[",\n]/` and doubles embedded quotes.

| kind | rows | columns |
|---|---|---|
| `albums` | all of `music_album_state`, `ORDER BY artist_name, title` — **no filters, no limit** | Album Code, Title, Artist, Category, Year, Songs, Cover(yes/no), Missing Audio, Metadata Complete(yes/no), Visibility, On CDN(yes/no), Last Synced(ISO) |
| `songs` | all of `music_song_state`, `ORDER BY album_code, track_number` | Album Code, Track, Title, Artist, Duration (s), MP3, Lyrics, Visibility, On CDN |
| `missing` | 3-leg `UNION ALL` (albums missing cover, albums missing metadata, songs missing audio), `ORDER BY artist_name, album_code` | Album Code, Title, Artist, Issue |
| `activity` | `music_activity_log`, `ORDER BY created_at DESC LIMIT 5000` | Timestamp(ISO), Administrator, Action, Target Type, Target |

Headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="jubileepraise-music-<kind>.csv"`.

---

### 10.3 — Mobile CMS (`routes/mobileAdmin.js`, `/api/admin/mobile`)

All 30 routes `requireRole('admin')` (`mobileAdmin.js:20`). Every mutation appends to `production.music_activity_log` with `target_type` hard-coded to `'config'` (`mobileAdmin.js:22-31`) — the mobile CMS shares the Manage-Music activity table.

### The content model

```
mobile_categories  (a "page")           key, label, kind, display_order,
  │                                     is_active, is_visible,
  │                                     hero_enabled, hero_autorotate
  ├── mobile_hero_slides  (per page)    album_ref, headline, subtitle,
  │                                     display_order, is_active, starts_at, ends_at
  └── mobile_sections     (per page)    name, kind ∈ {artists, albums},
        │                               display_order, is_active,
        │                               show_genre, auto_order
        └── mobile_category_items       item_type ∈ {album,artist,collection},
                                        item_ref, title, album_refs[],
                                        display_order, is_active

mobile_music_types      genre (UNIQUE), label, display_order, is_pinned, is_active
  └── mobile_music_type_albums          album_ref, display_order, is_active

mobile_settings (singleton id=1)        min_album_count DEFAULT 12
```

`kind` on a **category** ∈ `{curated, personas, albums, music_type}` (migration `0021:32`) — but every admin-created page is forced to `'curated'` (`mobileAdmin.js:144`); only the five seeded pages carry the others. `kind` on a **section** ∈ `{artists, albums}` (migration `0023:24`) and drives the app's layout: artists render as circular avatars, albums as square covers.

Seeded pages (migration `0021:101-107`): `home`(curated,1), `inspire_family`(personas,2), `family_friendly`(albums,3), `children`(albums,4), `music_type`(music_type,5). Seeded pinned genres (`0021:109-115`): Contemporary, Praise & Worship, Country, Pentecostal Shout, Gospel — orders 1-5, all `is_pinned=TRUE`.

FK cascades: deleting a category cascades to its sections, items and hero slides; deleting a section cascades to its items; deleting a music type cascades to its album pins.

**Shared reorder schemas** (`mobileAdmin.js:117, 209`):
- `reorderKeys` = `{ keys: z.array(z.string()).min(1) }`
- `reorderIds` = `{ ids: z.array(z.coerce.number().int()).min(1) }` — `z.coerce` is deliberate: Postgres returns `BIGSERIAL` ids as **strings** in JSON, so the client sends strings.

**How ordering is persisted.** Every reorder endpoint follows the identical pattern: open a transaction, iterate the submitted array, and `UPDATE ... SET display_order = i+1 WHERE id = ids[i] AND <parent scope>`. The array's *index* becomes the order — the client sends the full desired sequence, not deltas. The extra parent predicate (`AND category_id = $3`, `AND section_id = $3`, `AND music_type_id = $3`) scopes the write so a caller cannot reorder rows belonging to another parent by smuggling their ids into the list. Ids not matching the scope are silently no-ops; the response is always `{ok:true}` with no count.

#### `GET /api/admin/mobile/config` — full admin tree
Seven parallel queries (`Promise.all`, `mobileAdmin.js:41-55`) over categories, sections, items (`WHERE section_id IS NOT NULL`), hero slides, settings, music types, and music-type albums — **unfiltered by `is_active`**, because the admin UI must see disabled rows too. Grouped in JS by parent id, then decorated from `getFullManifest()`:
- `withNames` (hero + music-type albums) resolves `album_ref` → `{title, artist}`, falling back to the raw ref.
- `withItemNames` (section items) resolves only `item_type==='album'` (artist items carry a persona slug, not a code) and adds `genre = al.genres?.[0] || null`.

Response:
```
{ categories: [{ id,key,label,kind,display_order,is_active,is_visible,
                 hero_enabled,hero_autorotate,
                 hero: [{...slide, title, artist}],
                 sections: [{...section, items:[{...item, title, artist, genre}]}] }],
  musicTypes: [{id,genre,label,display_order,is_pinned,is_active,
                albums:[{...pin, title, artist}]}],
  settings: { min_album_count } }
```

#### Categories (pages)

##### `PATCH /api/admin/mobile/categories/:key`
Body (`mobileAdmin.js:93-99`) — all optional: `label` `string().trim().min(1).max(60)`, `is_active` bool, `is_visible` bool, `hero_enabled` bool, `hero_autorotate` bool.

Looks the category up by `key` (**404** `Category not found`), builds a dynamic `SET` from only the provided fields, and if **none** were provided returns the unchanged row (200, not an error) — note this differs from the item/hero/music-type PATCH routes, which throw **400** `Nothing to update`. Stamps `updated_by`/`updated_at`. Logs `mobile.category.updated` with `prev`/`next`. Returns the full row.

##### `POST /api/admin/mobile/categories`
Body `{label: string().trim().min(1).max(60)}`. `slugify` (`mobileAdmin.js:132-134`) lowercases, replaces non-alphanumerics with `-`, trims dashes, truncates to 50 chars, falls back to `'page'`. Uniqueness is resolved by a **read-then-suffix loop**: fetch all existing keys, then append `-2`, `-3`, … until free (`mobileAdmin.js:137-140`) — racy under concurrency, where the `UNIQUE(key)` constraint would surface as **409** `Duplicate resource`. `display_order` = `MAX+1`; `kind` forced to `'curated'`. Logs `mobile.page.created`. Returns the row.

##### `DELETE /api/admin/mobile/categories/:key`
**404** if unknown. Plain `DELETE` — FK cascades remove sections, items and hero slides. Logs `mobile.page.deleted` with the previous row. `{ok:true}`. No guard protects the five seeded pages.

##### `PATCH /api/admin/mobile/categories-order`
Body `reorderKeys` — an array of **category keys** (the only reorder endpoint keyed on strings rather than ids). Transactional `display_order = i+1 WHERE key = $2`. Logs `mobile.categories.reordered`. `{ok:true}`.

#### Page-level items (legacy)

##### `POST /api/admin/mobile/categories/:key/items`
Body (`mobileAdmin.js:158-163`): `item_type` `z.enum(['album','artist','collection'])`, `item_ref` `string().trim().min(1).max(120)`, `title` `string().trim().max(80).optional()`, `album_refs` `z.array(z.string().trim().min(1)).optional()`.

Inserts into `mobile_category_items` with `display_order = MAX+1` scoped to the category and **`section_id` left NULL**, using `ON CONFLICT (category_id, item_type, item_ref) DO UPDATE SET is_active = TRUE`.

⚠️ **This route is dead in two independent ways.** (a) The `(category_id, item_type, item_ref)` unique constraint it names as its conflict target was **dropped** by migration `0023:44-45` and replaced with `UNIQUE (section_id, item_type, item_ref)` — so Postgres raises `42P10` ("no unique or exclusion constraint matching the ON CONFLICT specification"), which is not mapped in `middleware/error.js` and surfaces as **500**. (b) Even if it inserted, both the admin `GET /config` (`mobileAdmin.js:47`) and the public `GET /api/mobile/config` (`mobile.js:100`) filter `section_id IS NOT NULL`, so a page-level item would never be emitted. This is the pre-0023 shape that `POST /sections/:id/items` superseded. **`collection` items are consequently unreachable** — the section-scoped creator derives `item_type` from the section kind and can only produce `album` or `artist`, so the `collection` branch in `toItem` (`mobile.js:75-77`) has no live producer.

##### `PATCH /api/admin/mobile/items/:id`
Body `{is_active?: bool, title?: string().trim().max(80)}`. Non-integer id → **400** `Invalid item id`; no fields → **400** `Nothing to update`; no row → **404** `Item not found`. Logs `mobile.item.updated`. Returns the row.

##### `DELETE /api/admin/mobile/items/:id`
**400** on non-integer, **404** `Item not found`. Logs `mobile.item.removed` with `prev`. `{ok:true}`.

##### `PATCH /api/admin/mobile/categories/:key/items-order`
`reorderIds`, scoped `AND category_id = $3`. Works on both section-bound and orphan rows (it never mentions `section_id`). Logs `mobile.items.reordered`.

#### Sections

`sectionById(id)` (`mobileAdmin.js:224-230`): non-integer → **400** `Invalid section id`; missing → **404** `Section not found`.

##### `POST /api/admin/mobile/categories/:key/sections`
Body `{name: string().trim().min(1).max(80), kind: z.enum(['artists','albums'])}`. `display_order = MAX+1` within the category; records `updated_by`. Logs `mobile.section.added`. Returns the row.

##### `PATCH /api/admin/mobile/sections/:id`
Body (`mobileAdmin.js:246-252`), all optional: `name` (1-80), `kind` (`artists|albums`), `is_active`, `show_genre`, `auto_order`.

The load-bearing logic is the **type-switch cleanup** (`mobileAdmin.js:265-269`): if `kind` is supplied *and differs* from the current kind, the handler first `DELETE`s every `mobile_category_items` row with that `section_id` — an album cannot live in an artists section and vice versa — and then, unless the caller explicitly set them in the same request, forces `show_genre = false` and `auto_order = false`. The comment is explicit about why: both flags are meaningless without albums, and leaving them dormant would make them silently switch themselves back on if the section ever returned to `'albums'`.

Empty body → returns the unchanged row (200). Logs `mobile.section.updated` with `prev`/`next`.

##### `DELETE /api/admin/mobile/sections/:id`
**400**/**404** via `sectionById`. Cascade removes its items. Logs `mobile.section.removed`. `{ok:true}`.

##### `PATCH /api/admin/mobile/categories/:key/sections-order`
`reorderIds` scoped `AND category_id = $3`. Logs `mobile.sections.reordered`.

##### `POST /api/admin/mobile/sections/:id/items`
Body `{item_ref: string().trim().min(1).max(120), title?: string().trim().max(80)}`.

**`item_type` is derived from the section, never supplied**: `sec.kind === 'artists' ? 'artist' : 'album'` (`mobileAdmin.js:304`) — so the picker only sends a ref and the item can never mismatch its section. `category_id` is copied from the section (denormalized). `display_order = MAX+1` within the section. `ON CONFLICT (section_id, item_type, item_ref) DO UPDATE SET is_active = TRUE` — re-adding a previously deactivated item **revives** it rather than erroring. This conflict target *does* match the live constraint from migration `0023:49`. Logs `mobile.item.added`.

##### `PATCH /api/admin/mobile/sections/:id/items-order`
`reorderIds` scoped `AND section_id = $3`. Logs `mobile.items.reordered`.

#### Hero slides

##### `POST /api/admin/mobile/categories/:key/hero-slides`
Body (`mobileAdmin.js:330-336`): `album_ref` `string().trim().min(1).max(120)` (required), `headline` `max(120)` optional, `subtitle` `max(160)` optional, `starts_at`/`ends_at` `string().trim().max(40).optional().nullable()`.

The schedule bounds are validated only as **short strings** — they are handed to Postgres as `TIMESTAMPTZ` literals, so a non-parseable value raises a PG cast error → **500** rather than a 400. Empty strings become `null` via `|| null`. `display_order = MAX+1` per category; records `updated_by`. Logs `mobile.hero.added`.

##### `PATCH /api/admin/mobile/hero-slides/:id`
Body: `headline`, `subtitle`, `is_active`, `starts_at`, `ends_at` — all optional/nullable. Notable: `''` is normalized to `null` on write (`mobileAdmin.js:363`), so clearing a field from a text input works. **400** `Invalid id` / `Nothing to update`; **404** `Hero slide not found`. Logs `mobile.hero.updated`.

##### `DELETE /api/admin/mobile/hero-slides/:id`
**400** / **404** `Hero slide not found`. Logs `mobile.hero.removed`. `{ok:true}`.

##### `PATCH /api/admin/mobile/categories/:key/hero-order`
`reorderIds` scoped `AND category_id = $3`. Logs `mobile.hero.reordered`.

#### Music types

##### `POST /api/admin/mobile/music-types`
Body `{genre: string().trim().min(1).max(60), label?: string().trim().max(60)}`; `label` defaults to `genre`. `display_order = MAX+1` (global). `ON CONFLICT (genre) DO UPDATE SET is_active = TRUE` — re-adding a deactivated genre revives it, but **does not** update its label or order. Logs `mobile.musictype.added`.

##### `PATCH /api/admin/mobile/music-types/:id`
Body `{label?: string().trim().min(1).max(60), is_active?: bool, is_pinned?: bool}`. **400** `Invalid id` / `Nothing to update`; **404** `Music type not found`. Note `is_pinned` *is* mutable here, so the delete guard below can be lifted by first un-pinning. Logs `mobile.musictype.updated`.

##### `DELETE /api/admin/mobile/music-types/:id`
`DELETE ... WHERE id = $1 AND is_pinned = FALSE`. A miss — whether the row doesn't exist **or** is pinned — returns **400** `Not found or a pinned type cannot be deleted` (`mobileAdmin.js:441`); the two cases are deliberately indistinguishable. Cascade drops its album pins. Logs `mobile.musictype.removed`.

##### `PATCH /api/admin/mobile/music-types-order`
`reorderIds`, **unscoped** (there is no parent). Logs `mobile.musictypes.reordered`.

#### Music-type album pins

`musicTypeById(id)`: **400** `Invalid music type id` / **404** `Music type not found`.

##### `POST /api/admin/mobile/music-types/:id/albums`
Body `{album_ref: string().trim().min(1).max(120)}`. `display_order = MAX+1` within the type. `ON CONFLICT (music_type_id, album_ref) DO UPDATE SET is_active = TRUE`. Logs `mobile.musictype.album.added`.

##### `DELETE /api/admin/mobile/music-type-albums/:id`
Note the **different path prefix** (`music-type-albums`, not nested under the type). **400** `Invalid id` / **404** `Not found`. Logs `mobile.musictype.album.removed`.

##### `PATCH /api/admin/mobile/music-types/:id/albums-order`
`reorderIds` scoped `AND music_type_id = $3`. Logs `mobile.musictype.albums.reordered`.

##### `POST /api/admin/mobile/music-types/:id/autofill`
No body. Seeds a genre's pin list from the catalog's genre tags so the admin can then curate down.

1. `albumsForGenre(mt.genre, 60)` (`mobileAdmin.js:466-475`) scans `getManifest().byAlbumCode` — the **sanitized** manifest — for albums whose `genres[]` contains the genre case-insensitively, stopping at **60** matches.
2. In a transaction, starting from the current `MAX(display_order)`, insert each code with `ON CONFLICT (music_type_id, album_ref) DO NOTHING`, counting only real inserts as `added`.

**Existing entries are preserved; only new matches are appended.** Logs `mobile.musictype.autofill` with `{genre, added}`. Response `{ok:true, added, matched: codes.length}`.

⚠️ Inconsistency worth noting: autofill matches against the **sanitized** manifest while the album *picker* (`/pick/albums`) offers the **full** one — so an operator can manually pin albums that autofill will never find.

#### Settings

##### `PATCH /api/admin/mobile/settings`
Body `{min_album_count: z.number().int().min(1).max(1000)}` — **required**, not optional. Updates the singleton row 1 with `updated_by`/`updated_at`. Logs `mobile.settings.updated`. Returns the full row.

**What `min_album_count` does:** it is the auto-discovery threshold for Music Types. A genre that is *not* an explicit `mobile_music_types` row appears in the mobile app's Music Type page only once at least this many distinct catalog albums carry that genre tag (default **12**, migration `0021:88`). Explicit admin rows bypass it entirely.

#### Pickers

##### `GET /api/admin/mobile/pick/artists`
Query `category` (optional, filters by category key). Returns `listArtists(category, {full:true})` — the **full**, unsanitized artist list — mapped to `[{slug, name, category, albumCount}]`. Un-paginated.

##### `GET /api/admin/mobile/pick/albums`
Query: `q` (substring match against `"${title} ${code} ${artist}"`, lowercased), `page` `max(1,…||1)`, `pageSize` `min(100, max(1, …||100))`.

Iterates the **full** manifest's `byAlbumCode`, collects `{code, title, artist, category}`, then **sorts before paging** — `localeCompare` on title with artist as tiebreaker (`mobileAdmin.js:561-563`). The comment records why: sorting after paging would make pages unstable and let whichever artist appears first in the manifest monopolize the list. Response `{items, total, page, pageSize}`.

---

### 10.4 — `GET /api/mobile/config` (public)

**No auth**, no rate limiter, `Cache-Control: public, max-age=60` (`mobile.js:203`). This is non-sensitive curation metadata; the manifest remains the source of album/artist/track data, and the app resolves refs locally.

#### Assembly

Seven parallel queries (`mobile.js:89-117`), each filtered to live rows — the key difference from the admin view:

| source | filter |
|---|---|
| `mobile_categories` | `WHERE is_active` — ⚠️ **`is_visible` is never read**, so the "soft hide" column is admin-only metadata with no effect on the public payload |
| `mobile_sections` | `WHERE is_active` |
| `mobile_category_items` | `WHERE is_active AND section_id IS NOT NULL` |
| `mobile_hero_slides` | `WHERE is_active AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at >= NOW())` — the scheduling window is enforced **in SQL** |
| `mobile_settings` | `id = 1`, `?? 12` fallback |
| `mobile_music_types` | `WHERE is_active` |
| `mobile_music_type_albums` | `WHERE is_active` |

All ordered `display_order, id`. Rows are grouped by parent id in JS, then each category is mapped:

**Branch A — `kind === 'music_type'`** (`mobile.js:137-142`): emits `{key, label, kind, order, musicTypes}` and **returns early** — such a page carries no `sections` and can never carry a hero.

`buildMusicTypes(rows, minCount, albumsByType)` (`mobile.js:49-67`):
1. Admin rows first, in `display_order`, deduped case-insensitively on genre. Each gets `{genre, label, order, pinned, albums:[album_ref…]}` — **curated rows always carry an `albums` array** (possibly empty).
2. Then auto-discovered genres: `genreCounts()` walks the sanitized manifest counting **distinct** genre labels per album (a per-album `seen` Set prevents an album with a duplicated tag from counting twice, `mobile.js:29-38`), keeps those with `n >= minCount` and not already seen, sorts by count **descending**, and appends `{genre, label:genre, order, pinned:false}` — **the `albums` key is omitted**, which is the signal telling the app to fall back to catalog genre-tag matching.
3. `order` is renumbered sequentially (`out.length + 1`), so the stored `display_order` values are normalized away.

**Branch B — every other kind** (`mobile.js:144-201`): builds `sections`, then optionally `hero`.

Per section:
- `showGenre = s.kind === 'albums' && !!s.show_genre` — **gated on kind**, so a stray flag on an artists section emits nothing.
- `autoOrder = s.kind === 'albums' && !!s.auto_order` — same gating.
- `ordered = autoOrder ? dailyShuffle(rows, String(s.id)) : rows`.
- Each item via `toItem(it, i, showGenre ? genreFor : null)` (`mobile.js:72-82`): base is `{type, ref, order: display_order ?? i+1}`; `collection` adds `{title: it.title || 'Collection', albums: it.album_refs || []}`; an album with `showGenre` on adds `genre` **only when the album actually has one** — the key is omitted otherwise (the catalog leaves ~12% ungenred) so the app falls back to the album name by itself.
- ⚠️ Critical detail (`mobile.js:168`): when `autoOrder` is on, each emitted item's `order` is **renumbered to its shuffled position `i+1`**. The app re-sorts items by `order`, so without this the shuffle would be undone on the client.
- Emitted section: `{name, kind, order, showGenre?: true, autoOrder?: true, items}` — the two flags are spread in conditionally and absent when false.

**Sections come from the admin only.** A category with zero admin sections returns `sections: []` — no manifest-derived defaults — and the mobile app hides such a page (`mobile.js:145-149`). This is a deliberate reversal of migration `0021`'s original "compute sensible defaults from the manifest" design.

Per hero, when `c.hero_enabled` (`mobile.js:175-199`):
- If `hero_autorotate`, compute `dailyHeroAlbums()`. If it returns a non-empty list → `{enabled:true, autoRotate:true, slides:[{ref, order:i+1, headline:null, subtitle:null}]}` — the admin's manual slides are ignored entirely.
- If auto is off **or the auto list is empty**, fall through to the curated slides: `{enabled:true, slides:[{ref: album_ref, order: display_order ?? i+1, headline, subtitle}]}` (no `autoRotate` key). The fallback exists so the hero is never empty.

Final payload:
```json
{ "version": 2,
  "generated": "<manifest generated timestamp | null>",
  "categories": [ /* per above */ ] }
```

#### Hero auto-rotation (`services/heroRotation.js`)

When on, the hero becomes a **carousel of one slide per Inspire Persona (up to 12)**, each showing that persona's *album of the day*; every persona advances to a new album every 24 h, so the whole carousel refreshes daily.

- `HERO_PERSONA_ORDER` (`heroRotation.js:27-31`) is the fixed product sequence: melody, amir, jubilee, elias, santiago, tahoma, imani, caleb, nova, eliana, zariah, zev (all `-inspire` slugs). The header comment warns this **intentionally differs** from `web/lib/personas.ts` `INSPIRE_ORDER` (birth order) — do not swap it.
- **Eligibility** (`heroRotation.js:34-36`): `(album.playable || 0) > 0` **and** `hasCover(album.code)`. `hasCover` reads `<manifest dir>/album-covers.json` — an mtime-cached flat set of codes with real published artwork, generated by `scripts/gen-album-covers.mjs` probing the CDN (`util/albumCovers.js`). A missing file is treated as "no covers", which would make the auto list empty and silently fall back to manual slides.
- `personaEligibleAlbums(slug)` returns that persona's eligible codes in manifest order — the per-persona ring.
- `dayIndex = Math.floor(now / 86_400_000)` — the UTC day number.
- `dailyHeroAlbums(now)` picks `albums[((d % len) + len) % len]` per persona (`heroRotation.js:61`); the double-modulo keeps it safe for negative day indices. **Personas with no eligible album are skipped**, so the carousel can be shorter than 12.
- Each persona cycles independently: a persona with N albums repeats every N days. Recomputed per call — cheap, since it runs over the cached manifest. **Purely global**: `dailyHeroAlbums()` takes no category argument, so every auto-rotating page shows the identical carousel.

#### Section auto-order (`services/sectionOrder.js`)

`dailyShuffle(items, sectionKey, now = Date.now())` returns a **new array** holding the same items in a deterministic daily order:

- `seed = (dayIndex(now) ^ hashStr(sectionKey)) >>> 0`, where `hashStr` is FNV-1a-style 32-bit (`sectionOrder.js:26-34`). Seeding on the section id is what stops two sections from sharing the same daily order.
- `mulberry32(seed)` drives a **seeded Fisher–Yates** — a pure permutation: never drops, never duplicates.
- Properties: same day + same section → identical order; next UTC day → different; different section, same day → different. Identical across servers, since no stored state and no `Math.random` are involved. Advances at 00:00 UTC.
- `items.length <= 1` returns a copy untouched.

---

### 10.5 — App version check (`routes/appVersion.js`, `/api/app-version`)

Public, no auth, no rate limiter.

#### `GET /api/app-version/check`

**What the client sends** — query string, validated with `validate(checkSchema, 'query')` (`appVersion.js:35`):

| param | zod | notes |
|---|---|---|
| `platform` | `z.enum(['ios','android'])` | required |
| `current_version` | `z.string().regex(/^\d+(\.\d+){0,3}$/, 'must be a dotted version like 2.0.0')` | required; 1–4 dotted numeric components, so `2`, `2.0`, `2.0.0`, `2.0.0.1` all pass |

Anything else → **400** `Validation failed` with `issues`. Unknown extra query params are stripped by zod's default object behavior.

Handler (`appVersion.js:36-65`):
1. `SELECT latest_version, min_supported_version, store_url, title, message, mandatory FROM production.mobile_app_versions WHERE platform = $1` (PK is `platform`, CHECK-constrained to the two values).
2. **No row → fail open**: responds `{update_available:false, current_version}` and nothing else. A platform with no config never prompts.
3. `compareVersions(a,b)` (`appVersion.js:23-32`) splits on `.`, `parseInt` per component with `|| 0` for non-numerics, compares up to the longer length treating missing components as 0 — so `2.0` and `2.0.0` compare equal.
4. `behindLatest = current < latest_version`; `belowMinimum = current < min_supported_version`.

Response:
```
{ update_available: behindLatest,
  current_version, latest_version, min_supported_version,
  mandatory: behindLatest && (belowMinimum || row.mandatory === true),
  store_url, title, message }
```

**Update-available vs update-required semantics:**
- *Available (optional)* — `update_available: true, mandatory: false`. Driven purely by bumping `latest_version` above the client's build. The app should show a dismissible prompt.
- *Required (forced)* — `mandatory: true`, reached two ways: (a) raise `min_supported_version` above the client's build, or (b) set the row's `mandatory` boolean flag. Either way the update must *also* be available — `mandatory` is `AND`-gated on `behindLatest` (`appVersion.js:61`), so a client already on `latest_version` can never be force-prompted even if `mandatory = TRUE` is left set on the row.
- `title` / `message` are optional per-platform popup overrides (`?? null`); `store_url` is the App Store / Play Store link the Update button opens.

Seeded (migration `0020:25-29`) with `2.0.0` / min `1.0.0` for both platforms — i.e. no prompt until an operator bumps `latest_version`. There is **no admin write endpoint for this table** anywhere in the API; it is edited directly in SQL.


---

## 11. Data Layer, Runtime & Ops

Root: `W:\JubileePraise.com` · App workspace: `W:\JubileePraise.com\app`

---

### PART 1 — DATABASE

#### 1.1 Physical layout

PostgreSQL 16+. Extensions: `pgcrypto` (for `gen_random_uuid()`) and `citext` (case-insensitive emails), created in `0001_init.sql:29-30`.

Four **named logical schemas** are created in `0001_init.sql:36-39` — there is essentially **nothing in `public`** except the migration ledger:

| Schema | Purpose | Table count (final) |
|---|---|---|
| `identity` | Users, roles, sessions, credentials, OTP challenges, refresh tokens, audit | 10 |
| `catalog` | Artists, albums, songs, lyrics, assets, scripture refs | 6 |
| `production` | Pipeline, editorial, public reviews, analytics, subscriptions, Manage-Music, mobile CMS | 45 |
| `radio` | Stations, programs, playlists, playlist items, schedules | 5 |
| `public` | **Only** `_migrations` — created at runtime by `db/run-migrations.js:58-61`, not by any migration file |

Conventions declared in the `0001_init.sql` header (lines 18-25): UUIDv4 PKs via `gen_random_uuid()`, all timestamps `TIMESTAMPTZ` in UTC, soft-delete only where required (nullable `deleted_at`), polymorphic FKs validated by enum + trigger, append-only tables have `DELETE` revoked from `PUBLIC`.

Note the domain drift: `production` was originally "the editorial pipeline schema" but has since accumulated the public review system, the analytics log, the entire subscription/billing model, the Manage Music layer, and the mobile CMS. It is now the catch-all application schema.

---

#### 1.2 Migration-by-migration changelog

| # | File | Summary |
|---|---|---|
| 0001 | `0001_init.sql` | Full initial DDL (54 KB). Creates 4 schemas, 4 enums (`production.rateable_type`, `production.pipeline_stage`, `catalog.artist_grouping`, `catalog.five_fold`), 21 tables, all base indexes, the `touch_updated_at` trigger fabric, the ratings-aggregation trigger, the Inspire-Family 12-song publish lock, album auto-promote, plus seed data (admin user, 13 personas, 11 award categories, 8 sample radio stations). |
| 0002 | `0002_credentials.sql` | `identity.credentials` — scrypt email/password hashes keyed 1:1 on `users.id`. Enables form login against the shared identity store; SSO users may have no row. |
| 0003 | `0003_user_playlists.sql` | `production.user_playlists` + `user_playlist_items` — personal, user-owned playlists, explicitly distinct from producer-owned `radio.playlists`. Dual UNIQUE on `(playlist,position)` and `(playlist,song)`. |
| 0004 | `0004_password_resets.sql` | `identity.password_resets` — single-use, ~60 min reset tokens; stores SHA-256 hash only, plus a partial index on unredeemed tokens. |
| 0005 | `0005_login_security.sql` | Sign-in hardening: adds `users.first_signin_completed` + `users.locked_until` (grandfathering all existing rows to `TRUE` at line 17-18 so only new signups get challenged), creates `identity.login_verifications` (OTP challenge store, attempts/resend caps) and `identity.user_security_settings` (per-user 2FA toggle). |
| 0006 | `0006_signup_verifications.sql` | `identity.signup_verifications` — two-phase signup: details + password hash + OTP are parked here and **no `users` row exists** until the code is verified. |
| 0007 | `0007_service_idempotency.sql` | `identity.service_idempotency` — replay cache for server-to-server endpoints keyed on the caller's `Idempotency-Key`; stores the response only, never the request. |
| 0008 | `0008_refresh_tokens.sql` | `identity.refresh_tokens` — long-lived Bearer refresh tokens (SHA-256 hash only), sliding expiry, partial index on live tokens. |
| 0009 | `0009_account_deletion_fks.sql` | Bug fix: 5 "actor/creator" FKs switched `NO ACTION → ON DELETE SET NULL` (and 4 columns made nullable) so `DELETE /api/auth/account` can actually hard-delete a user who had granted a role, published, awarded, or created a radio playlist. |
| 0010 | `0010_reviews.sql` | **Public** rating & review module (distinct from the editorial `production.ratings`). 3 enums + 6 tables: `user_reviews`, `review_helpful_votes`, `review_reports`, `review_moderation_log`, `review_notifications`, `review_summaries` + the summary-recompute and helpful-count triggers. |
| 0011 | `0011_likes.sql` | `production.user_likes` — account-backed favorites, polymorphic over album/song, composite PK `(user_id, target_type, target_id)`. Replaces per-browser localStorage. |
| 0012 | `0012_analytics.sql` | Media analytics: `production.playback_events` (raw log, BIGSERIAL, 6 aggregation indexes, `UPDATE/DELETE/TRUNCATE` revoked) + `production.analytics_daily` rollup cache. New enum `playback_source`. |
| 0013 | `0013_reviewer_role.sql` | Widens the `user_roles.role` CHECK to admit `reviewer` — a JubileePraise-native role (preview in-production "studio" albums) that JI SSO never mints. |
| 0014 | `0014_subscriptions.sql` | Full subscription system (21 KB): 5 enums + 10 tables (`subscription_plans`, `subscriptions`, `family_groups/_members/_invitations`, `subscription_transactions`, `payment_records`, `subscription_renewals`, `subscription_history`, `daily_listening_counters`, `subscription_notifications`), 4 touch triggers, and the Free/Individual/Family plan seed. |
| 0015 | `0015_manage_music.sql` | Manage Music admin layer over the CDN manifest: `music_visibility` enum + `music_album_state`, `music_song_state`, `music_sync_runs`, `music_validation_results`, `music_sync_config` (singleton), `music_activity_log` (append-only). |
| 0016 | `0016_invoice_pdf.sql` | Adds `payment_records.invoice_pdf_url` (Stripe's direct-PDF link, alongside the existing hosted `invoice_url`). |
| 0017 | `0017_executive_role_and_names.sql` | (a) Adds `users.first_name` / `last_name` with a best-effort backfill split from `display_name` (line 28-31). (b) **Role consolidation**: `radio_producer` + `production_manager` collapse into a new `executive` role — holders are migrated, old rows deleted, CHECK rewritten to the final five: `viewer, reviewer, content_editor, executive, admin`. |
| 0018 | `0018_now_playing.sql` | `production.now_playing` — ephemeral presence heartbeat (one row per listening session, upserted ~every 25 s, "live" if `updated_at` within ~45 s). Separate from the analytics log. |
| 0019 | `0019_cover_updates.sql` | `production.cover_updates` — tracks admin-replaced album covers; `version` drives the `?v=` cache-bust past the 1-year immutable CDN cache; `synced_to_j = FALSE` flags covers still needing copy-back to the J: drive. |
| 0020 | `0020_mobile_app_versions.sql` | `production.mobile_app_versions` — one row per platform (ios/android) for the in-app update prompt; seeded at 2.0.0 / min 1.0.0. |
| 0021 | `0021_mobile_app_settings.sql` | Mobile CMS curation layer: `mobile_categories`, `mobile_category_items`, `mobile_music_types`, `mobile_settings` (singleton, `min_album_count = 12`). Seeds 5 categories + 5 pinned genres; membership deliberately unseeded so the read API derives manifest defaults. |
| 0022 | `0022_mobile_hero.sql` | Adds `mobile_categories.hero_enabled` + `production.mobile_hero_slides` (album-backed, ordered, optional `starts_at`/`ends_at` schedule window). |
| 0023 | `0023_dynamic_sections.sql` | Inserts a SECTION layer between page and items: new `production.mobile_sections` (typed `artists`\|`albums`); `mobile_category_items` gains `section_id` and its uniqueness moves from `(category,type,ref)` to `(section,type,ref)`. |
| 0024 | `0024_music_type_albums.sql` | `production.mobile_music_type_albums` — manual album membership per Music Type genre, overriding tag matching. |
| 0025 | `0025_free_plan_daily_36.sql` | Data-only: raises the Free plan's `daily_song_limit` 7 → 36 and rewrites its `features` JSON copy. |
| 0026 | `0026_section_show_genre.sql` | Adds `mobile_sections.show_genre` (default FALSE) — album sections caption covers with primary genre instead of album name. |
| 0027 | `0027_hero_autorotate.sql` | Adds `mobile_categories.hero_autorotate` (default FALSE) — when TRUE the config API ignores curated slides and features one Inspire Persona album/day through a fixed 12-persona cycle (`services/heroRotation.js`). Manual slides are preserved and resume on toggle-off. |
| 0028 | `0028_section_auto_order.sql` | Adds `mobile_sections.auto_order` (default FALSE) — albums sections get a deterministic permutation reshuffled every 24 h UTC (`services/sectionOrder.js`); the saved manual order survives in `mobile_category_items`. |

---

#### 1.3 Enum types

| Enum | Schema | Values |
|---|---|---|
| `rateable_type` | production | `song, album, artist, playlist, program` |
| `pipeline_stage` | production | `concept, lyrics_drafting, lyrics_approved, song_generation, qa_review, engineering, sunil_approval, final_approval, published, distributed` — **ordinal order is load-bearing** (`0001_init.sql:65-78`) |
| `artist_grouping` | catalog | `inspire_family, affiliated_artists, childrens_brands, other_initiatives` |
| `five_fold` | catalog | `apostle, prophet, evangelist, pastor, teacher` |
| `review_status` | production | `published, pending, rejected, hidden` |
| `report_reason` | production | `spam, offensive_language, hate_speech, fake_review, other` |
| `report_status` | production | `open, actioned, dismissed` |
| `playback_source` | production | `album, playlist, search, recommendation, radio, direct, other` |
| `subscription_status` | production | `trialing, active, past_due, payment_failed, cancelled, expired, suspended` |
| `billing_interval` | production | `month, year` |
| `payment_status` | production | `pending, succeeded, failed, refunded, partially_refunded` |
| `family_member_status` | production | `active, removed` |
| `family_invitation_status` | production | `pending, accepted, revoked, expired` |
| `music_visibility` | production | `published, hidden, draft` |

---

#### 1.4 SCHEMA REFERENCE

##### A. Identity / Auth (`identity.*`)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **users** | `id UUID PK` (gen_random_uuid), `external_subject TEXT NOT NULL UNIQUE` (OIDC `sub`), `email CITEXT NOT NULL UNIQUE`, `display_name TEXT NOT NULL`, `avatar_url TEXT`, `is_active BOOL NN DEFAULT TRUE`, `last_login_at TIMESTAMPTZ`, `created_at`, `updated_at`, **+0005:** `first_signin_completed BOOL NN DEFAULT FALSE`, `locked_until TIMESTAMPTZ`, **+0017:** `first_name TEXT`, `last_name TEXT` | Partial idx `idx_users_locked_until WHERE locked_until IS NOT NULL`. Touch trigger. **Passwords are never stored here** — see `credentials`. |
| **user_roles** | `user_id UUID`, `role TEXT`, `granted_at`, `granted_by UUID` | PK `(user_id, role)`. FK `user_id → users(id) CASCADE`; FK `granted_by → users(id) SET NULL` (0009). CHECK `role IN (viewer, reviewer, content_editor, executive, admin)` — final form after 0013 + 0017. |
| **sessions** | `id UUID PK`, `user_id UUID NN`, `token_hash TEXT NN UNIQUE` (SHA-256), `ip_address INET`, `user_agent TEXT`, `created_at`, `last_seen_at`, `expires_at NN`, `revoked_at` | FK → users CASCADE. Partial idx `idx_sessions_user_active WHERE revoked_at IS NULL`. **Legacy** — the API is now pure-Bearer (see §2.9). |
| **credentials** (0002) | `user_id UUID PK`, `password_hash TEXT NN` (scrypt, salt embedded), `created_at`, `updated_at` | PK is also FK → users CASCADE (1:1). Touch trigger. |
| **password_resets** (0004) | `id UUID PK`, `user_id NN`, `token_hash TEXT NN UNIQUE`, `expires_at NN`, `used_at`, `request_ip INET`, `created_at` | FK → users CASCADE. `idx_password_resets_user (user_id, created_at DESC)`; partial `idx_password_resets_active (token_hash) WHERE used_at IS NULL`. |
| **login_verifications** (0005) | `id UUID PK`, `verification_guid UUID NN UNIQUE`, `user_id NN`, `code VARCHAR(6) NN`, `attempts INT DEFAULT 0`, `max_attempts INT DEFAULT 5`, `resend_count INT DEFAULT 0` (cap 2 ⇒ 3 codes then lockout), `last_resend_at`, `expires_at NN`, `verified_at`, `created_at` | FK → users CASCADE. Indexes on guid, user_id, expires_at. |
| **user_security_settings** (0005) | `user_id UUID PK`, `two_factor_enabled BOOL NN DEFAULT FALSE`, `created_at`, `updated_at` | FK → users CASCADE. Touch trigger created guarded via a `pg_trigger` existence check (`0005:62-69`). |
| **signup_verifications** (0006) | `id UUID PK`, `verification_guid UUID NN UNIQUE`, `email CITEXT NN`, `display_name TEXT NN`, `password_hash TEXT NN`, `code VARCHAR(6) NN`, `attempts`, `max_attempts`, `resend_count`, `last_resend_at`, `expires_at NN`, `verified_at`, `used_at`, `created_at` | **No FK to users** — the user does not exist yet. Indexes on guid, email, expires_at. |
| **service_idempotency** (0007) | `idempotency_key TEXT PK`, `endpoint TEXT NN`, `status_code INT NN`, `response_body JSONB NN`, `created_at` | Idx on created_at (for pruning). ~24 h retention enforced in-app. |
| **refresh_tokens** (0008) | `id UUID PK`, `user_id NN`, `token_hash TEXT NN UNIQUE`, `expires_at NN`, `revoked_at`, `created_at` | FK → users CASCADE. Partial idx `WHERE revoked_at IS NULL`. Sliding, non-rotating (the table comment saying "rotated each use" contradicts the file header at `0008:8-9` — the header is authoritative). |
| **audit_log** | `id BIGSERIAL PK`, `actor_user_id UUID`, `action TEXT NN`, `target_type TEXT`, `target_id TEXT` (string, polymorphic), `payload JSONB NN DEFAULT '{}'`, `created_at` | FK actor → users. Indexes `(actor, created_at DESC)`, `(target_type, target_id, created_at DESC)`. `REVOKE DELETE ... FROM PUBLIC`. |

##### B. Catalog (`catalog.*`)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **artists** | `id UUID PK`, `slug TEXT NN UNIQUE`, `display_name NN`, `grouping artist_grouping NN`, `bio`, `genre_anchor`, `five_fold_primary`, `five_fold_secondary`, `visual_identity_url`, `avatar_asset_id UUID`, `ohi_default BOOL NN TRUE`, `avg_rating NUMERIC(3,2)`, `rating_count INT NN 0`, `created_at`, `updated_at` | CHECK `five_fold_primary IS NULL OR primary <> secondary`. Idx on grouping. FK `avatar_asset_id → assets(id) SET NULL` (added post-hoc at `0001:328-330`). avg/count denormalized by trigger. |
| **albums** | `id UUID PK`, `artist_id NN`, `slug NN`, `title NN`, `title_translations JSONB`, `cover_asset_id UUID`, `release_date DATE`, `language_primary TEXT NN 'en'`, `languages TEXT[]`, `genre_tags TEXT[]`, `cci_internal BOOL NN FALSE`, `is_published BOOL NN FALSE`, `avg_rating`, `rating_count`, `created_at`, `updated_at` | FK `artist_id → artists RESTRICT`; FK `cover_asset_id → assets SET NULL`. UNIQUE `(artist_id, slug)`. Idx on artist_id. `cci_internal` is internal-only, never serialized to public JSON. |
| **songs** | `id UUID PK`, `album_id NN`, `track_number INT NN`, `title NN`, `title_translations JSONB`, `duration_seconds`, `language_primary`, `languages_secondary TEXT[]`, `genre_tags TEXT[]`, `five_fold_office`, `audio_asset_id UUID`, `isrc`, `bpm`, `music_key`, `cci_internal`, `avg_rating`, `rating_count`, `created_at`, `updated_at` | FK `album_id → albums CASCADE`; FK `audio_asset_id → assets SET NULL`. UNIQUE `(album_id, track_number)`. CHECKs: `track_number BETWEEN 1 AND 99`, `duration_seconds > 0`, `bpm BETWEEN 30 AND 300`. |
| **lyrics** | `id UUID PK`, `song_id NN`, `language NN`, `format TEXT NN 'plain'`, `body TEXT NN`, `is_primary BOOL`, `created_at`, `updated_at` | FK → songs CASCADE. UNIQUE `(song_id, language)`. CHECK `format IN ('plain','lrc')`. |
| **assets** | `id UUID PK`, `kind TEXT NN`, `storage_url NN`, `mime_type NN`, `bytes BIGINT`, `sha256 TEXT`, `uploaded_by UUID`, `uploaded_at`, `metadata JSONB` | CHECK `kind IN (audio, cover, avatar, banner, document)`. FK uploaded_by → users. Idx on kind. Pointers to R2 objects on `cdn.jubileeverse.com`. |
| **scripture_references** | `id UUID PK`, `song_id NN`, `osis_ref TEXT NN` (e.g. `Isa.62.5`), `display_ref TEXT NN`, `translation TEXT`, `created_at` | FK → songs CASCADE. UNIQUE `(song_id, osis_ref, translation)`. Idx on song_id. |

##### C. Editorial / Pipeline (`production.*`)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **pipeline_state** | `id UUID PK`, `rateable_type NN`, `rateable_id UUID NN`, `current_stage NN DEFAULT 'concept'`, `assignee_user_id UUID`, `entered_stage_at`, `updated_at` | UNIQUE `(rateable_type, rateable_id)`. CHECK type ∈ (song, album). Idx on stage; partial idx on assignee. FK assignee → users. Carries the 12-song-lock + auto-promote triggers. |
| **pipeline_history** | `id BIGSERIAL PK`, `rateable_type NN`, `rateable_id NN`, `from_stage` (null on entry), `to_stage NN`, `actor_user_id` (nullable after 0009), `note`, `occurred_at` | FK actor → users SET NULL. Idx `(type, id, occurred_at DESC)`, `(actor, occurred_at DESC)`. `REVOKE DELETE, TRUNCATE FROM PUBLIC`. |
| **publications** | `id UUID PK`, `rateable_type NN`, `rateable_id NN`, `version INT NN`, `cdn_path NN`, `content_hash NN` (sha256 of manifest body), `published_by` (nullable after 0009), `published_at` | UNIQUE `(type, id, version)`. Idx `(type, id, version DESC)`. R2 is overwrite-in-place; this is the version trail. |
| **ratings** (editorial) | `id UUID PK`, `rateable_type NN`, `rateable_id NN`, `rater_user_id NN`, `stars SMALLINT NN`, `note`, `created_at`, `updated_at` | CHECK `stars BETWEEN 1 AND 5`. UNIQUE `(type, id, rater)`. Idx on target. Drives the `catalog.*.avg_rating` denorm trigger. |
| **comments** | `id UUID PK`, `rateable_type NN`, `rateable_id NN`, `author_user_id NN`, `parent_id UUID`, `body TEXT NN`, `lyric_line INT`, `mentions UUID[]`, `created_at`, `updated_at`, `deleted_at` | Self-FK `parent_id` CASCADE (one level threading). CHECK `length(trim(body)) > 0`. Two partial indexes filtered on `deleted_at IS NULL`. Never appears in public JSON. |
| **award_categories** | `id UUID PK`, `name NN UNIQUE`, `description`, `rateable_type NN`, `active BOOL`, `created_at` | CHECK type ∈ (song, album). 11 seeded. |
| **award_periods** | `id UUID PK`, `category_id NN`, `year INT NN`, `opens_at NN`, `closes_at NN`, `status TEXT NN 'open'` | UNIQUE `(category_id, year)`. CHECK `year BETWEEN 2020 AND 2100`, `closes_at > opens_at`, `status ∈ (open, closed, awarded)`. |
| **nominations** | `id UUID PK`, `period_id NN`, `rateable_type NN`, `rateable_id NN`, `nominator_id NN`, `reason TEXT NN`, `created_at` | **CHECK `length(trim(reason)) >= 250`** (named `reason_min_length`). UNIQUE `(period, type, id, nominator)`. Idx `(period, type, id)`. |
| **awards** | `id UUID PK`, `period_id NN`, `rateable_type NN`, `rateable_id NN`, `award_type TEXT NN 'winner'`, `citation`, `awarded_at`, `awarded_by` (nullable after 0009) | CHECK `award_type ∈ (winner, honorable_mention)`. UNIQUE `(period, type, id, award_type)`. |

##### D. Radio (`radio.*`)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **stations** | `id UUID PK`, `call_sign TEXT NN UNIQUE`, `display_name NN`, `description`, `frequency NUMERIC(6,2) NN UNIQUE`, `genre_anchors TEXT[]`, `persona_affinity UUID[]`, `is_active`, `avg_rating`, `rating_count`, `created_at`, `updated_at` | CHECK `frequency BETWEEN 300.00 AND 399.90`. Double-UNIQUE on call_sign **and** frequency so the two can never disagree. 101 HM-band channels. |
| **programs** | `id UUID PK`, `name NN`, `description`, `host_artist_id`, `station_id`, `schedule_cron TEXT`, `duration_min INT NN`, `is_active`, `avg_rating`, `rating_count`, timestamps | FKs → `catalog.artists` SET NULL, → `stations` SET NULL. CHECK `duration_min > 0`. Partial idx on station_id. |
| **playlists** | `id UUID PK`, `name NN`, `description`, `program_id`, `created_by` (nullable after 0009), `avg_rating`, `rating_count`, timestamps | FK program → programs SET NULL; FK created_by → users SET NULL. Partial idx on program_id. |
| **playlist_items** | `id UUID PK`, `playlist_id NN`, `song_id NN`, `position INT NN`, `transition TEXT` | FK playlist CASCADE, FK song **RESTRICT**. UNIQUE `(playlist_id, position)`. CHECK `position >= 0`, `transition ∈ (crossfade, hard_cut, sweeper)`. |
| **schedules** | `id UUID PK`, `station_id NN`, `daypart TEXT NN`, `day_of_week SMALLINT`, `start_minute SMALLINT NN`, `end_minute SMALLINT NN`, `program_id`, `playlist_id`, `is_active`, `created_at` | CHECK daypart ∈ (morning, midday, evening, overnight); minute ranges 0-1439 / 1-1440; `end > start`; **exactly-one XOR**: `(program_id IS NOT NULL)::int + (playlist_id IS NOT NULL)::int = 1` (`0001:663`). Idx `(station_id, daypart)`. |

##### E. Engagement — public reviews, likes, playlists (`production.*`)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **user_reviews** (0010) | `id UUID PK`, `target_type NN`, `target_id NN`, `reviewer_user_id NN`, `stars SMALLINT NN`, `title TEXT` (≤150), `body TEXT` (≤5000), `helpful_count INT NN 0`, `status review_status NN 'published'`, `created_at`, `updated_at`, `deleted_at` | CHECK type ∈ (album,song), `stars 1..5`, length CHECKs on title/body. `uq_user_reviews_one_per_target UNIQUE (target_type, target_id, reviewer_user_id)`. **5 partial indexes**: recent / top / helpful (all `WHERE deleted_at IS NULL AND status='published'`), reviewer, status. **No touch trigger by design** (`0010:320-323`) so `updated_at > created_at` reliably means author-edited. |
| **review_helpful_votes** | `review_id`, `user_id`, `created_at` | PK `(review_id, user_id)`. Both FKs CASCADE. Idx on user_id. Drives `helpful_count` via trigger. |
| **review_reports** | `id UUID PK`, `review_id NN`, `reporter_user_id NN`, `reason report_reason NN`, `detail` (≤1000), `status report_status NN 'open'`, `created_at`, `resolved_at`, `resolved_by` | UNIQUE `(review_id, reporter_user_id)`. FK resolved_by → users SET NULL. Idx `(status, created_at DESC)`, `(review_id)`. A report alone never hides a review. |
| **review_moderation_log** | `id BIGSERIAL PK`, `review_id UUID NN` (**deliberately NOT a FK** so the trail survives hard deletes), `moderator_user_id`, `action TEXT NN`, `reason`, `prev_status`, `new_status`, `created_at` | CHECK `action ∈ (approve, reject, hide, restore, delete)`. `REVOKE DELETE, TRUNCATE FROM PUBLIC`. |
| **review_notifications** | `id UUID PK`, `user_id NN`, `kind TEXT NN`, `review_id UUID`, `data JSONB`, `read_at`, `created_at` | CHECK kind ∈ (helpful_vote, review_approved, review_rejected, review_removed). Partial idx `WHERE read_at IS NULL`. |
| **review_summaries** | `target_type`, `target_id`, `avg_stars NUMERIC(3,2)`, `rating_count`, `review_count`, `dist_1..dist_5`, `updated_at` | PK `(target_type, target_id)` — hot read path is a single PK lookup. Two partial "top" indexes split by target_type. Trigger-maintained cache. |
| **user_likes** (0011) | `user_id`, `target_type`, `target_id`, `created_at` | PK `(user_id, target_type, target_id)`. FK user CASCADE. Idx `(user_id, created_at DESC)`, `(target_type, target_id)`. |
| **user_playlists** (0003) | `id UUID PK`, `owner_user_id NN`, `name NN`, `description`, `is_public BOOL NN FALSE`, `created_at`, `updated_at` | CHECK `length(trim(name)) > 0`. FK owner CASCADE. Idx `(owner, created_at DESC)`. Touch trigger. |
| **user_playlist_items** (0003) | `id UUID PK`, `playlist_id NN`, `song_id NN`, `position INT NN`, `added_at` | FKs CASCADE (both). UNIQUE `(playlist_id, position)` **and** `(playlist_id, song_id)`. |

##### F. Analytics (`production.*`)

| Table | Columns | Constraints / Indexes |
|---|---|---|
| **playback_events** (0012) | `id BIGSERIAL PK`, `user_id` (SET NULL), `session_id TEXT`, `album_id UUID`, `song_id UUID`, `artist_id UUID`, `device_type`, `browser`, `os`, `ip_address INET`, `source playback_source NN 'other'`, `started_at NN`, `ended_at`, `listening_seconds INT NN 0`, `duration_seconds`, `completion_pct NUMERIC(5,2) NN 0`, `completed BOOL`, `skipped BOOL`, `created_at` | **album_id/song_id/artist_id are bare UUIDs — no FKs** (the manifest, not the DB, owns the catalog). 6 indexes incl. the expression index `idx_pbe_day ON (((started_at AT TIME ZONE 'UTC')::date))`. CHECKs on seconds ≥0 and `completion_pct 0..100`. `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC`. Designed for future RANGE partitioning by month (`0012:9-12`). |
| **analytics_daily** (0012) | `day DATE PK`, `plays INT`, `listening_seconds BIGINT`, `completed_plays`, `skipped_plays`, `updated_at` | Incremental rollup cache for trend/total cards. |
| **now_playing** (0018) | `session_id TEXT PK`, `user_id` (CASCADE), `song_id UUID`, `ip_address INET`, `started_at`, `updated_at` | Idx `(updated_at DESC)`. Ephemeral presence, ~25 s heartbeat, live-if-<45 s. |

##### G. Subscriptions & Billing (`production.*`, all 0014 unless noted)

| Table | Columns | Constraints / Indexes / FKs |
|---|---|---|
| **subscription_plans** | `id UUID PK`, `code TEXT NN UNIQUE`, `name NN`, `tagline`, `description`, `price_cents INT NN 0`, `currency TEXT NN 'usd'`, `billing_interval NN 'month'`, `max_members INT NN 1`, `daily_song_limit INT` (**NULL = unlimited**), `preview_seconds INT NN 60`, `is_paid BOOL`, `features JSONB NN '[]'`, `highlighted BOOL`, `cta_label`, `provider`, `provider_product_id`, `provider_price_id`, `is_active`, `sort_order`, timestamps | CHECKs `price_cents >= 0`, `max_members >= 1`, `daily_song_limit >= 0`, `preview_seconds >= 0`. Touch trigger. Seeded free/individual/family at $0 / $3.95 / $7.95 per month. |
| **subscriptions** | `id UUID PK`, `user_id NN`, `plan_id NN`, `status NN 'active'`, `provider`, `provider_customer_id`, `provider_subscription_id`, `current_period_start/end`, `cancel_at_period_end BOOL`, `cancelled_at`, `trial_end`, `started_at`, timestamps | FK user CASCADE, FK plan (NO ACTION). **`uq_subscriptions_one_live_per_user` — partial UNIQUE on `(user_id)` WHERE status IN (trialing, active, past_due, payment_failed, suspended)** (`0014:112-114`): at most one non-terminal subscription per user. 4 further indexes. Touch trigger. |
| **family_groups** | `id UUID PK`, `subscription_id NN UNIQUE`, `owner_user_id NN`, `max_members INT NN 6`, timestamps | Both FKs CASCADE. Touch trigger. |
| **family_members** | `id UUID PK`, `family_group_id NN`, `user_id NN`, `is_owner BOOL`, `status family_member_status NN 'active'`, `joined_at`, `removed_at` | `uq_family_member UNIQUE (group, user)` **plus** partial UNIQUE `uq_family_member_active_user ON (user_id) WHERE status='active'` — a user can be in at most one active family. |
| **family_invitations** | `id UUID PK`, `family_group_id NN`, `email CITEXT NN`, `token TEXT NN UNIQUE`, `status NN 'pending'`, `invited_by`, `accepted_user_id`, `expires_at NN`, `accepted_at`, timestamps | Partial UNIQUE `(group, email) WHERE status='pending'` — one outstanding invite. Partial idx on email. Touch trigger. |
| **subscription_transactions** | `id UUID PK`, `subscription_id` (SET NULL), `user_id NN` (CASCADE), `type TEXT NN`, `provider`, `provider_ref`, `amount_cents`, `currency`, `status TEXT NN 'pending'`, `metadata JSONB`, `created_at` | Free-text `type`: checkout \| activation \| renewal \| cancellation \| reactivation \| plan_change \| refund. Two `(…, created_at DESC)` indexes. |
| **payment_records** | `id UUID PK`, `subscription_id` (SET NULL), `user_id NN`, `provider`, `provider_invoice_id`, `provider_payment_intent`, `amount_cents INT NN 0`, `currency`, `status payment_status NN 'pending'`, `description`, `invoice_url`, **`invoice_pdf_url`** (0016), `refunded_cents INT NN 0`, `paid_at`, `created_at` | Partial idx on `provider_invoice_id`. **No card/PAN data — opaque gateway references only.** |
| **subscription_renewals** | `id UUID PK`, `subscription_id NN` (CASCADE), `period_start NN`, `period_end NN`, `amount_cents`, `currency`, `status TEXT NN 'scheduled'`, `payment_record_id` (SET NULL), `created_at` | Idx `(subscription_id, period_end DESC)`. |
| **subscription_history** | `id UUID PK`, `subscription_id` (SET NULL), `user_id NN`, `event TEXT NN`, `from_status`, `to_status`, `from_plan`, `to_plan`, `actor TEXT NN 'system'`, `actor_user_id`, `metadata JSONB`, `created_at` | `actor ∈ user\|system\|admin\|webhook` (by convention, not CHECK). `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC`. |
| **daily_listening_counters** | `user_id`, `day DATE`, `songs_played INT NN 0`, `limited_plays INT NN 0`, `updated_at` | PK `(user_id, day)`. `day` is the **local day per `LISTENING_TZ`**, so the quota resets by simply landing on a new day row. |
| **subscription_notifications** | `id UUID PK`, `user_id NN`, `type TEXT NN`, `title NN`, `body`, `read_at`, `email_sent BOOL`, `metadata JSONB`, `created_at` | Partial idx `WHERE read_at IS NULL`. Mirrors the outbound emails. |

Money is stored exclusively as integer minor units (cents) to avoid float drift (`0014:23`). "Free" is modeled as the **absence** of an active paid row, not a stored row (`0014:21-22`).

##### H. Manage Music (`production.*`, 0015)

| Table | Columns | Notes |
|---|---|---|
| **music_album_state** | `album_code TEXT PK`, `album_id UUID NN` (= `albumUuid(code)`), `title`, `artist_slug`, `artist_name`, `category`, `release_year`, `cdn_path`, `cover_url`, `song_count`, `audio_present_count`, `audio_missing_count`, `cover_present BOOL` (NULL = unprobed), `metadata_complete`, `visibility music_visibility NN 'draft'`, `visibility_source TEXT NN 'auto'`, `validation JSONB`, `present_in_manifest BOOL NN TRUE`, `last_modified_at`, `last_synced_at`, `published_at`, `hidden_at`, timestamps | 9 indexes including two `lower()` expression indexes for case-insensitive title/artist search. `visibility_source ∈ (auto, manual)` — `manual` means sync must **not** override the admin's choice. |
| **music_song_state** | `song_id UUID PK` (= `songUuid(code, n)`), `album_code NN`, `album_id NN`, `track_number NN`, `title`, `artist_name`, `duration_seconds`, `cdn_path`, `mp3_url`, `mp3_available`, `lyrics_available`, `metadata_complete`, `visibility`, `visibility_source`, `present_in_manifest`, `last_modified_at`, `last_synced_at`, timestamps | 5 indexes incl. `lower(title)`. Keyed by the deterministic song UUID, **not** an FK to `catalog.songs`. |
| **music_sync_runs** | `id BIGSERIAL PK`, `trigger`, `status`, `actor_user_id`, `started_at`, `finished_at`, 8 counters (albums/songs × scanned/new/updated/removed), `missing_covers`, `missing_audio`, `summary JSONB`, `log JSONB`, `error`, `created_at` | CHECK `trigger ∈ (manual, scheduled)`, `status ∈ (running, success, error)`. |
| **music_validation_results** | `id BIGSERIAL PK`, `album_code NN`, `check_name NN`, `passed BOOL NN`, `detail`, `checked_at` | UNIQUE `(album_code, check_name)` — latest result per check. Partial idx `WHERE passed = FALSE`. |
| **music_sync_config** | `id INTEGER PK DEFAULT 1 CHECK (id = 1)`, `schedule TEXT NN 'off'`, `enabled BOOL`, `last_run_at`, `next_run_at`, `updated_by`, `updated_at` | **Singleton via `CHECK (id = 1)`**. `schedule ∈ (off, hourly, 6h, 12h, daily, weekly)`. Row pre-inserted. |
| **music_activity_log** | `id BIGSERIAL PK`, `actor_user_id`, `actor_name`, `action TEXT NN`, `target_type TEXT NN`, `target_id`, `previous_value JSONB`, `new_value JSONB`, `created_at` | CHECK `target_type ∈ (album, song, sync, config, bulk)`. `REVOKE UPDATE, DELETE, TRUNCATE FROM PUBLIC`. |

##### I. Mobile CMS (`production.*`, 0020-0028)

| Table | Columns | Notes |
|---|---|---|
| **mobile_app_versions** (0020) | `platform TEXT PK CHECK (platform IN ('ios','android'))`, `latest_version NN`, `min_supported_version NN`, `store_url NN`, `title`, `message`, `mandatory BOOL NN FALSE`, `updated_at` | Read by public `GET /api/app-version/check`. |
| **mobile_categories** (0021) | `id BIGSERIAL PK`, `key TEXT NN UNIQUE`, `label NN`, `kind TEXT NN`, `display_order`, `is_active`, `is_visible`, `updated_by`, timestamps, **+0022:** `hero_enabled BOOL NN FALSE`, **+0027:** `hero_autorotate BOOL NN FALSE` | `kind ∈ (curated, personas, albums, music_type)`. `is_active` = present at all; `is_visible` = soft hide. 5 rows seeded. |
| **mobile_sections** (0023) | `id BIGSERIAL PK`, `category_id NN` (CASCADE), `name TEXT NN`, `kind TEXT NN CHECK (kind IN ('artists','albums'))`, `display_order`, `is_active`, `updated_by`, timestamps, **+0026:** `show_genre BOOL NN FALSE`, **+0028:** `auto_order BOOL NN FALSE` | Idx `(category_id, display_order)`. Both new toggles are albums-only in effect. |
| **mobile_category_items** (0021, re-pointed 0023) | `id BIGSERIAL PK`, `category_id NN` (CASCADE, kept denormalized), `item_type TEXT NN CHECK (∈ album, artist, collection)`, `item_ref TEXT NN`, `title`, `album_refs TEXT[]` (collections), `display_order`, `is_active`, `created_at`, **+0023:** `section_id BIGINT` (CASCADE, **nullable**) | Uniqueness moved from `(category, type, ref)` → `mobile_category_items_section_item_key UNIQUE (section_id, item_type, item_ref)` at `0023:44-49`, so the same album/artist can recur across pages/sections. |
| **mobile_music_types** (0021) | `id BIGSERIAL PK`, `genre TEXT NN UNIQUE`, `label NN`, `display_order`, `is_pinned BOOL`, `is_active`, `updated_by`, timestamps | 5 pinned genres seeded: Contemporary, Praise & Worship, Country, Pentecostal Shout, Gospel. Non-pinned genres auto-surface at ≥ `min_album_count` albums. |
| **mobile_music_type_albums** (0024) | `id BIGSERIAL PK`, `music_type_id NN` (CASCADE), `album_ref TEXT NN`, `display_order`, `is_active`, `created_at` | UNIQUE `(music_type_id, album_ref)`. Manual override of tag matching. |
| **mobile_hero_slides** (0022) | `id BIGSERIAL PK`, `category_id NN` (CASCADE), `album_ref TEXT NN`, `headline`, `subtitle`, `display_order`, `is_active`, `starts_at`, `ends_at`, `updated_by`, timestamps | Optional scheduling window (NULL = always). |
| **mobile_settings** (0021) | `id INTEGER PK DEFAULT 1 CHECK (id = 1)`, `min_album_count INT NN 12`, `updated_by`, `updated_at` | Singleton. |

Item refs across the whole mobile CMS are **manifest identifiers** (`album_code` like `CAIM1001EN`, `artist_slug` like `jubilee-inspire`), never catalog UUIDs — deliberately so the app can resolve them against its own manifest copy.

##### J. Ops (`production.*` / `public.*`)

| Table | Columns | Notes |
|---|---|---|
| **cover_updates** (0019) | `album_code TEXT PK`, `version INT NN 1`, `content_type`, `bytes`, `updated_by`, `updated_at`, `synced_to_j BOOL NN FALSE`, `synced_at` | Partial idx `(updated_at) WHERE synced_to_j = FALSE` — the pending-J:-drive-sync queue. `version` drives `?v=` cache-bust. |
| **public._migrations** | `name TEXT PK`, `applied_at TIMESTAMPTZ NN` | Created by `db/run-migrations.js:58-61`. Ledger key format is `"<label>/<file>"`, e.g. `migrations/0014_subscriptions.sql`, `seed/02_stations.sql` (`run-migrations.js:25`). |

---

#### 1.5 Triggers & derived state

| Trigger fabric | Behavior |
|---|---|
| `production.touch_updated_at()` | Generic `NEW.updated_at = NOW()`. Wired to 11 tables in 0001, then also to credentials (0002), user_playlists (0003), user_security_settings (0005), and 4 subscription tables (0014). **Redefined verbatim** in `0014:288-294` — harmless but redundant. |
| `trg_ratings_aggregate` | `AFTER INSERT/UPDATE/DELETE ON production.ratings` → `recompute_rating_aggregate()` rewrites `avg_rating`/`rating_count` on the correct parent by dispatching on `rateable_type` across `catalog.songs/albums/artists` and `radio.playlists/programs` (`0001:720-771`). On UPDATE with a moved target it refreshes **both** old and new. |
| `trg_album_12_song_lock` | `BEFORE INSERT/UPDATE OF current_stage ON pipeline_state` — raises an exception if an `inspire_family` album reaches `published` without exactly 12 songs (`0001:779-809`). |
| `trg_auto_promote_album` | `AFTER INSERT/UPDATE OF current_stage ON pipeline_state` — when a song hits `published` and all album siblings are published/distributed, promotes the album and sets `albums.is_published = TRUE` (`0001:816-890`). |
| `trg_user_review_summary` | `AFTER INSERT/DELETE OR UPDATE OF stars, body, status, deleted_at, target_type, target_id` — deliberately **excludes `helpful_count`** so vote flurries don't churn the summary (`0010:292-298`). |
| `trg_helpful_vote_count` | `AFTER INSERT/DELETE ON review_helpful_votes` → recounts `user_reviews.helpful_count`. |

**Two latent defects worth flagging in `auto_promote_album`:**

1. `0001:864-867` — the `v_album_state IS NULL` branch executes `INSERT INTO pipeline_history … SELECT 'album', v_album_id, NULL, 'published', NEW.actor_user_id_dummy, NULL WHERE FALSE`. `pipeline_state` has **no** `actor_user_id_dummy` column, and PL/pgSQL resolves `NEW.<field>` at plan time regardless of `WHERE FALSE` — so this branch will raise `record "new" has no field "actor_user_id_dummy"` if ever reached (album has no `pipeline_state` row when its last song publishes). The comment at `0001:883-886` frames the dead statement as intentional, but the field reference makes it a live landmine, not a no-op.
2. The same branch `INSERT`s into `pipeline_state`, which re-fires both `trg_auto_promote_album` and `trg_album_12_song_lock` recursively.

Also: `0010:81-85` comments claim the one-review-per-target constraint is a *partial* unique "so a soft-deleted row doesn't block the user re-rating later" — the emitted constraint is a **plain** `UNIQUE (target_type, target_id, reviewer_user_id)`. A soft-deleted row **will** block re-rating. Comment and code disagree; code wins.

---

#### 1.6 ID generation strategy (`db/ids.js`, `api/src/ids.js`)

**Not** prefixed ids and **not** ULIDs. Two distinct mechanisms coexist:

1. **Database-generated UUIDv4** — every `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` column (users, sessions, ratings, comments, subscriptions, …). Random, opaque, DB-assigned.

2. **Deterministic UUIDv5** for catalog identity. The manifest — not Postgres — is authoritative for the catalog, so album/song/artist UUIDs must be derivable identically by the DB importer, the API, and the browser without a lookup. All three derive them from a fixed namespace:

```js
JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f'   // db/ids.js:11 — "Do NOT change"

albumUuid(code)      = uuidv5('album:'  + code.toUpperCase(),           NS)
songUuid(code, n)    = uuidv5('song:'   + code.toUpperCase() + ':' + n, NS)
artistUuid(slug)     = uuidv5('artist:' + slug.toLowerCase(),           NS)
```

Case normalization is asymmetric and deliberate: album/song codes are **upper**cased, artist slugs **lower**cased. The scheme is triplicated across `app/db/ids.js` (CommonJS), `app/api/src/ids.js` (ESM), and `app/web/lib/ids.ts` — `api/src/ids.js:3-4` explicitly warns they must stay in lockstep. Changing the namespace would orphan every editorial row keyed to a `rateable_id`.

`api/src/ids.js:12-13` adds `isUuid(s)` — a strict regex used to guard polymorphic `rateable_id` inputs before they reach a query, since those columns carry no FK.

---

#### 1.7 Connection pooling & health (`api/src/db.js`)

```js
new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000,
           ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined })
```

| Aspect | Behavior |
|---|---|
| Pool size | `max: 10`, `idleTimeoutMillis: 30_000`. No `connectionTimeoutMillis` or statement timeout configured. |
| TLS | `db.js:11` — SSL is enabled **only** on the exact string `PGSSLMODE === 'require'`, and then with **`rejectUnauthorized: false`** (encrypted but unauthenticated — no cert validation, MITM-capable). Note this reads `process.env` directly, bypassing `config`. |
| Idle-client errors | `pool.on('error')` logs at `error` level rather than crashing (`db.js:14-16`). |
| `query(text, params)` | Thin passthrough. Comment at line 18 mandates always-parameterized, never-interpolated. |
| `withTransaction(fn)` | Checks out a dedicated client, `BEGIN` → `fn(client)` → `COMMIT`, `ROLLBACK` on throw, `client.release()` in `finally` (`db.js:24-37`). Note: if `ROLLBACK` itself throws, that error masks the original. |
| `healthCheck()` | `SELECT 1` → `true`; **any** exception → `false`. Errors are swallowed entirely — `catch {}` with no logging (`db.js:39-46`), so a failing health check gives no diagnostic trail. |
| Consumer | `GET /health` returns `200 {status:'healthy', db:true}` or **`503 {status:'degraded', db:false}`** (`index.js:92-95`). |

---

#### 1.8 Migration runner, seeds, importers

**`db/run-migrations.js`** — the path for managed Postgres (Neon/Supabase/RDS) where docker's auto-init doesn't apply.

- `node db/run-migrations.js` → migrations only; `--seed` → migrations + `db/seed/*.sql`.
- Loads `../.env` relative to `db/` (i.e. `app/.env`), requires `DATABASE_URL` or exits 1.
- Ensures `public._migrations`, then for each `.sql` in lexical order: skip if the ledger key exists, else `BEGIN` → run whole file → insert ledger row → `COMMIT`; on failure `ROLLBACK` and rethrow (`run-migrations.js:33-43`). **Each file is one transaction**, which is why individual migrations carry no `BEGIN`/`COMMIT` (noted in 0009 and 0017 headers).

**`db/seed/*.sql`** (3 files, applied only with `--seed`):

| File | Contents |
|---|---|
| `01_award_periods.sql` | Opens one 2026 nomination window per active award category; idempotent on `(category_id, year)`. |
| `02_stations.sql` | `DO $$` loop filling HM 300.00–399.00 (100 integer channels) + HM 399.90 = the full 101-station roster; `ON CONFLICT (call_sign) DO NOTHING` preserves the 8 hand-named ones from 0001. |
| `03_demo_editorial.sql` | A second demo user (`22222222-…`, "Demo Editor"). ⚠️ **Grants `radio_producer`** — a role deleted by migration 0017 and rejected by the current CHECK. Running `--seed` against a 0017+ database will fail this file. |

**`db/import-catalog.js`** — one-way mirror of the manifest into `catalog.*` so editorial rows keyed by `rateable_id` can join real catalog rows. Reads `MANIFEST_PATH` (default `app/web/public/music/catalog-manifest.json`), maps manifest category keys → the four groupings (`import-catalog.js:27-32`: `inspire`→inspire_family, `party-giggles`/`tiny-tiggles`→childrens_brands, `faith-based`/`general`→affiliated_artists, else other_initiatives), then upserts artists/albums/songs using the deterministic UUIDs. Whole run is one transaction. Skips tracks whose `n` isn't an integer in 1–99 (line 77-78). Also seeds two demo ratings + a comment on the first playable album — the comment insert has **no** `ON CONFLICT`, so re-running accumulates duplicate comments.

**`db/seed-analytics-demo.js`** — explicitly *not* a migration. Inserts ~4000 (or `argv[2]`) synthetic `playback_events` over 90 days in batches of 500, then rebuilds `analytics_daily` via a grouped `INSERT … ON CONFLICT (day) DO UPDATE`. Sessions are tagged `demo-*` so cleanup is `DELETE … WHERE session_id LIKE 'demo-%'`.

---

### PART 2 — RUNTIME & OPS

#### 2.1 Package topology

`app/package.json` is an npm-workspaces root over **`web`, `api`, `mock-oidc`**; engines `node >= 20`.

| Script | Command |
|---|---|
| `dev` | `npm-run-all --parallel dev:api dev:web dev:oidc` |
| `dev:api` / `dev:web` / `dev:oidc` | delegate to each workspace |
| `build` | `npm --workspace web run build` |
| `db:migrate` | `node db/run-migrations.js` |
| `db:import` | `node db/import-catalog.js` |
| `db:seed` | `node db/run-migrations.js --seed` |
| `smoke` | `node api/scripts/smoke.mjs` |

| Workspace | Runtime | Key deps |
|---|---|---|
| `api` (`jubileepraise-api`, ESM, `node --watch src/index.js` in dev) | Express 4.19 | `helmet` 7, `cors`, `express-rate-limit` 7, `pino` 9 + `pino-http` 10, `pg` 8, `zod` 3, `jose` 5, `stripe` 16, `@sendgrid/mail` 8, `@aws-sdk/client-s3` (R2), `cookie-parser` (vestigial — the API is cookie-free), `uuid`, `dotenv` |
| `web` (`jubileepraise-web`) | **Next.js 14.2.33**, React 18.3.1, TypeScript 5.9.3, `zustand` 4.5 | dev/start on **:3000** |
| `mock-oidc` | Express + `jose` only | :4010 |

There is a **second, unrelated** `package.json` at the repo root (`W:\JubileePraise.com\package.json`, `@jubilee/jubileepraise`) whose `main` is `server.js` — a zero-dependency 36 KB Node server. **This is what actually runs in production** (PM2 `jubilujah`, port 3119); the `app/` Next.js+API stack is the migration target, not the deployed artifact. See §2.9.

#### 2.2 `docker-compose.yml` — local stack

| Service | Image / build | Ports | Notes |
|---|---|---|---|
| `postgres` | `postgres:16-alpine` | 5432:5432 | user/pw/db = `jubilee` / `jubilee_dev_pw` / `jubileepraise`; named volume `jubilee_pgdata`; healthcheck `pg_isready` every 5 s ×10 |
| `mock-oidc` | build `./mock-oidc` (node:20-alpine) | 4010:4010 | env: `MOCK_OIDC_PORT/ISSUER`, `OIDC_CLIENT_ID/SECRET`, `OIDC_REDIRECT_URI` |

⚠️ **Two ops traps in the compose init path:**

1. It bind-mounts only **`0001`–`0009`** into `/docker-entrypoint-initdb.d/` (`docker-compose.yml:25-36`). Migrations **0010 through 0028 are missing** — a fresh `docker compose up` yields a database with no reviews, likes, analytics, subscriptions, Manage Music, or mobile CMS.
2. Auto-init writes **nothing** to `public._migrations`. So running `npm run db:migrate` afterwards to pick up 0010+ will start at 0001 and re-execute it — and 0001's `CREATE TYPE`/`CREATE TABLE`/`CREATE TRIGGER` statements have no `IF NOT EXISTS`, so it aborts. The practical clean-slate path is `docker compose down -v` then a bare Postgres + `npm run db:migrate` (never both init routes).

#### 2.3 Environment variables

##### Documented in `app/.env.example`

| Variable | Default in example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://jubilee:jubilee_dev_pw@localhost:5432/jubileepraise` | Postgres DSN. The `jubileepraise` database is a clone of `jubilujah` (2026-09-17, `db/clone-jubilujah.sh` + migration 0035). Prod: `jubileepraise_app@localhost:5432/jubileepraise` on the VPS. |
| `PGSSLMODE` | `disable` | Only the literal `require` turns on TLS, and then without cert validation (`db.js:11`). |
| `API_PORT` | `4000` | Express listen port. |
| `NODE_ENV` | `development` | Drives default log level and general env gating. |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated browser-origin allow-list; parsed to `config.corsOrigins`. |
| `SESSION_SECRET` | `dev-only-change-me-please-32-bytes-min` | Signing secret; also the **fallback** for `JWT_SECRET`. 32+ random bytes in prod. |
| `COOKIE_DOMAIN` | *(blank)* | **DEAD** — not referenced anywhere in `api/src` or `web`. Vestige of the removed cookie flow. |
| `SESSION_TTL_HOURS` | `12` | **DEAD** — not referenced anywhere. |
| `AUTH_LOGIN_MODE` | `local` | `local` = verify against `identity.credentials`; `ji` = delegate to JubileeInspire's `/api/auth/login`. Anything other than `ji` normalizes to `local` (`config.js:40`). Rollback is env-only + restart, no redeploy. |
| `JI_LOGIN_BASE` | `https://api.jubileeinspire.com` | JI login API base; falls back to `JI_API_BASE` then the prod default. |
| `JI_LOGIN_SOURCE` | `jubilujah` | Platform tag sent as `source` so JI knows the origin app. |
| `JI_API_BASE` | `https://api.jubileeinspire.com` | JI service/admin API: password sync, provisioning, pre-signup `check-email`. |
| `JI_SERVICE_CLIENT_ID` | *(blank)* | Client-credentials id for JI's `/api/auth/service/token`. Blank ⇒ sync/provisioning no-op. |
| `JI_SERVICE_CLIENT_SECRET` | *(blank)* | Matching secret. Blank ⇒ `check-email` degrades to the unauthenticated call. |
| `JI_CHECK_EMAIL_TIMEOUT_MS` | `4000` | Hard deadline for the synchronous pre-signup check; **fails open** (allows signup) on timeout. |
| `OIDC_ISSUER` | `http://localhost:4010` | **DEAD in the API** — used only by `mock-oidc` + compose. |
| `OIDC_CLIENT_ID` | `jubileepraise-web` | Read by `mock-oidc/server.js` only. |
| `OIDC_CLIENT_SECRET` | `jubileepraise-dev-secret` | Read by `mock-oidc/server.js` only. |
| `OIDC_REDIRECT_URI` | `http://localhost:3000/api/auth/callback` | **DEAD** — the callback route no longer exists (`routes/auth.js:232-235`). |
| `OIDC_SCOPES` | `openid profile email roles` | **DEAD** in the API. |
| `WEB_BASE_URL` | `http://localhost:3000` | Post-login redirect target / web app base. |
| `SENDGRID_API_KEY` | *(blank)* | Blank ⇒ the email service logs reset links + OTP codes to the API console instead of sending. |
| `EMAIL_FROM` | `JubileePraise <no-reply@jubileepraise.com>` | From header. |
| `PASSWORD_RESET_TTL_MIN` | `60` | Reset-link lifetime in minutes. |
| `TURNSTILE_SITE_KEY` | *(blank)* | Cloudflare Turnstile public key (server-side copy). |
| `TURNSTILE_SECRET_KEY` | *(blank)* | Blank ⇒ server **skips CAPTCHA verification entirely**. Deploy the pair together. |
| `SERVICE_JWT_SECRET` | *(blank)* | HS256 key that both signs and verifies service JWTs. **Blank ⇒ fail-closed**: issuance 503, admin routes 401. `openssl rand -hex 32`. |
| `SERVICE_JWT_ISSUER` | `https://api.jubileepraise.com` | `iss` claim, verified on every admin call. |
| `SERVICE_JWT_AUDIENCE` | `jubileepraise-admin` | `aud` claim, verified. |
| `SERVICE_TOKEN_TTL_SEC` | `600` | Service access-token lifetime. |
| `SERVICE_CLIENTS` | *(blank)* | Registry `id:secret:scopeA\|scopeB, …`. Entries split on `,`, fields on `:`, scopes on `\|`; omitted 3rd field = all scopes (`*`). Secrets must avoid `, : \|`. Known scopes: `admin.set_password`, `admin.provision`. Parser at `config.js:18-27` silently drops entries missing id or secret. |
| `ADMIN_SERVICE_ALLOW_IPS` | *(blank)* | Optional IP allow-list; a valid token from an unlisted IP → 403. Requires real client IP to survive Cloudflare/nginx. |
| `ADMIN_SERVICE_RATE_MAX` | `600` | Requests / 15 min for the per-client service limiter. |
| `MANIFEST_PATH` | `web/public/music/catalog-manifest.json` | Authoritative catalog manifest; resolved relative to `app/` by both web and api. |
| `CDN_BASE` | `https://cdn.jubileeverse.com` | CDN base for audio/art. |
| `MOCK_OIDC_PORT` | `4010` | Dev IdP port. |
| `MOCK_OIDC_ISSUER` | `http://localhost:4010` | Dev IdP issuer. |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:4000` | Browser-visible API base (baked at build). |
| `NEXT_PUBLIC_CDN_BASE` | `https://cdn.jubileeverse.com` | Browser-visible CDN base. |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Canonical site URL. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | *(blank)* | Blank ⇒ sign-in page renders no widget. |
| `ARTWORK_BASE` | `J:/music` | Local album-art store backing the CDN; used by the web `/cover` route. |

##### Referenced in code but **absent** from `.env.example`

| Variable | Default | Purpose | Where |
|---|---|---|---|
| `LOG_LEVEL` | `info` in production, else `debug` | Pino level. | `logger.js:7` |
| `JWT_SECRET` | ← `SESSION_SECRET` | Signs the user access/refresh tokens; intentionally shared with JubileeInspire so the whole SSO ecosystem uses one scheme. | `config.js:58` |
| `ACCESS_TOKEN_TTL_MS` | `3600000` (1 h) | Access-token lifetime (JI default). | `config.js:59` |
| `REFRESH_TOKEN_TTL_MS` | `2592000000` (30 d) | Refresh-token lifetime. | `config.js:60` |
| `EXTENDED_REFRESH_TTL_MS` | `31536000000` (1 y) | "Keep me signed in" refresh lifetime. | `config.js:61` |
| `REFRESH_TTL_DAYS` | `30` | DB-row refresh lifetime (parallel to the ms value above). | `config.js:49` |
| `PAYMENT_PROVIDER` | `stripe` if `STRIPE_SECRET_KEY` set, else `mock` | Selects the gateway adapter in `services/payments/*`. | `config.js:133` |
| `BILLING_CURRENCY` | `usd` | Lowercased currency. | `config.js:134` |
| `CHECKOUT_SUCCESS_PATH` | `/account/subscription?checkout=success` | Post-checkout return path. | `config.js:136` |
| `CHECKOUT_CANCEL_PATH` | `/subscription?checkout=cancelled` | Cancelled-checkout return path. | `config.js:137` |
| `STRIPE_SECRET_KEY` | `''` | Stripe secret; also the provider auto-select signal. | `config.js:139` |
| `STRIPE_PUBLISHABLE_KEY` | `''` | Stripe publishable key. | `config.js:140` |
| `STRIPE_WEBHOOK_SECRET` | `''` | Verifies the raw-body webhook signature. | `config.js:141` |
| `STRIPE_PRICE_INDIVIDUAL` | `''` | Env override for plan→price; empty ⇒ use the DB column. | `config.js:144` |
| `STRIPE_PRICE_FAMILY` | `''` | Same, family plan. | `config.js:145` |
| `LISTENING_TZ` | `UTC` | Timezone whose local midnight resets `daily_listening_counters`. | `config.js:152` |
| `R2_ENDPOINT` | `''` | Cloudflare R2 S3 endpoint. Empty ⇒ cover upload fails closed (503). | `config.js:162` |
| `R2_ACCESS_KEY_ID` | `''` | R2 key. | `config.js:163` |
| `R2_SECRET_ACCESS_KEY` | `''` | R2 secret. | `config.js:164` |
| `R2_BUCKET` | `jubileeverse-cdn` | Bucket maps to the CDN host root, so object key == URL path. | `config.js:165` |
| `REVALIDATE_SECRET` | `''` | Shared secret for on-demand Next ISR revalidation after a cover change. Also read by `web`. | `config.js:171` |
| `WEB_INTERNAL_URL` | `http://127.0.0.1:3000` | Internal URL the API calls to trigger revalidation. | `config.js:172` |
| `DEFAULT_SIGNUP_ROLE` | `content_editor` | Role auto-granted on self-serve signup; validated against `ROLE_ORDER`, invalid values silently fall back. | `routes/auth.js:21-22` |
| `PUBLISH_SCRIPT` | `C:/jubileepraise-local/publish-to-production.js` | Path to the publish orchestrator the admin publish route shells out to. | `routes/publish.js:22` |
| `MUSIC_SYNC_SCHEDULER` | *(off)* | Must equal `on` (case-insensitive) to start the scheduled CDN sync. | `services/musicScheduler.js:51` |
| `API_BASE` / `WEB_BASE` / `OIDC_BASE` | `:4000` / `:3000` / `:4010` | Smoke-script target overrides only. | `scripts/*.mjs` |

#### 2.4 Logging — `api/src/logger.js`

Pino, transport-free (no `pino-pretty` dependency). `base: { service: 'jubileepraise-api' }`. Level from `LOG_LEVEL`, else `info` in production / `debug` otherwise.

**Redaction** (`logger.js:11-18`) — censored to `[redacted]`:
- `req.headers.authorization` (service + user Bearer tokens)
- `req.headers.cookie`
- `res.headers["set-cookie"]`

Wired in `index.js:48-52` via `pino-http`:
- `genReqId` prefers an inbound `x-request-id`, else `crypto.randomUUID()` — so a correlation id propagates from the edge.
- `customLogLevel`: ≥500 or thrown error → `error`; ≥400 → `warn`; else `info`.

`app.set('trust proxy', 1)` (`index.js:45`) makes `req.ip` the first `X-Forwarded-For` hop — required for the rate limiters and `ADMIN_SERVICE_ALLOW_IPS` behind nginx/Cloudflare.

#### 2.5 Error handling — `api/src/middleware/error.js`

`notFound` → `404 {error:'not_found', message:'No route for <METHOD> <path>'}`.

`errorHandler(err, req, res, next)` (4-arg signature preserved so Express recognizes it):

| Condition | Response |
|---|---|
| `err instanceof HttpError` | `err.status` + `{error: ERROR_CODE[status] \|\| 'error', message, ...err.extra}` |
| PG `23505` (unique violation) | `409 {error:'conflict', message:'Duplicate resource'}` |
| PG `23514` (check violation) | `422 {error:'unprocessable', message:'Constraint violation', detail: err.constraint}` |
| anything else | logs `{err, reqId}` at error level, returns `500 {error:'internal', message:'Internal server error'}` — internals never leak to the client |

`ERROR_CODE` map: 400→`error`, 401→`unauthorized`, 403→`forbidden`, 404→`not_found`, 409→`conflict`, 422→`unprocessable`, 429→`error`, 503→`unavailable`.

Note `err.constraint` is echoed to the client on 23514 — that leaks internal constraint names (e.g. `reason_min_length`), which is deliberate here since those names are part of the API contract for form validation.

#### 2.6 API bootstrap order — `api/src/index.js`

Middleware order is load-bearing:

1. `pino-http` (so even rejected requests are logged)
2. `helmet()` then `cors()` with a function origin check that allows no-origin (curl/same-origin) and whitelisted origins, `credentials: true`
3. **Stripe webhook mounted BEFORE the JSON parser** with `express.raw({type:'*/*'})` on both `/api/billing/webhook` and legacy `/api/subscriptions/webhook` (`index.js:69-73`) — signature verification requires the unparsed body
4. `express.json({limit:'256kb'})`
5. `attachSession` — resolves `req.auth` from the Bearer access JWT, **no cookies**
6. Rate limiters: `authLimiter` 50/15 min; `writeLimiter` 120/min skipping GET/HEAD; `serviceLimiter` `ADMIN_SERVICE_RATE_MAX`/15 min keyed **per token** via `serviceRateKey`, not per IP
7. `/health`, `/api/openapi.json`
8. Routes — note the deliberate mount-order wins: `/api/admin/reviews`, `/api/admin/music`, `/api/admin/mobile`, `/api/admin/publish`, `/api/admin/tracks` all precede the generic `/api/admin`
9. `notFound`, `errorHandler`

On listen: warms the manifest cache and calls `startMusicScheduler()` (opt-in via `MUSIC_SYNC_SCHEDULER=on`).

`index.js:108` documents the CSRF stance: no CSRF guard, because auth is purely stateless `Authorization: Bearer` with no ambient cookie.

#### 2.7 `mock-oidc/server.js` — dev-only IdP

Emulates the JubileeInspire identity provider. **Dev only** — in production the whole service is replaced by `api.JubileeInspire.com`.

| Endpoint | Behavior |
|---|---|
| `GET /.well-known/openid-configuration` | Discovery doc; `response_types_supported: ['code']`, `code_challenge_methods_supported: ['S256']`, claims `sub, email, name, roles` |
| `GET /jwks` | The single RS256 public JWK; `kid` = JWK thumbprint |
| `GET /authorize` | Renders a styled dev **account chooser** (3 buttons). Rejects unknown `client_id`. |
| `POST /authorize` | Mints a 24-byte hex code into an in-memory `Map`, redirects to `redirect_uri` with `code` (+`state`) |
| `POST /token` | Requires `grant_type=authorization_code`; accepts client creds via Basic **or** POST body; single-use code (deleted on redemption); **PKCE S256** verified when a challenge was supplied; returns `{access_token, id_token, token_type, expires_in: 3600, scope}` |
| `GET /userinfo` | Bearer lookup in the in-memory `ACCESS` map |
| `GET /health` | `{status:'healthy', service:'mock-oidc'}` |

Keys are generated fresh at boot (`generateKeyPair('RS256')` at module top-level via top-level await) — every restart invalidates prior tokens. Codes and access tokens live in unbounded in-memory `Map`s with no TTL sweep.

Three seed accounts mirroring `identity.users`: `gabriel` (admin + production_manager + radio_producer + content_editor), `editor` (content_editor + radio_producer), `viewer`. Note these role names are **pre-0017** — `production_manager` and `radio_producer` no longer exist in the DB CHECK.

#### 2.8 `api/scripts/*.mjs`

| Script | What it does | Status |
|---|---|---|
| `smoke.mjs` | 11-check API smoke over `API_BASE` (default `:4000`): `/health` with `db===true`, OpenAPI 3.x, ≥5 categories, artists by category, status-counts, artist→album drill, album by code, ≥10 award categories, and three negative auth checks (unauthenticated PUT → 401/403, invalid Bearer → 401/403, `/api/admin/users` → 401). Prints a PASS/FAIL table, exits non-zero on any failure. Wired to `npm run smoke`. | Current |
| `auth-smoke.mjs` | End-to-end SSO: drives OIDC Authorization Code + PKCE through the web origin, asserts a `jv_session` cookie is set, `/me` reports admin, then a CSRF-protected rating PUT and an admin route. | **STALE** — `routes/auth.js:232-235` records that `GET /login` + `GET /callback` were removed and the API is now cookie-free pure-Bearer. This script cannot pass. |
| `change-password-carrier-smoke.mjs` | Verifies the dual-carrier CSRF model on `/api/auth/change-password`: cookie carrier enforces CSRF (403 without header), Bearer-without-cookie skips it, and Bearer-alongside-cookie must **still** 403 (no dummy-Bearer bypass). Non-destructive — always sends a deliberately wrong `current_password` so it only observes which gate answered. | **STALE** — same reason; `index.js:108` states there is no CSRF guard and no cookie. |
| `gen-service-secrets.mjs` | Mints a 256-bit HS256 signing key + a 32-byte client secret (hex, so never containing the `, : \|` delimiters), prints a paste-ready prod `.env` block plus the separate three lines to hand JubileeInspire. STDOUT only, nothing written to disk. Includes rotation notes. `node api/scripts/gen-service-secrets.mjs [clientId]`, default `jubileeinspire`. | Current |
| `stripe-setup.mjs` | Idempotent Stripe bootstrap: for `individual` and `family`, skips if `provider_price_id` is already set, else creates a Product + recurring Price from the DB row's `price_cents`/`currency`/`billing_interval` and writes `provider='stripe'`, `provider_product_id`, `provider_price_id` back to `subscription_plans`. Prints the webhook events to configure. Pinned to Stripe API `2024-06-20`. | Current |

#### 2.9 Deployment topology

**What is actually deployed is not the `app/` workspace.** Production runs the repo-root `server.js` (36 KB, zero dependencies) under PM2.

`W:\JubileePraise.com\deploy\` contains three files:

| File | Role |
|---|---|
| `publish.sh` (2.7 KB, executable) | The real deploy — automates PUBLISH.md end-to-end. Flags `--site-only` (skip CDN sync), `--yes/-y` (skip the upload prompt). `set -euo pipefail`. |
| `dev-deploy.sh` (297 B) | `git checkout develop && pull`, then `npm ci && npm run build` in `web/` and `api/` with `2>/dev/null \|\| true` swallowing failures. **Stale/unused** — references a `develop` branch and the workspace build, not the PM2 artifact. |
| `prod-deploy.sh` (389 B) | Interactive `yes` confirm, `git checkout main && git reset --hard origin/main`, `npm ci --production` + build in `web/`/`api/`, same error-swallowing. **Stale/unused** — superseded by `publish.sh`. |

**`PUBLISH.md` runbook** — three mandatory-ordered steps plus a gate:

- **Step 0 (MANDATORY GATE)** — the catalog manifest must be current. New albums land in `J:/music/albums` but the manifest is **not** auto-generated, so it silently drops new albums from every page, covers, genres, and analytics. Dry-run `node C:/jubileepraise-local/rebuild-manifest.js` must report `would add: 0`. If stale: `--apply`, then regenerate covers/genres (`gen-album-covers.mjs`, `gen-album-genres.mjs`, `merge-genres-into-manifest.mjs` with `ARTWORK_BASE=J:/music`), then copy the three JSON files to `/w/JubileePraise.com/app/web/public/music/`. Locally, restart the web dev server — `lib/manifest.ts` caches in memory.
- **Step 1 — CDN sync**: `node .claude/r2-sync-music.js` (diff) then `--apply --concurrency=8` from `/c/Websites/jubileeverse.com`. Uploads only missing/size-mismatched files under `music/`, **never deletes**. Sets `Cache-Control: public, max-age=31536000, immutable` for media, `max-age=60` for catalog JSON/HTML. Failures land in `.claude/r2-sync-failures.txt`.
- **Step 2 — Site deploy**: `tar -czf -` of `/w/JubileePraise.com` excluding `./.claude`, `./wpf`, `./node_modules`, `*.log`, streamed over SSH to `root@94.72.120.231`, extracted into `/var/www/JubileePraise.com`, then `pm2 restart jubileepraise --update-env && pm2 save`.
- **Step 3 — Verify**: origin `127.0.0.1:3119`, public `https://www.jubileepraise.com`, and the CDN manifest must all return 200 (`publish.sh:63-71` asserts all three and exits non-zero otherwise).

**Production facts:**

| | |
|---|---|
| Host | `root@94.72.120.231` — `SEAIIS01SERVER`, Ubuntu, nginx 1.24, Node 20.20.0, PM2 6.0.14 |
| Code dir | `/var/www/JubileePraise.com/` |
| PM2 process | name `jubilujah`, script `/var/www/JubileePraise.com/server.js`, **port 3119** |
| Nginx | vhost `/etc/nginx/sites-available/jubileepraise.com`, proxies `:80` → `127.0.0.1:3119`; logs `/var/log/nginx/JubileePraise.com_{access,error}.log` |
| PM2 logs | `/root/.pm2/logs/jubileepraise-{out,error}.log` |
| DNS/TLS | `jubileepraise.com` + `www` proxied through Cloudflare; TLS terminates at the CF edge (zone `5a4817eed553c36db47e8b7b3390120b`) |
| CDN | R2 bucket `jubileeverse-cdn`, prefix `music/`, public host `cdn.jubileeverse.com` |
| SSH key | `C:\Users\zariah.inspire\.ssh\id_ed25519_jubilee_prod` |
| DB (prod, per `.env.example` comment) | `postgres://jubilujah_app:<PW>@94.72.120.231:5432/jubilujah` with `PGSSLMODE=require` — same box as the web host |

**No rollback exists.** PUBLISH.md:155 states the prior code is not snapshotted; if rollback matters you must manually tar `/var/www/JubileePraise.com` into `/var/www/.backup/JubileePraise.com.$(date +%Y%m%d-%H%M%S).tgz` *before* deploying. There is also no migration step anywhere in the publish flow — schema changes are applied out-of-band via `db/run-migrations.js`.

---

### Summary of notable findings

1. **`0001:866` — live bug.** `auto_promote_album()` references `NEW.actor_user_id_dummy`, a column that does not exist on `pipeline_state`. PL/pgSQL resolves `NEW.<field>` at plan time regardless of the `WHERE FALSE`, so the "album has no pipeline_state row" branch will raise at runtime. The same branch also recursively re-fires its own trigger.
2. **`docker-compose.yml` mounts only migrations 0001–0009.** A fresh compose boot is missing 19 migrations (all of reviews, likes, analytics, subscriptions, Manage Music, mobile CMS) — and because auto-init writes no `_migrations` ledger rows, `db:migrate` afterwards re-runs 0001 and aborts on non-idempotent DDL.
3. **`db/seed/03_demo_editorial.sql` grants `radio_producer`**, a role deleted by migration 0017 and rejected by the current CHECK — `npm run db:seed` fails on a 0017+ database.
4. **`0010:81-85` comment/code mismatch.** The one-review-per-target constraint is documented as a partial unique excluding soft-deletes, but is emitted as a plain `UNIQUE` — a soft-deleted review permanently blocks re-rating.
5. **Five `.env.example` entries are dead**: `COOKIE_DOMAIN`, `SESSION_TTL_HOURS`, `OIDC_ISSUER`, `OIDC_REDIRECT_URI`, `OIDC_SCOPES`. The OIDC browser-redirect flow was removed (`routes/auth.js:232-235`) and the API is now cookie-free pure-Bearer. Conversely **26 env vars that the code does read are undocumented** — including every Stripe and R2 credential, `JWT_SECRET`, `LISTENING_TZ`, and `DEFAULT_SIGNUP_ROLE`.
6. **Two smoke scripts are obsolete** — `auth-smoke.mjs` and `change-password-carrier-smoke.mjs` both test the removed cookie+CSRF+OIDC model and cannot pass against current code.
7. **`PGSSLMODE=require` enables TLS with `rejectUnauthorized: false`** (`db.js:11`) — encrypted but unauthenticated. Since the prod DSN in `.env.example` points across the public internet to `94.72.120.231:5432`, this is a MITM exposure worth closing.
8. **Deployed artifact ≠ documented stack.** Production runs the dependency-free root `server.js` on PM2:3119; the `app/` Next.js + Express workspace described by `docker-compose.yml` and `.env.example` is the migration target, not what's live. `deploy/dev-deploy.sh` and `prod-deploy.sh` target branches (`develop`/`main`) and a build flow that don't match either reality.


---

## 12. Appendix — Cross-cutting findings

Collected while reading the source. Nothing here was changed; this is a punch list, roughly ordered by consequence. Each item cites where to look.

### Security & correctness

| # | Finding | Where |
|---|---|---|
| 1 | **`now_playing` presence rows are not owner-scoped on write.** The upsert conflicts on `session_id` alone and overwrites `user_id` from the token, so posting a `session_id` already in use reassigns another user's presence row to yourself. Impact is confined to a cosmetic admin page. The `/stop` handler *is* correctly scoped. | `analytics.js:88-98` |
| 2 | **Listener IPs are sent to a third party over plaintext HTTP.** `geo.js` calls `http://ip-api.com/...` — not HTTPS. The IP, and the fact that a specific user is listening right now, is exposed to that provider and to any observer on the path. | `util/geo.js:24` |
| 3 | **Raw IPs are retained indefinitely** in `playback_events.ip_address` alongside `user_id`, with no retention policy or anonymization. Account deletion sets `user_id` to NULL but **leaves the IP addresses in place**, so the trail survives erasure. | `0012_analytics.sql:36` |
| 4 | **Roles exist in the DB that `ROLE_ORDER` doesn't know.** `radio_producer` / `production_manager` remain permitted in `identity.user_roles`; `roleLevel` returns `-1` for them, so a user holding *only* such a role fails even `requireRole('viewer')`. | `0013_reviewer_role.sql`, `config.js:189` |
| 5 | **`POST /api/analytics/play` has no dedupe or idempotency at all.** Any retry double-inserts *and* double-increments the daily rollup. An authenticated listener can inflate their own play counts freely, bounded only by the 120/min limiter. | `analytics.js:42-80` |
| 6 | **`GET /api/analytics/export` is unbounded and unstreamed** — no `LIMIT`, full result set materialized into one string. It is also the only endpoint emitting user emails in bulk, and CSV injection is unmitigated (`=`/`+`/`-`/`@` prefixes pass through) in files designed to be opened in Excel. | `analytics.js:548-580` |
| 7 | **`POST /api/subscriptions/reactivate` doubles as a manual un-suspend.** It only blocks the `active && !cancel_at_period_end` case, so a `past_due` / `payment_failed` / `suspended` subscription is forced to `active` locally with nothing actually paid. | `subscriptions.js:220-247` |
| 8 | **The mock payment provider accepts any unsigned webhook.** Harmless today — `verifyWebhook` returns `{type:'mock.noop'}` which hits the no-op branch — but the route is mounted unconditionally, so the safety rests entirely on that default branch. | `payments/mock.js`, `subscriptionsWebhook.js:189` |

### Data-model gaps

| # | Finding | Where |
|---|---|---|
| 9 | **The entire family-invitation feature is unimplemented.** `production.family_invitations` — table, enum, partial unique index, `token` secret column — exists in migration 0014 and has **zero references** anywhere in `src/`. No invite-send, no accept, no member-remove endpoint; the three `family_*` notification templates are dead code. A Family subscriber today gets a group of exactly one. | `0014_subscriptions.sql:151-169` |
| 10 | **`device_type` / `browser` / `os` are written on every play and read by nothing.** No endpoint selects or groups by them; there is no device breakdown in the dashboard. Data accumulating for a report that doesn't exist. | `util/ua.js`, `analytics.js` |
| 11 | **`now_playing` has no TTL and no reaper.** Any session ending without a clean `/stop` (tab crash, network drop) leaves its row forever. Invisible behind the 45s read filter, never reclaimed. A periodic `DELETE WHERE updated_at < NOW() - INTERVAL '1 hour'` is the obvious fix. | `0018_now_playing.sql` |
| 12 | **`analytics_daily` has no rebuild path.** It is a pure incremental cache written only by the `/play` upsert. If it ever diverges from `playback_events` there is no reconcile job to bring it back. | `analytics.js:58-78` |
| 13 | **Stripe-mode `checkout` ledger rows are never settled.** They are written `status='pending'`; activation inserts a *separate* `type='activation'` row instead of updating them, so `subscription_transactions` accumulates permanently-pending rows. | `subscriptions.js:81-87` |
| 14 | **`createRefund` is dead code** in both adapters, and `payment_records.refunded_cents` is only ever read, never written. Refunds are gateway-side-only. | `payments/stripe.js`, `payments/mock.js` |

### Behavior worth knowing before you touch it

| # | Finding | Where |
|---|---|---|
| 15 | **Analytics index/query mismatch.** Composite indexes lead with `created_at`, but every dashboard query filters and sorts on `started_at`. The `?from`/`?to` range scans have no supporting index. | `0012_analytics.sql:50-56` |
| 16 | **Malformed `?from`/`?to` returns 500, not 400.** Values are bound as parameters (no injection risk) but never validated as dates; Postgres `22007` isn't special-cased in the error handler. | `analytics.js:118-125` |
| 17 | **`/api/analytics/users` reports a `total` that ignores the `q` filter** — correct `items[]`, wrong page count when searching. | `analytics.js:380` |
| 18 | **`?days` on `/trends` governs only 2 of the 5 series.** `monthly` is hard-coded to 730 days; `peak_hours` and `peak_days` are all-time — and computed in the **server's** timezone, not UTC. | `analytics.js:434-465` |
| 19 | **Analytics pagination is in-memory for `/albums` and `/songs`** — the full grouped result set is fetched and sorted before slicing. Only `/users` paginates in SQL. | `analytics.js:251` |
| 20 | **`past_due` still grants full playback** — a deliberate grace window while Stripe retries. `payment_failed` and `suspended` do not. | `services/subscriptions.js:14` |
| 21 | **Entitlement lapses on its own at `current_period_end`** regardless of status, via `notExpired()`. A missed webhook self-heals into a downgrade rather than free service. | `services/subscriptions.js:104-106` |
| 22 | **The free-tier counter increments on *intent*, not on completed playback** — skipping through tracks burns quota. | `services/subscriptions.js:312-353` |
| 23 | **The free-tier cap fails open on the client.** No token, network error, or any non-2xx means no cap is applied. A backend hiccup never blocks listening — deliberate, but worth knowing. | `web/lib/subscription.ts:78-83` |
| 24 | **Stripe status mapping defaults to `active`.** `incomplete` — and any future Stripe status — silently becomes `active` locally. | `subscriptionsWebhook.js:194-199` |
| 25 | **No event-id ledger on the webhook.** `event.id` is never persisted; dedupe is entirely invoice/subscription-keyed. Non-invoice events are replay-safe only because they are last-write-wins upserts. | `subscriptionsWebhook.js` |
| 26 | **Payment-record dedupe is asymmetric.** `activateSubscription` checks *any* status; the webhook checks `status='succeeded'` only. A prior `failed` row for the same invoice suppresses one but not the other. | `services/subscriptions.js:224` vs `subscriptionsWebhook.js:89` |

### Documentation drift

The four docs in `app/api/docs/` are broadly accurate but have measurable drift:

| Doc | Status |
|---|---|
| `SUBSCRIPTION_API.md` | **Stale in one specific number** — still says the free daily limit is **7**; migration 0025 raised it to **36**. Appears at lines 48, 135-136, 143. Also omits the 502 gateway-failure responses, reactivate's 409, and confirm's 422. |
| `ANALYTICS_API.md` | **Correct but materially incomplete** — both `/now-playing` endpoints are entirely undocumented (the doc predates migration 0018). Also missing: the 200 pagination cap, the 7–730 `?days` clamp, the `listeners_detail` LIMIT 200, and the fact that several endpoints silently ignore `from`/`to`. |
| `AUTH_API.md` | See the Auth section for the per-item assessment. |
| `REVIEWS_API.md` | See the Social section for the per-item assessment. |
| `src/openapi.json` | Served live at `/api/openapi.json`. **Not diffed against the ~150 real routes during this pass** — treat its coverage as unverified. |

### Legacy files that are not the API

Two files will mislead anyone grepping this repo for endpoints:

- **`W:\JubileePraise.com\server.js`** — a standalone `http`-module "Coming Soon" server on port 3119 with its own hand-rolled routing (`/api/album`, `/api/cdn-probe`, `/api/cdn-probe-batch`, `/api/awards/*`, `/music/albums/...`). Superseded by `app/api`; likely dead weight.
- **`W:\JubileePraise.com\api\server.js`** — a 2-line Express stub exposing only `/health` and `/api/v1/status`.

Neither is the service documented here.
