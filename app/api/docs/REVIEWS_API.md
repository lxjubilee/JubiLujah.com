# Ratings & Reviews API

Public, user-facing rating and review system. Base URL: `/api` (proxied to the
Express API). Distinct from the editorial `/api/ratings` and `/api/comments`
(which are gated to `content_editor`); **this surface is open to any
authenticated user (`viewer` and above)** and readable by guests.

- **Auth:** `Authorization: Bearer <accessToken>` (see `AUTH_API.md`). Reads are
  public; writes require a valid token. The caller is identified by `req.auth`.
- **Targets** are polymorphic: `type` ∈ `{album, song}`, `id` = the deterministic
  catalog UUID (`albumUuid(code)` / `songUuid(code, n)` — identical across web,
  API, and DB).
- **Rate limiting:** writes share the global write limiter (120 req/min/IP).
- **Errors:** `{ error, message, ...extra }` with the appropriate HTTP status
  (400 validation, 401 unauth, 403 forbidden, 404 not found, 409 conflict).

---

## Reads (public)

### `GET /api/reviews/:type/:id/summary`
Aggregated rating for one target. The caller's own rating is included when authed.
```json
{
  "target_type": "album", "target_id": "…uuid…",
  "average": 4.8, "rating_count": 1284, "review_count": 312,
  "distribution": { "1": 12, "2": 38, "3": 102, "4": 231, "5": 901 },
  "mine": { "id": "…", "stars": 5, "title": "…", "body": "…", "status": "published", "helpful_count": 3, "created_at": "…", "edited": false }
}
```

### `POST /api/reviews/summaries`
Batch summaries (one round-trip for an album + all its songs). Body:
```json
{ "targets": [ { "type": "album", "id": "…" }, { "type": "song", "id": "…" } ] }
```
Returns `{ "summaries": { "album:…": { …summary…, "mine": … }, "song:…": { … } } }`.

### `GET /api/reviews/:type/:id`
Paginated, sorted list of **written reviews** (rows with a non-empty body) for one
target. Query: `sort` ∈ `{recent, highest, lowest, helpful}` (default `recent`),
`page` (≥1), `limit` (1–50, default 10).
```json
{ "items": [ { "id": "…", "stars": 5, "title": "…", "body": "…", "helpful_count": 56,
  "created_at": "…", "edited": false, "author": { "display_name": "John D.", "avatar_url": null },
  "mine": false, "voted": false } ], "page": 1, "limit": 10, "total": 312, "has_more": true, "sort": "recent" }
```

### `POST /api/reviews/list`
Merged list across **many** targets — used by the Reviews page for "All Reviews"
(album + every song), "Album Reviews" (album only), or a single song. Body:
`{ targets: [...], sort?, page?, limit? }`. Same item shape as above; each item
carries its own `target_type`/`target_id`.

### `GET /api/reviews/artist/:slug/summary`
Artist aggregate across all of the artist's albums (§12):
`{ slug, average, rating_count, review_count, album_count }`.

---

## Writes (require auth)

### `PUT /api/reviews/:type/:id`
Create or update the caller's rating/review (upsert — "latest replaces previous",
§2/§15). Body: `{ stars: 1..5 (required), title?: string≤150, body?: string≤5000 }`.
Title/body are server-sanitized (tags/scripts stripped). Returns
`{ review, summary }`.

### `DELETE /api/reviews/:type/:id`
Soft-deletes the caller's review and recomputes the summary. Returns
`{ deleted: true, summary }`.

### `POST /api/reviews/review/:reviewId/helpful`
Toggles the caller's "helpful" vote (§9). One vote per user per review; voting
again removes it. Returns `{ voted: boolean, helpful_count: number }`. Notifies
the review's author (§14).

### `POST /api/reviews/review/:reviewId/report`
Reports a review for moderation (§10). Body:
`{ reason: spam|offensive_language|hate_speech|fake_review|other, detail?: ≤1000 }`.
Idempotent per user. Returns `{ reported: true }`. **A report never hides a
review** — only a moderator can.

---

## Profile & notifications (require auth)

- `GET /api/reviews/me/contributions` → `{ albums_rated, songs_rated, reviews_written, total_contributions, helpful_received }` (§13).
- `GET /api/reviews/me/reviews` → the caller's reviews (any status) with target refs.
- `GET /api/reviews/notifications` → `{ items: [...], unread }` (§14).
- `POST /api/reviews/notifications/read` → body `{ ids?: [...] }` (omit to mark all read).

---

## Admin moderation & analytics (require `admin`)

Mounted at `/api/admin/reviews`.

- `GET /api/admin/reviews` — list/search. Query: `status`, `target_type`,
  `reported=true`, `q` (title/body/author), `include_deleted=true`, `page`, `limit`.
- `GET /api/admin/reviews/reports` — open report queue.
- `GET /api/admin/reviews/:id/history` — moderation log for a review.
- `POST /api/admin/reviews/:id/moderate` — body
  `{ action: approve|reject|hide|restore|delete, reason? }`. Applies the status
  change, resolves open reports, appends to `review_moderation_log`, mirrors into
  `identity.audit_log`, and notifies the author (§11/§14/§17).
- `GET /api/admin/reviews/analytics` — §19 dashboard payload
  (`highest_rated_albums`, `highest_rated_songs`, `most_reviewed_albums`,
  `most_reviewed_songs`, `most_active_reviewers`, `platform`, `over_time`,
  `most_helpful_reviews`).
