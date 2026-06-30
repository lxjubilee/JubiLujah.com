# Manage Music — Admin Module

A Jubilujah.com Admin Panel module for managing every album and song on the
site. It **synchronizes with the CDN** (`cdn.jubileeverse.com`), tracks asset
availability and health, and gives admins full control over what is visible on
the public site.

> **No media is duplicated.** The module stores only metadata and CDN
> *references*. MP3s and cover art stay on the CDN. The authoritative inventory
> of what exists on the CDN is the catalog manifest
> (`app/web/public/music/catalog-manifest.json`), itself a folder-scan of the
> CDN. The Manage Music tables are a **publish-state + health layer** over it.

---

## 1. Architecture

```
 cdn.jubileeverse.com  ──(folder scan, existing pipeline)──►  catalog-manifest.json
                                                                      │
                                       getManifest() (API, hot-reload)│
                                                                      ▼
   Admin UI  ──/api/admin/music──►  routes/music.js  ──►  services/musicSync.js
   (ManageMusic.tsx)                     │                      │  (HEAD-probe covers)
                                         ▼                      ▼
                              production.music_* tables  ◄──────┘
                                         │
            public catalog routes ◄──────┘  (services/musicVisibility.js hides
            (hidden albums suppressed)        admin-hidden albums from the site)
```

### Files

| Layer | Path |
|-------|------|
| Migration | `app/db/migrations/0015_manage_music.sql` |
| Sync engine | `app/api/src/services/musicSync.js` |
| Scheduler | `app/api/src/services/musicScheduler.js` |
| Public visibility | `app/api/src/services/musicVisibility.js` |
| Admin API | `app/api/src/routes/music.js` (mounted `/api/admin/music`) |
| Public enforcement | `app/api/src/routes/catalog.js` (hidden-album filter) |
| Admin UI | `app/web/components/ManageMusic.tsx`, `app/web/app/admin/music/page.tsx` |
| Nav | `app/web/app/admin/layout.tsx` (`Manage Music` tab) |
| Styles | `app/web/app/styles/widgets/manage-music.css` |

---

## 2. Data model (migration 0015, schema `production`)

| Table | Purpose |
|-------|---------|
| `music_album_state` | One row per `album_code`: publish visibility, cover/audio/metadata health, validation cache, CDN refs. |
| `music_song_state` | One row per `song_id` (deterministic UUID): audio availability, lyrics flag, visibility. |
| `music_sync_runs` | One row per sync execution — counts + JSON summary + step log. |
| `music_validation_results` | Normalized latest pass/fail per album per check. |
| `music_sync_config` | Singleton scheduled-sync cadence. |
| `music_activity_log` | Append-only admin audit (publish/hide/edit/sync). `REVOKE UPDATE,DELETE`. |

Albums/songs use the **same deterministic UUIDs** as the rest of the platform
(`albumUuid(code)`, `songUuid(code,n)` — `app/db/ids.js`), so the module joins
analytics/ratings/reviews without a new identity scheme.

**Visibility** (`production.music_visibility` enum): `published` | `hidden` |
`draft`. `visibility_source` is `auto` (tracks the manifest each sync) or
`manual` (an admin set it — **sync never overrides it**). On first import an
album is `published` if it has rendered audio, else `draft`.

Apply it:

```bash
cd app && node db/run-migrations.js     # applies 0015 (skips already-applied)
```

---

## 3. CDN synchronization

`services/musicSync.js → runSync({ trigger, actorUserId, probe })`:

1. Opens a `music_sync_runs` row (`status=running`).
2. Loads the manifest, flattens to album/song state rows, **de-dupes** by
   conflict key (the manifest can contain duplicate album folders).
3. HEAD-probes cover art on the CDN (bounded concurrency = 24, 8s timeout).
   `probe` controls scope: `none` (skip), `missing` (default — only unconfirmed
   covers + new albums), `all` (re-probe everything).
4. Derives `metadata_complete`, audio availability (from manifest `audio`/`url`
   flags), and per-album validation.
5. Bulk-upserts album/song state (chunked multi-row `INSERT … ON CONFLICT`),
   flags rows that vanished from the manifest as **broken references**
   (`present_in_manifest = false`), and mirrors validation results.
6. Records the result summary + step log and stamps `music_sync_config.last_run_at`.

**Incremental by design:** confirmed-present covers are sticky (not re-probed
unless `probe=all` or a per-album refresh), and audio availability comes from
the manifest rather than probing hundreds of thousands of files.

### Scheduled sync (Automatic Synchronization)

`services/musicScheduler.js` ticks every 60s and fires a sync when the configured
cadence (`off`/`hourly`/`6h`/`12h`/`daily`/`weekly`) is due. It is **opt-in
per process** so a multi-instance deployment doesn't double-run:

```bash
MUSIC_SYNC_SCHEDULER=on   # set on exactly ONE API instance
```

The cadence itself is set from the UI (Sync tab) and stored in
`music_sync_config`.

---

## 4. Public-site hiding

