# Rating & Review System — Technical & Testing Documentation

Implements the public **Rating and Review System** for JubileePraise.com: users rate
albums and songs, write reviews, vote reviews helpful, report abuse; moderators
manage everything from a dashboard. Built on the existing stack (Next.js 14
App Router + TypeScript web, Express + PostgreSQL 16 API) and designed to sit
alongside the current experience without disturbing it.

---

## 1. Design overview

**Public vs. editorial — a deliberate separation.** The codebase already had
editorial `production.ratings` / `production.comments`, gated to the
`content_editor` role and used by the internal team. The business requirement is
a *public* system for any logged-in user. Rather than overload the editorial
tables (which feed `catalog.albums.avg_rating` etc.), this feature is a **new,
parallel module** (`production.user_reviews` and friends). The editorial widgets
on the album page are untouched; the public widgets are additive. This is what
satisfies "integrated without affecting the current user experience."

**One row = rating + review.** A user has exactly one row per target carrying a
required 1–5 star score plus an optional title/body. No body ⇒ "just a rating";
with a body ⇒ "a review". This gives "one rating per user per album", "latest
replaces previous" (UPSERT), and the rating-vs-review counts from a single table.

**Aggregates are cached.** `production.review_summaries` holds avg/count/
distribution per target, maintained by trigger on every rating change, so the hot
read path (`GET …/summary`) is a single primary-key lookup — scalable to millions
of ratings.

---

## 2. Data model (migration `app/db/migrations/0010_reviews.sql`)

| Table | Purpose |
|---|---|
| `production.user_reviews` | The rating+review row. UNIQUE `(target_type, target_id, reviewer_user_id)`; `stars` CHECK 1–5; soft delete; `status` enum. |
| `production.review_helpful_votes` | One helpful vote per user per review (PK `(review_id, user_id)`). Drives `helpful_count`. |
| `production.review_reports` | One report per user per review; `reason` enum; `status` lifecycle. |
| `production.review_moderation_log` | Append-only moderation audit (DELETE revoked). |
| `production.review_notifications` | Per-user notifications (helpful vote, approved, rejected, removed). |
| `production.review_summaries` | Denormalized aggregate cache (avg, rating_count, review_count, dist_1..5). |

**Enums:** `review_status (published|pending|rejected|hidden)`,
`report_reason (spam|offensive_language|hate_speech|fake_review|other)`,
`report_status (open|actioned|dismissed)`. Targets reuse the existing
`production.rateable_type`, constrained to `album|song`.

**Triggers:**
- `trg_user_review_summary` — recomputes the cached summary on insert/delete and
  on updates to `stars|body|status|deleted_at|target` (not on `helpful_count`).
- `trg_helpful_vote_count` — maintains `user_reviews.helpful_count` from the votes
  table.
- `user_reviews` intentionally has **no** generic `updated_at` touch trigger, so
  `updated_at > created_at` reliably means "edited by the author" (moderation and
  vote writes must not flip the "edited" flag).

**Indexing (§16):** partial indexes on `(target_type, target_id, …)` for each sort
order (recent/highest/helpful), per-reviewer and per-status indexes, and the
summary PK. All list queries are index-backed and paginated.

---

## 3. API (Express)

New files under `app/api/src`:
- `routes/reviews.js` — public + user endpoints (summary, batch summaries, list,
  merged list, upsert, delete, helpful, report, artist summary, contributions,
  notifications).
- `routes/reviewsAdmin.js` — admin moderation + analytics (`/api/admin/reviews`).
- `util/sanitize.js` — dependency-free server-side text sanitizer (§17).
- Wired in `src/index.js` (both behind the write rate limiter; `/api/admin/reviews`
  mounted before the generic `/api/admin` so its routes win).

Full contract: [`app/api/docs/REVIEWS_API.md`](../api/docs/REVIEWS_API.md).

---

## 4. Web (Next.js)

