# Jubilujah Build Spec v1.0 — Implementation Roadmap
*Generated: 2026-06-03*

## Status legend

- Implemented — working in current W: site, end-to-end
- Scaffolded — schema, spec, stub UI, or sample data exists; requires backend or platform to realize
- Pending engineering — requires the Next.js + FastAPI + Postgres + Cloudflare R2 production stack from spec §4

---

## Section-by-section status

### §1 Purpose & Vision — Implemented
The "workshop, not storefront" framing is reflected in the homepage copy, the README, and the admin landing page. Editors understand Jubilujah is the internal console and that public listening happens via Jubilee Radio, DSPs, and `cdn.jubileeverse.com`. No engineering work outstanding.

### §2 System Goals — Scaffolded (partial)
Catalog, ratings, comments, nominations, and playlists are working end-to-end against JSON storage. The pipeline kanban, radio program publishing, and CDN publish flow are scaffolded only — screens exist with mock data, no state transitions persist. The 12-song album lock, OHI default, and Hebrew article rule (goal 7) are documented but not enforced because there is no data layer yet.

### §3 High-Level Architecture — Pending engineering
The current site is vanilla HTML/CSS/JS plus a minimal Node `http` server (`server.js`). The documented three-plane architecture (Next.js + FastAPI + Postgres + R2 + JubileeInspire SSO) is the v1.0 production target, not the current shape.

### §4 Technology Stack — Pending engineering
None of Next.js 14, TypeScript, Tailwind, shadcn/ui, Zustand, TanStack Query, FastAPI, SQLAlchemy, or Cloudflare Workers is in use. The MVP intentionally ships in plain HTML/CSS/JS to validate UX shape before committing to the full stack.

### §5 Authentication & Authorization — Scaffolded
`/auth/login.html` exists as a placeholder with the role table (Owner, Admin, Editor, Contributor, Viewer) rendered for reference, but the login button alerts that OAuth is not wired. Real OAuth 2.0 / OIDC integration with JubileeInspire SSO requires the FastAPI backend.

### §6 Artist & Brand Taxonomy — Implemented
The 12 Inspire Family personas, 5 faith-based affiliated artists, and 5 general affiliated artists are displayed consistently across catalog, artist index, and footer-player metadata. Brand groupings render with correct hierarchy.

### §7 Catalog Domain Model — Scaffolded
JSON Schemas live at `/schemas/v1/` and sample manifests at `/catalog/` cover artist, album, song, playlist, and program shapes. Full CRUD with constraint enforcement (12-song album lock, Hebrew article rule, OHI flag) requires the backend.

### §8 Production Pipeline — Scaffolded
`/admin/pipeline.html` renders a kanban scaffold with the documented stages (Concept → Lyrics → Suno → Master → Art → Metadata → Review → Published). Cards are mock data. Drag-to-advance transitions, audit log writes, and assignee notifications require the backend.

### §9 Polymorphic Ratings System — Implemented
`ratings.js` widget is mounted on artist, album, song, playlist, and program pages. `/api/ratings` GET and POST persist to JSON storage with per-user uniqueness and 1-5 validation. Aggregate average + count display live. Most complete end-to-end vertical in the MVP.

### §10 Editorial Annotations & Comments — Implemented
`comments.js` supports threaded replies, @mentions, and soft delete. `/api/comments` GET/POST/DELETE back it with JSON storage. Renders on every rateable object. Real-time notifications and email digest require the backend.

### §11 Awards & Nominations — Implemented (admin selection scaffolded)
`nominations.js` trophy widget is live across catalog pages with the 11 award categories seeded. `/api/awards/nominations` enforces the 250-character justification limit on both client and server. The admin Award Winner selection UI at `/admin/awards.html` is scaffolded with mock nominations — wiring it to live data is a small remaining task.

### §12 Radio Programming — Scaffolded
Program and playlist JSON Schemas exist at `/schemas/v1/`. Station, program, and schedule CRUD plus the Radio Engine v3.0 manifest publish flow that feeds Icecast-KH / Liquidsoap require the backend. No editor surface for station scheduling exists today.

### §13 Persistent Footer Player — Implemented
`footer-player.js` is mounted globally with Media Session API, keyboard shortcuts (space, arrows, M, L), queue management, loop modes (off / one / all), shuffle, and an expandable overlay. Feature-complete against spec §13.

### §14 Admin Dashboard — Scaffolded
`/admin/index.html`, `pipeline.html`, `awards.html`, and `users.html` exist with mock data and the documented layouts. Live data wiring (pending counts, activity feed, user role management) requires the backend. The chrome is right; the wires aren't connected.

### §15 CDN Architecture — Pending engineering
Sample manifests and schemas demonstrate the `cdn.jubileeverse.com` shape, but the actual R2 bucket, the Worker that handles audio gating and serves the catalog index, and cache invalidation logic are all future deployment work.

