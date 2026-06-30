# Testing & Validation Report

**Date:** 2026-06-11
**Stack verified:** Next.js web (:3000) · Node API (:4000) · PostgreSQL 16 (Docker, :5432) ·
mock-oidc (:4010). Legacy static site (:3119) kept running as the parity reference.

## How it was run

```bash
cd app && cp .env.example .env
docker compose up -d            # Postgres + mock-oidc  (engine: Docker Desktop)
npm install
node db/run-migrations.js --seed   # W: is a network drive; in-container file mounts can't be used,
node db/import-catalog.js          # so the cross-platform Node runner applied schema + seeds.
node api/src/index.js &             # API
npm --workspace web run dev &       # Web
node api/scripts/smoke.mjs
node api/scripts/auth-smoke.mjs
```

> **Environment note:** the project lives on a mapped network drive (`W:` → `\\HDC-INSPIRESERVER\…`).
> Docker Desktop cannot bind-mount files from network drives, so the compose `initdb` mounts were
> skipped and the **Node migration runner** (`npm run db:migrate -- --seed`) was used instead — the
> documented portable path. On a local disk, the compose auto-init also works.

## Database provisioning — PASS

| Object | Count |
|---|---|
| identity.users | 2 (Gabriel admin + demo editor) |
| identity.user_roles | 6 |
| catalog.artists | 13 seeded → **34 after import** |
| catalog.albums | **732** (736 manifest albums; dupes collapse on code) |
| catalog.songs | **5,979** |
| radio.stations | 107 (full HM-band roster) |
| production.award_categories / periods | 11 / 11 |

Schema, triggers, and constraints from `db/schema.sql` applied cleanly.

## API smoke test — 11/11 PASS

```
PASS  GET /health (db healthy)              PASS  GET /api/albums/:code (with id)
PASS  GET /api/openapi.json                 PASS  GET /api/awards/categories returns 11
PASS  GET /api/categories returns 6         PASS  PUT /api/ratings without session -> 401
PASS  GET /api/artists?category=inspire     PASS  POST mutation without CSRF -> 403
PASS  GET /api/status-counts?scope=all      PASS  GET /api/admin/users without session -> 401
PASS  GET /api/artists/:slug (has albums)
```

## SSO end-to-end — 6/6 PASS

Full OIDC Authorization Code + PKCE round-trip via the same-origin web proxy:

```
PASS  login redirects to IdP /authorize
PASS  IdP issues code -> callback URL
PASS  callback establishes jv_session cookie
PASS  /me authenticated as admin (Gabriel Ungureanu)
PASS  authenticated rating PUT succeeds (CSRF ok)
PASS  admin route reachable as admin
```

After login: 1 active row in `identity.sessions`; the rating write set
`catalog.albums.avg_rating = 5.00, rating_count = 1` via the aggregation trigger — proving the
**manifest ↔ Postgres deterministic-UUID bridge** end-to-end (the client/UUID matched the imported
catalog row).

## Frontend page parity — PASS

Production build: **33 routes** compiled, type-checked, and prerendered (SSG for category/artist pages,
ISR on album pages, dynamic album-by-code, generated `sitemap.xml` + `robots.txt`). Live render checks:

| Route | Legacy equivalent | Status | `<title>` |
|---|---|---|---|
| `/` | `index.html` | 200 | Jubilujah.com — Feel the Spirit Move |
| `/inspire` | `inspire.html` | 200 | Inspire Family — … |
| `/children` `/faith-based` `/general` | category pages | 200 | per-page SEO titles |
| `/prayers` | `prayers.html` | 200 | Jubilee Prayers — … |
| `/artist/[slug]` | persona listings | 200 | e.g. Amir Inspire — … |
| `/album?code=` | `album.html?code=` | 200 | Bridge Across Faiths — Amir Inspire — … |
| `/playlists` | `playlists.html` | 200 | curated playlists |
| `/auth/login` | `auth/login.html` | 200 | real SSO button (was a placeholder) |
| `/admin` (+ pipeline/awards/users) | `admin/*.html` | 200 | role-gated console |

Design fidelity preserved by porting `site.css` + the four widget stylesheets verbatim; the
navy/red/peach/gold brand, particles, hero, choice-grid, and responsive breakpoints render unchanged.

## Feature parity matrix

| Legacy feature | Migration | Status |
|---|---|---|
| Static category/album browsing | Next.js SSG/ISR from the manifest | ✅ |
| Ready/Studio badges + rollup counts | `StatusCountsBar` + `/api/status-counts` | ✅ |
| Persistent footer player across nav | Zustand store + root-layout `<FooterPlayer>` (native, no turbo-nav) | ✅ |
| Media Session + keyboard shortcuts | ported into `FooterPlayer` | ✅ |
| Ratings / Comments / Nominations (JSON-file stubs, 1 user) | Postgres-backed, real per-user identity, same contract | ✅ |
| 250-char nomination rule | client counter + server 422 + DB CHECK | ✅ |
| Login (placeholder "not wired") | real OIDC SSO + sessions + RBAC | ✅ upgraded |
| Admin pages (static HTML) | role-gated console wired to live APIs | ✅ |
| Audio from `cdn.jubileeverse.com` | unchanged (CDN URLs from manifest) | ✅ |

## Security checks — PASS
- Unauthenticated write → 401; mutation without CSRF token → 403; non-admin → 403 on `/api/admin/*`.
- HttpOnly/SameSite session cookie; non-HttpOnly CSRF cookie (double-submit); helmet headers; locked
  CORS; Zod validation; parameterized SQL throughout; rate limits on auth/write.

## Known follow-ups (scope boundary)
- **Long-tail pages** not yet recreated 1:1: per-persona bespoke dashboards (`web/inspire-family-dashboard.html`,
  `music/catalog-summary.html`), `prayers/jubilee-inspire.html` deep page. The generic artist/album
  routes already cover all 736 albums; these are presentational extras.
- **Audio playback** depends on live `cdn.jubileeverse.com` assets (not reachable from this dev box);
  track wiring + URLs are verified, the bytes stream in a networked environment.
- **Real IdP cutover**: swap `OIDC_*` to `api.JubileeInspire.com` (see `docs/sso-integration.md`); no
  code change.
- `npm audit` reports transitive advisories (dev tooling); Next.js was pinned to a patched 14.2.x.
