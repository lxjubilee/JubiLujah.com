# Media Analytics API

Base: `/api/analytics`. Auth: `Authorization: Bearer <accessToken>`.

## Record a play — any authenticated listener
`POST /api/analytics/play`
```json
{ "song_id": "<uuid>", "listening_seconds": 200, "duration_seconds": 210,
  "session_id": "abc", "source": "album", "started_at": "ISO", "ended_at": "ISO",
  "completed": true, "skipped": false }
```
`album_id`, `artist_id`, device/browser/os, and IP are filled server-side. Returns `{ "recorded": true }` (201). Completion % and `completed`/`skipped` are derived when omitted.

## Admin reads — require the `admin` role (all access audited)
| Endpoint | Returns |
|---|---|
| `GET /overview` | Summary cards: totals (albums, songs, users, active users, plays, listening hours, ratings, reviews), avg album/song rating, most played album/song, most active listener, most rated/reviewed album. |
| `GET /trends?days=90` | `daily[]` (plays + hours), `dau[]`, `monthly[]`, `peak_hours[]`, `peak_days[]`. |
| `GET /albums?q=&from=&to=&sort=&page=&limit=` | Album table: plays, listeners, listening time, avg duration, avg rating, ratings, reviews, last played. `sort` ∈ plays\|listening\|unique\|rating\|reviews. |
| `GET /albums/:id` | Album detail + per-song breakdown + most/least played song. |
| `GET /songs?...` | Song table: plays, listeners, complete/partial plays, skips, avg completion, avg rating. |
| `GET /songs/:id` | Song detail + **per-user listening history** (`listeners_detail[]`). |
| `GET /users?q=&page=&limit=` | User listening table: plays, distinct songs/albums, sessions, listening time, first/last listen. |
| `GET /users/:id` | User profile: totals, daily/weekly/monthly avg minutes, favorite artist/album/song, ratings/reviews submitted. |
| `GET /ratings` | Distribution, highest/lowest/most-rated albums + highest/most-rated songs, raters. |
| `GET /reviews` | Album/song review totals, reviewers, avg length, pending moderation, most reviewed, latest reviews. |
| `GET /export?kind=albums\|songs\|users&from=&to=` | CSV download (`text/csv`, `Content-Disposition: attachment`). |

Errors: `401` (no token), `403` (not admin), `400` (bad id/params). All filters are optional; `from`/`to` are ISO dates filtering on the play's `started_at`.
