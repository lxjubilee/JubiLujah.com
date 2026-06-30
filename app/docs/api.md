# API Reference

Base URL (dev): `http://localhost:4000`. The Next app proxies `/api/*` here, so browsers call the API
same-origin. Machine-readable spec: **`GET /api/openapi.json`** (OpenAPI 3.1).

## Conventions
- JSON request/response. Auth via the `jv_session` HttpOnly cookie (set by the SSO callback).
- **CSRF**: every mutating request (POST/PUT/PATCH/DELETE) must send header `X-CSRF-Token` equal to the
  `jv_csrf` cookie value (double-submit). The browser client (`web/lib/api.ts`) does this automatically.
- **Errors**: `{ "error": "...", "message": "..." }` with appropriate status (400 validation, 401
  unauthenticated, 403 forbidden/CSRF, 404, 409 conflict, 422 constraint, 429 rate-limited, 500).

## Auth
| Method | Path | Notes |
|---|---|---|
| GET | `/api/auth/login?returnTo=/path` | Begin OIDC login (302 to IdP) |
| GET | `/api/auth/callback` | OIDC redirect target; sets session |
| POST | `/api/auth/logout` | Revoke session (CSRF) |
| GET | `/api/auth/me` | `{ authenticated, user, roles }` |

## Catalog (public, manifest-backed)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/categories` | Categories + counts |
| GET | `/api/artists?category=` | Artists (optionally by category) |
| GET | `/api/artists/{slug}` | Artist + albums |
| GET | `/api/albums/{code}` | Album with tracks + CDN URLs + deterministic UUIDs |
| GET | `/api/album?code=&path=` | Legacy alias |
| GET | `/api/status-counts?scope=all\|family\|children\|category:KEY\|artist:SLUG` | Ready/Studio rollup |
| GET | `/api/cdn-probe?url=` | HEAD-check a CDN audio URL |

## Ratings (§9) — `content_editor` to write
| Method | Path | |
|---|---|---|
| GET | `/api/ratings/{type}/{id}` | aggregate + distribution + caller's rating |
| PUT | `/api/ratings/{type}/{id}` | `{ stars: 1..5, note? }` upsert |
| DELETE | `/api/ratings/{type}/{id}` | remove caller's rating |

## Comments (§10) — `content_editor` to write
| Method | Path | |
|---|---|---|
| GET | `/api/comments/{type}/{id}` | list active comments |
| POST | `/api/comments/{type}/{id}` | `{ body, parent_id?, lyric_line?, mentions? }` |
| PATCH | `/api/comments/{commentId}` | edit own |
| DELETE | `/api/comments/{commentId}` | soft-delete own |

## Awards (§11)
| Method | Path | |
|---|---|---|
| GET | `/api/awards/categories?active=true` | |
| GET | `/api/awards/periods/{year}` | |
| POST | `/api/awards/nominations` | `{ period_id, rateable_type, rateable_id, reason }` — **≥250 chars** (422 otherwise) |
| GET | `/api/awards/nominations?period=&category=&type=&id=` | |

## Pipeline (§8)
| Method | Path | Role |
|---|---|---|
| GET | `/api/pipeline?stage=` | `content_editor` |
| GET | `/api/pipeline/{type}/{id}/history` | `content_editor` |
| POST | `/api/pipeline/{type}/{id}/transition` | `production_manager` — `{ to_stage, note? }` |

## Radio (§12)
| Method | Path | Role |
|---|---|---|
| GET | `/api/stations` · `/api/programs` · `/api/playlists` · `/api/playlists/{id}` | public |
| POST | `/api/playlists` | `radio_producer` |
| PATCH | `/api/playlists/{id}/items` | `radio_producer` — `{ items:[{song_id,transition?}] }` |

## Admin (§14) — `admin` only
| Method | Path | |
|---|---|---|
| GET | `/api/admin/users` | users + roles |
| PATCH | `/api/admin/users/{id}/roles` | `{ roles: [...] }` |
| GET | `/api/admin/audit?since=` | audit log |
| POST | `/api/admin/publish/{type}/{id}` | record publication version + advance pipeline |
