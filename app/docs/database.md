# Database

PostgreSQL 16+, four logical schemas (full DDL in `db/migrations/0001_init.sql`, copied from the
project's `db/schema.sql`).

| Schema | Tables (highlights) |
|---|---|
| `identity` | `users`, `user_roles`, `sessions`, `audit_log` — SSO mirror, RBAC, server sessions |
| `catalog` | `artists`, `albums`, `songs`, `lyrics`, `assets`, `scripture_references` |
| `production` | `pipeline_state`, `pipeline_history`, `publications`, `ratings`, `comments`, `award_categories`, `award_periods`, `nominations`, `awards` |
| `radio` | `stations`, `programs`, `playlists`, `playlist_items`, `schedules` |

### Conventions
- UUID v4 primary keys (`gen_random_uuid()`), `TIMESTAMPTZ` in UTC, soft-delete via nullable
  `deleted_at` where required.
- Append-only `pipeline_history` and `audit_log` have `DELETE` revoked from `PUBLIC`.
- Denormalized `avg_rating`/`rating_count` maintained by the `production.on_rating_change` trigger.
- Inspire-Family 12-song publish lock + album auto-promote enforced by triggers.
- The 250-character nomination justification is a `CHECK` constraint (`reason_min_length`) — enforced in
  the DB in addition to the API.

### The manifest ↔ Postgres UUID bridge

The catalog manifest is authoritative for browsing. Editorial tables reference catalog objects by a
**deterministic UUIDv5** so the same album/song always maps to the same UUID across web, api, and db:

```
namespace = f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f
album  id = uuidv5("album:" + CODE)            e.g. album:JEIM1002EN
song   id = uuidv5("song:"  + CODE + ":" + N)  e.g. song:JEIM1002EN:1
```

Implemented identically in `db/ids.js`, `api/src/ids.js`, `web/lib/ids.ts`. `production.ratings`,
`production.comments`, and `production.nominations` store this UUID in their polymorphic `rateable_id`
column — no schema change required.

## Provisioning

### Option A — Docker (recommended, dev)
`docker compose up -d` boots Postgres 16 and **auto-runs** `db/migrations/0001_init.sql` followed by the
`db/seed/*.sql` files on first initialization. To re-initialize: `docker compose down -v && docker
compose up -d`.

### Option B — Managed Postgres (Neon / Supabase / RDS, or non-Docker local)
```bash
export DATABASE_URL=postgres://user:pass@host:5432/jubilujah
npm run db:migrate -- --seed     # tracks applied files in public._migrations (idempotent)
```

### Catalog import (optional, both options)
```bash
npm run db:import                # mirrors the manifest into catalog.* + seeds demo editorial rows
```

## Seeds
- Base schema seeds the admin user (Gabriel), 13 Inspire artists, 11 award categories, 8 stations.
- `db/seed/01_award_periods.sql` — opens a 2026 nomination window per active category.
- `db/seed/02_stations.sql` — fills the full 101-station HM-band roster.
- `db/seed/03_demo_editorial.sql` — a second `content_editor` demo user.