New/changed files under `app/web`:
- `lib/reviews.ts` — typed API client + display helpers.
- `components/StarRating.tsx` — fractional display + interactive picker.
- `components/PublicAlbumRating.tsx`, `SongRatingControl.tsx` — album-page widgets
  (aggregates only; no individual reviews on the album page, per §6).
- `components/ReviewComposer.tsx`, `ReportDialog.tsx`, `ReviewItem.tsx`,
  `ReviewsBrowser.tsx` — the review write flow and the dedicated page body.
- `components/MyContributions.tsx` — profile section (§13), shown on `/account`.
- `components/ModerationDashboard.tsx` — admin dashboard (§11, §19).
- `app/album/reviews/page.tsx` — the dedicated Ratings & Reviews page
  (`/album/reviews?code=XXX`).
- `app/moderation/page.tsx` — `/moderation` (admin).
- `app/styles/widgets/reviews.css` (imported in `globals.css`).
- Integrated into `components/AlbumApp.tsx` (album rating block + per-track
  controls + composer), `app/account/page.tsx`, and `components/Header.tsx`
  (admin "Review moderation" link).

The album page shows only aggregated stars/counts and a "Ratings & Reviews" link;
individual reviews live solely on the dedicated page (§6).

---

## 5. Running it

The web app, API, and DB are wired by the existing tooling.

```bash
# 1. Database (Postgres 16). Either docker-compose (auto-runs all migrations+seed)…
cd app && docker compose up -d db

#    …or apply migrations to any DATABASE_URL (Neon/RDS/local):
node app/db/run-migrations.js --seed     # picks up 0010_reviews.sql

# 2. Mirror the catalog so album/song UUIDs resolve to titles in admin/analytics:
node app/db/import-catalog.js

# 3. API
cd app/api && npm install && npm run dev   # http://localhost:4000

# 4. Web (NEXT_PUBLIC_API_BASE defaults to http://localhost:4000)
cd app/web && npm install && npm run dev   # http://localhost:3000
```

Migration `0010` is additive and idempotent via the migration tracker; it does not
touch existing tables.

---

## 6. Security (§17) — how each control is met

- **Auth on writes** — `requireAuth` on every mutating route; reads are public.
- **No duplicate ratings** — DB UNIQUE `(target_type, target_id, reviewer_user_id)`
  + UPSERT; helpful votes PK `(review_id, user_id)`; reports UNIQUE per user.
- **XSS** — `sanitizeText` strips tags / `javascript:` / control chars on the
  server; React escapes on render; nothing uses `dangerouslySetInnerHTML`.
- **Input validation** — Zod schemas server-side (length/enum/range) **and**
  client-side (star required, length caps, char counters).
- **Rate limiting** — shared write limiter (120/min/IP).
- **Audit** — every moderation action is written to the append-only
  `review_moderation_log` and mirrored to `identity.audit_log`.
- **AuthZ** — admin endpoints require the `admin` role (`requireRole('admin')`),
  enforced server-side regardless of the client.

---

## 7. Requirements traceability

| Req | Where |
|---|---|
| §1 Auth (guests read, users write) | `requireAuth` on writes; public GETs |
| §2 Album rating (1 per user, update, recalc) | `PUT /reviews/album/:id` + summary trigger |
| §3 Song rating | `PUT /reviews/song/:id`; `SongRatingControl` |
| §4/§5 Album & song reviews (title/body, edit, delete) | `ReviewComposer`; `PUT`/`DELETE` |
| §6 Album page (aggregates only, Rate buttons, link) | `PublicAlbumRating`, `SongRatingControl` in `AlbumApp` |
| §7 Reviews page (summary, distribution, reviews, song filter) | `app/album/reviews`, `ReviewsBrowser` |
| §8 Sorting | `sort` param (recent/highest/lowest/helpful) |
| §9 Helpful votes | `review_helpful_votes`; `POST …/helpful` |
| §10 Reporting | `review_reports`; `ReportDialog` |
| §11 Moderation dashboard | `reviewsAdmin.js`; `ModerationDashboard` |
| §12 Artist ratings | `GET /reviews/artist/:slug/summary` |
| §13 User profile | `GET /reviews/me/contributions`; `MyContributions` |
| §14 Notifications | `review_notifications`; notify on vote/moderation |
| §15 Rating recalculation | summary trigger on insert/update/delete |
| §16 Performance | summary cache + partial indexes + pagination |
| §17 Security | see §6 above |
| §18 Database | migration `0010_reviews.sql` |
| §19 Analytics | `GET /admin/reviews/analytics`; analytics tab |
| §20 Future scalability | `status` enum + notifications + modular tables |

