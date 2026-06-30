# Media Analytics Dashboard — Technical, API & Deployment Documentation

Implements the **Media Analytics Dashboard** (BRD): an admin-only dashboard that
records, processes, and displays listening + engagement analytics for every
album and song, across four levels — Website, Artist, Album, Song.

The one new data source is **playback events**; every album/song/user/trend
metric is an aggregate over that log plus the existing reviews/likes/users data.

---

## 1. Architecture

```
 Browser player ──POST /api/analytics/play──► API ──► production.playback_events (raw log)
   (instrumented FooterPlayer + player store)        └─► production.analytics_daily (rollup cache)

 Admin dashboard ──GET /api/analytics/*──► API (requireRole admin) ──► aggregate queries
   (/admin/analytics)                                                   over the tables above
                                                                        + review_summaries / user_reviews
```

- **Auth:** the site already uses Jubilee Inspire SSO; the API verifies the
  Bearer access token and the `admin` role (`requireRole('admin')`) on every
  dashboard endpoint — the same SSO-derived role the rest of the platform uses.
- **Names** (album/song/artist titles, covers) are resolved from the catalog
  **manifest** server-side, so a play only needs to send the song id + timing.

---

## 2. Database (`app/db/migrations/0012_analytics.sql`)

| Object | Purpose |
|---|---|
| `production.playback_events` | Raw playback log — one row per play. Source of truth. All BRD "Play Tracking" fields (user, session, album/song/artist, device/browser/os, ip, source, start/end, listening seconds, completion %, completed, skipped). |
| `production.analytics_daily` | Incremental per-day rollup (plays, listening seconds, completed, skipped) — the cache for fast totals + the "plays over time" chart. |
| `production.playback_source` (enum) | album / playlist / search / recommendation / radio / direct / other. |

**Indexes** cover every aggregation path: `(song_id, started_at)`, `(album_id,
started_at)`, `(artist_id)`, `(user_id, started_at)`, `(started_at)`, and a
functional index on `started_at::date` for day grouping. `UPDATE/DELETE` are
revoked from PUBLIC (analytics is append-only / system-written).

**Scale (BRD performance):** `playback_events` is designed to be **RANGE
partitioned by month on `created_at`** for very high volume — all reads go
through aggregate queries or the rollup table, so converting to partitions is a
non-breaking follow-up. The daily rollup keeps the hot cards/charts O(days), not
O(events). Heavy historical aggregation should move to a scheduled job that
materializes monthly stats (the rollup pattern is already in place).

---

## 3. API (`app/api/src/routes/analytics.js`, mounted at `/api/analytics`)

**Record (any authenticated listener):**
- `POST /play` — `{ song_id, listening_seconds, duration_seconds?, session_id?, source?, started_at?, ended_at?, completed?, skipped? }`. Resolves album/artist from the manifest, derives device/browser/os from the UA, ip from the request, computes completion %, writes the event + bumps the daily rollup in one transaction.

**Admin-only (`requireRole('admin')`, every request audited to `identity.audit_log`):**
- `GET /overview` — all home summary cards.
- `GET /albums` · `GET /albums/:id` — album table (search/date/sort/paginate) + detail (per-song breakdown, most/least played song).
- `GET /songs` · `GET /songs/:id` — song table + detail incl. **per-user listening history** (the "User A played 14×, 53 min" view).
- `GET /users` · `GET /users/:id` — user listening analytics + per-user profile (favorites, averages, first/last listen).
- `GET /trends` — daily plays, DAU, monthly hours, peak hours, peak days.
- `GET /ratings` — distribution, highest/lowest/most-rated (reuses `review_summaries`).
- `GET /reviews` — totals, most-reviewed, latest, avg length, pending moderation.
- `GET /export?kind=albums|songs|users` — CSV download (filters applied).

Full contract: [`app/api/docs/ANALYTICS_API.md`](../api/docs/ANALYTICS_API.md).

---

## 4. Web

