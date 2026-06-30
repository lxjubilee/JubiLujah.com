# Architecture

## Overview

Jubilujah.com is migrated from a static HTML site into three cooperating services plus a database.

```
Browser ──> Next.js (web :3000) ──/api/* proxy──> Express (api :4000) ──SQL──> PostgreSQL
                 │                                     │
                 │                                     └──OIDC──> JubileeInspire IdP
                 └── audio/art ──HTTPS──> cdn.jubileeverse.com   (mock-oidc :4010 in dev)
```

### Data planes

1. **Catalog (read) plane — the manifest.** The 2 MB `catalog-manifest.json` (736 albums) remains the
   authoritative browse source, exactly as in the legacy ops model. Both the web app (server
   components) and the API read it directly; nothing about catalog browsing depends on Postgres being
   populated. Audio streams from `cdn.jubileeverse.com`.

2. **Editorial / identity plane — PostgreSQL.** Users, roles, sessions, ratings, comments,
   nominations/awards, the production pipeline, and radio programming live in Postgres (schemas
   `identity`, `catalog`, `production`, `radio` from `db/schema.sql`). The API is the only writer.

3. **Identity plane — JubileeInspire SSO.** Authentication is delegated to an external OIDC provider.
   In dev, `mock-oidc` stands in; in production, point `OIDC_*` at `api.JubileeInspire.com`.

### The manifest ↔ Postgres bridge

Editorial rows reference catalog objects by a **deterministic UUIDv5** derived from the album code
(`album:CODE`) or track (`song:CODE:N`) using a fixed namespace. The exact same function exists in
`db/ids.js`, `api/src/ids.js`, and `web/lib/ids.ts`, so an album always maps to the same UUID
everywhere. `production.ratings/comments/nominations` already use a polymorphic `rateable_id` (no FK to
catalog), so the manifest can stay authoritative while the UUID schema is honored unchanged.
`db/import-catalog.js` optionally mirrors catalog rows into `catalog.*` with the same UUIDs for
admin/reporting joins.

## Frontend (Next.js 14, App Router)

- **Server Components** render catalog pages from the manifest with **SSG/ISR** (`revalidate = 3600`)
  for fast, SEO-friendly delivery; metadata is set per page via the Metadata API; `sitemap.ts` and
  `robots.ts` are generated.
- **Persistent footer player** (`components/FooterPlayer.tsx` + `stores/player.ts`, Zustand) is mounted
  once in the root layout. Because the App Router keeps the layout — and the single `<audio>` element —
  mounted across client navigations, playback continues seamlessly without the legacy `turbo-nav.js`
  hack. Media Session API + keyboard shortcuts included.
- **Editorial widgets** (`Ratings`, `Comments`, `Nominations`) are client components that call the API
  with credentials and a CSRF header.
- **Design fidelity**: the legacy `site.css` and widget CSS are ported verbatim into `web/app/styles/`
  and imported from `globals.css`, so the navy/red/peach/gold brand and responsive breakpoints are
  preserved pixel-for-pixel.

## Backend (Node.js / Express)

- **Routing** mirrors the Build-Spec §19 surface: `/api/auth/*`, catalog reads, `/api/ratings`,
  `/api/comments`, `/api/awards`, `/api/pipeline`, radio, and `/api/admin/*`.
- **Auth**: a hand-rolled OIDC relying party (`auth/oidc.js`, built on `jose`) does Authorization Code +
  PKCE; `auth/session.js` upserts the user, syncs roles, and issues an opaque session (SHA-256 hash
  stored in `identity.sessions`).
- **Security middleware**: `helmet`, locked CORS, double-submit **CSRF** on mutations, Zod input
  validation, `express-rate-limit`, parameterized SQL only, centralized error handler, structured
  `pino` logs with a correlation id per request.
- **RBAC**: privilege-ordered roles; `requireRole('content_editor')` gates editorial writes,
  `requireRole('admin')` gates `/api/admin/*`.

## Why this shape

The legacy site already treated the manifest as the operational source of truth and the CDN as the
storefront. Keeping that contract minimizes migration risk: browsing is unchanged and fully functional
even before any data is loaded into Postgres, while the new database cleanly owns the parts that the
static site could only fake (real users, durable ratings/comments, pipeline, awards).