---

## 8. Testing

### 8.1 Unit (pure functions)
- `util/sanitize.js`: `<script>`/`<b>` stripped; `javascript:` removed; `I <3 you`
  preserved; blank → `null`. (Spot-checked during build:
  `sanitizeText('Hi <script>alert(1)</script> <b>x</b> I <3 you')` →
  `'Hi alert(1) x I <3 you'`.)
- `lib/reviews.ts`: `distPct`, `reviewDate` formatting.
- `StarRating`: fractional fill width = `value/5*100%`.

### 8.2 Integration (API + DB) — recommended `app/api/scripts` smoke
Run against a seeded dev DB (extend `npm run smoke`):
1. `PUT /reviews/album/:id {stars:5}` then `GET …/summary` → average 5, count 1.
2. Second user rates 3 → average 4.0, distribution updates.
3. `PUT` again as user 1 with `{stars:4, body:"…"}` → count unchanged (upsert),
   `review_count` now 1, average 3.5.
4. `GET /reviews/album/:id` lists the written review; sort variants ordered right.
5. `POST …/helpful` twice → toggles 1 then 0; author gets a notification.
6. `POST …/report {reason:"spam"}` → appears in `GET /admin/reviews/reports`.
7. `POST /admin/reviews/:id/moderate {action:"hide"}` → review drops from public
   `summary`/list; report resolved; `…/history` shows the entry; author notified.
8. `DELETE /reviews/album/:id` → summary recomputes.
9. AuthZ: write without token → 401; `/admin/*` as non-admin → 403.

### 8.3 UAT (manual, in the running app)
- **Guest:** open `/album?code=…` and `/album/reviews?code=…` — sees aggregates and
  published reviews; "Rate" routes to `/signin`.
- **User:** sign in → "Rate this Album" → submit 5★ + title + comment → album block
  shows the new average; the review appears on the reviews page; edit and delete
  work; rate a song from the track list; mark another user's review helpful; report
  a review; check `/account` → "My Contributions" counts.
- **Filters/sort:** on the reviews page, switch All / Album / a specific song; sort
  by each option; paginate.
- **Admin:** `/moderation` → Reported queue, hide/reject/restore/delete with a
  reason, view history; All Reviews search/filter; Analytics tab populated.
- **Responsive:** verify album block, reviews page, and dashboard at mobile width.

---

## 9. Known limitations & follow-ups
- Admin/analytics titles require `import-catalog.js` to have been run; otherwise
  UUIDs are shown (the UI falls back gracefully).
- Notifications are surfaced via the API; a header bell UI is a small follow-up.
- §20 future work (replies, threaded discussion, verified-listener badges, artist
  responses, AI moderation/summaries/sentiment, achievements, social sharing) is
  unbuilt by design — the schema (`status` enum, notifications, modular tables)
  leaves room for each without breaking changes.
- The full stack was verified by: API syntax/`node --check` + module import, web
  `tsc --noEmit` (clean), and live render of `/album`, `/album/reviews`,
  `/moderation`, `/account` (HTTP 200 with the widgets present). End-to-end data
  flow requires a running Postgres (not available in the authoring environment).