- **Player instrumentation** — `lib/analytics.ts` `recordPlay()` (keepalive fetch). The player store (`stores/player.ts`) tracks the in-progress play (`beginPlay`/`endPlay`) and fires an event on track change, natural end (completed), skip, and page unload. `FooterPlayer` wires the `ended`/unload hooks.
- **Dashboard** — `app/admin/analytics/page.tsx` + `components/AnalyticsDashboard.tsx`: tabbed (Overview, Trends, Albums, Songs, Users, Ratings, Reviews), summary cards, dependency-free inline **SVG charts** (line/area, bars, distribution, top-N), filterable/paginated tables, CSV/Excel export, and **Print / Save-as-PDF** (print stylesheet hides chrome). Styles in `app/styles/widgets/analytics.css`.
- **Access control** — the dashboard renders a **403 — Access Denied** panel for non-admins (client), and every API endpoint enforces admin server-side (the real boundary).
- **Navigation** — `components/Header.tsx` appends an **Admin** link as the **last item** in `jvh-media-links`, only when `hasRole('admin')`.

---

## 5. Requirements traceability

| BRD section | Where |
|---|---|
| Access control / SSO admin role | `requireRole('admin')` on all reads; `hasRole('admin')` in UI |
| Navigation — "Admin" last in `jvh-media-links` | Header `mediaItems` |
| 403 on direct access | dashboard 403 panel + API 401/403 |
| Home summary cards | `GET /overview` |
| Album / Song / User analytics | `/albums*`, `/songs*`, `/users*` |
| Play tracking (all fields) | `playback_events` + `POST /play` |
| Track / Album listening history | `/songs/:id` (per-user), `/albums/:id` |
| Rating / Review analytics | `/ratings`, `/reviews` |
| Listening trends + charts | `/trends` + SVG charts |
| Search & filters | table filters (q, from, to, sort) |
| Reports (CSV/Excel/PDF) | `/export` CSV (+ Excel via CSV), Print→PDF |
| Performance | rollup cache + indexes + pagination (partitioning documented) |
| Security | admin-only, audited, append-only, server-side authz |
| Database requirements | migration `0012_analytics.sql` |

---

## 6. Deployment

1. **Migrate:** `node app/db/run-migrations.js` (applies `0012_analytics.sql`). Idempotent.
2. **(Optional) demo data:** `NODE_PATH=<api>/node_modules DATABASE_URL=... node app/db/seed-analytics-demo.js 4000` — inserts ~4000 synthetic plays over 90 days so the dashboard isn't empty before real traffic. Remove with `DELETE FROM production.playback_events WHERE session_id LIKE 'demo-%';` then rebuild `analytics_daily`.
3. **API + web:** standard build/start (no new dependencies — charts and CSV are dependency-free). The play recorder and dashboard are live once deployed.
4. **Config:** none new. `SERVICE_*`/SSO config unchanged; the admin role is read from the same token as everywhere else.

---

## 7. Testing

- **Unit:** `util/ua.js` UA classification; `lib/analytics.ts` session id + payload; chart scaling.
- **Integration (verified against the dev DB):** `POST /play` → event persisted with album/artist resolved, device/browser/source captured, completion computed; `GET /overview|trends|albums|songs|users|ratings|reviews|export` all return correct aggregates over 4000 seeded events; non-admin → 401/403.
- **UAT:** sign in as admin → the **Admin** link appears last in the top nav → dashboard loads; tabs populate; filter/sort/paginate tables; export CSV/Excel; Print→PDF; play a few tracks and watch plays increment. Sign in as a non-admin (or guest) → no Admin link, direct `/admin/analytics` shows 403.

---

## 8. Limitations & future work
- **Excel** export ships as CSV (opens natively in Excel); **PDF** is browser Print→PDF with a print stylesheet. True native `.xlsx`/server-PDF would need a library (e.g. `exceljs`/`pdfkit`) — intentionally avoided to keep the dependency footprint lean.
- Listening-seconds is approximated from the audio element's reached position (good for engagement; not frame-accurate).
- Tables list items **with activity**; zero-play items are reachable by id (detail endpoints) and counted in totals.
- BRD "Future Enhancements" (WebSockets real-time, geo/device dashboards, AI insights, churn, revenue, recommendation metrics) are intentionally unbuilt; the event log + rollup + modular endpoints are the foundation each extends without breaking changes.