### §16 JSON Manifest Schemas — Implemented
Five JSON Schemas live at `/schemas/v1/` (artist, album, song, playlist, program) with corresponding sample manifests at `/catalog/`. Materially complete as a contract, even though no service publishes against it yet.

### §17 Publish Flow — Pending engineering
The 10-step transactional publish flow (validate → snapshot → write manifest → upload audio → update index → invalidate cache → notify Radio Engine → audit → mark published → notify editors) requires FastAPI + R2 + Worker.

### §18 Database Schema (Initial DDL) — Implemented
Full `schema.sql` at `/db/schema.sql` defines all four schemas (catalog, editorial, pipeline, audit) with every table, index, trigger, and seed row from the spec. Ready to drop into Postgres the moment one is provisioned.

### §19 API Surface (Initial) — Scaffolded
OpenAPI 3.1 at `/api/openapi.json` documents every endpoint. Ratings, comments, awards/nominations, and CDN MP3 probe endpoints are wired in `server.js`. Catalog CRUD, pipeline transitions, radio scheduling, and admin user management are documented-only.

### §20 Non-Functional Requirements — Pending engineering
Performance budgets (LCP < 2.5s, API p95 < 300ms), 99.9% uptime SLO, audit retention, backup cadence, WCAG 2.2 AA, and security posture all require the production deployment to measure against.

### §21 Open Decisions — Documented
The seven open decisions (radio engine handoff format, comment notification cadence, award voting visibility, persona collaboration workflow, lyrics versioning, CDN cache TTL, OHI override audit policy) are surfaced and awaiting user input.

### §22 Glossary — Implemented
Terminology (OHI, Inspire Family, HM-band, Jubilee Radio, canonical manifest) is used consistently across the codebase, README, and on-page copy.

---

## What's actually working end-to-end right now

- 5-star ratings on artists, albums, songs, playlists, and programs (one rating per user per object, average + count display)
- Threaded comments with @mentions and soft delete
- Trophy nominations across 11 award categories with 250-character justification validation (client + server)
- Persistent footer player with Media Session, keyboard shortcuts, queue, loop modes, shuffle, expandable overlay
- Login page (placeholder — alerts that OAuth is not yet wired)
- Admin pages with mock data (pipeline kanban, awards review, users)
- CDN MP3 probe endpoints (existing, used to verify R2 audio reachability)

That is enough surface for an editor to walk through the intended workflow and judge whether the UX shape is right before we commit to the full Next.js + FastAPI build.

---

## Next steps to ship v1.0 (prioritized)

1. **Wire real OAuth/OIDC SSO via JubileeInspire.** Until identities are real, role gating, per-user attribution on ratings/comments/nominations, and the audit log are all hand-waved. This unblocks every other backend surface.
2. **Provision Postgres and run `/db/schema.sql`.** The DDL is ready; we just need a database. Migrate `/data/*.json` contents into the catalog and editorial schemas as a one-time backfill.
3. **Build the FastAPI backend implementing `/api/openapi.json`.** Replace the minimal `server.js` endpoints. Ratings, comments, and nominations are the easy first cut because the contracts are already nailed down by the working MVP.
4. **Wire the Pipeline kanban to live data with drag-to-advance state transitions.** Audit log writes on every transition. This is the single most valuable editor feature still missing.
5. **Provision Cloudflare R2 and write the Cloudflare Worker per spec §15.** Audio gating, catalog index serving, cache TTL strategy. This is the storefront half of the workshop/storefront split.
6. **Implement the Publish-to-CDN action with the 10-step transactional flow from spec §17.** This is the moment Jubilujah becomes a source of truth instead of a sketchpad.
7. **Wire the admin Award Winner selection UI to live nominations.** Small task, high editorial value, and a good first integration test of the new backend reading from existing JSON-storage nominations during the migration window.
8. **Stand up the Radio Engine v3.0 manifest publish flow (spec §12).** Once §6 (R2) and §17 (publish flow) exist, this is mostly schema-driven plumbing into Icecast-KH / Liquidsoap.

---

## Architecture migration note

The current static-HTML + minimal-Node-http stack is an MVP for UX validation, not a v0 of the production system. The full Build Spec describes a Next.js 14 + FastAPI + Postgres + Cloudflare R2 architecture for v1.0 production deployment. Migrating from the current shape to the documented shape is a deliberate engineering project — not an in-place upgrade. There is no incremental path where `server.js` quietly becomes FastAPI or the existing HTML pages quietly become Next.js routes.

The MVP exists so the editor workflow (ratings, comments, nominations, footer player, admin views) has been walked through, judged, and adjusted before the production rebuild starts — giving the rebuild a clear functional target rather than chasing a moving spec. When the production stack lands, the static pages get retired and JSON-storage data gets migrated into Postgres in a single cutover.