When an admin sets an album to `hidden`, `services/musicVisibility.js` (30s
cache, invalidated immediately on change) exposes the hidden set, and the public
catalog routes (`/api/catalog/artists/:slug`, `/api/catalog/albums/:code`,
`/api/album`) suppress it for non-elevated callers. Admins and reviewers still
see everything. **Only `hidden` is suppressed** — `draft`/studio gating is
unchanged and remains the web layer's existing concern. Nothing is hidden until
an admin explicitly hides something, so the default behavior is unchanged.

> Note: the public home/browse grids that read the static manifest directly in
> the web app are not yet wired to the hidden set; album/artist **detail** and
> the catalog API are. Wiring the static grids is the remaining integration step
> if full grid-level hiding is required.

---

## 5. API reference — `/api/admin/music` (all routes require `admin`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/dashboard` | 12 summary cards + last sync + schedule. |
| POST | `/sync` | Run a sync now. Body `{ probe?: 'none'\|'missing'\|'all' }`. |
| GET | `/sync/runs` | Recent sync runs (history/logs). `?limit`. |
| GET | `/sync/runs/:id` | One run incl. full step log. |
| GET / PUT | `/sync/config` | Read / set schedule `{ schedule, enabled }`. |
| GET | `/albums` | Search/filter/sort/paginate. Params below. |
| GET | `/albums/:code` | Album detail: state, tracks, validation, manifest. |
| PATCH | `/albums/:code/visibility` | `{ visibility }` → publish/hide/draft (manual). |
| PATCH | `/albums/:code/metadata` | `{ release_year?, category? }`. |
| POST | `/albums/:code/refresh` | Re-probe + re-validate one album from the CDN. |
| POST | `/albums/:code/validate` | Re-run validation checks. |
| DELETE | `/albums/:code` | Delete the **local reference** (CDN untouched). |
| GET | `/songs` | Search/filter/paginate songs. |
| GET | `/songs/:id` | Song detail. |
| PATCH | `/songs/:id/visibility` | `{ visibility }`. |
| GET | `/missing` | Missing-assets buckets (covers/metadata/audio/broken refs). |
| GET | `/probe?url=` | Live CDN HEAD probe (download test). |
| POST | `/bulk` | `{ action, albumCodes?, songIds? }` — publish/hide/draft/publish_songs/hide_songs/refresh/validate. |
| GET | `/activity` | Activity log (paginated; `?target_type`, `?action`). |
| GET | `/export?kind=albums\|songs\|missing\|activity` | CSV download. |

**`/albums` query params:** `q`, `artist` (slug), `category`, `year`,
`visibility`, `cover=missing\|present`, `audio=missing`, `metadata=complete\|missing`,
`broken=1\|all`, `sort` (`album_name\|artist\|release\|updated\|songs\|visibility\|cdn`),
`dir`, `page`, `pageSize`.

Every mutating route writes `production.music_activity_log` (administrator,
timestamp, action, target, previous → new value) and every read writes
`identity.audit_log`.

---

## 6. Admin UI

`/admin/music` (admin only via `app/admin/layout.tsx` guard). Sub-views:
**Dashboard** (12 clickable summary cards → filtered lists), **Albums**
(table with thumbnails, status indicators 🟢🔴🟡⚪, row actions, multi-select
bulk bar, sortable columns, pagination, slide-in detail drawer), **Songs**,
**Missing Assets**, **Activity**, **Sync** (cadence config + run history with
expandable logs). CSV export buttons fetch with the Bearer token and trigger a
blob download.

---

## 7. Deployment

1. **DB:** `node app/db/run-migrations.js` on the target (applies `0015`).
2. **API:** ship `app/api`, restart the `jubilujah-api` PM2 process. New env (all
   optional): `MUSIC_SYNC_SCHEDULER=on` (one instance only). `CDN_BASE` already
   configured (`https://cdn.jubileeverse.com`).
3. **Web:** rebuild & restart `app/web` (new route `/admin/music`, nav tab, CSS).
4. **First run:** open `/admin/music` → **Sync with CDN** (or "Full re-probe" to
   confirm every cover). ~821 albums / ~6k songs import in seconds; cover probing
   adds a few seconds.

### Verification
- `/admin/music` dashboard shows non-zero album/song counts after a sync.
- Hide an album → its `/api/catalog/albums/:code` returns 404 for a logged-out
  user but still resolves for an admin; un-hide restores it.
- `music_activity_log` records each publish/hide/sync.

---

## 8. Performance & scale

- Indexed on every filter/sort column; case-insensitive title/artist indexes.
- Bulk chunked upserts; sync is incremental (sticky covers, manifest-derived
  audio) so unchanged records aren't re-probed.
- Designed for tens of thousands of albums / hundreds of thousands of songs.
  For very large CDNs, run cover probing as a scheduled background job and
  consider moving the manifest scan itself off-box.

## 9. Future enhancements (architecture is modular for these)

xlsx/PDF export, drag-and-drop ordering, bulk metadata editing, AI metadata
validation / descriptions, cover-quality analysis, duplicate-song detection,
audio-quality validation, lyrics-sync status, scheduled publishing, metadata
version history, and deeper analytics/subscription integration. The CSV `/export`
endpoint and the activity log already expose the seams for reporting tools.
