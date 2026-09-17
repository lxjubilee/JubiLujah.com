# Seattle VPS — `jubileepraise` PostgreSQL database

The JubileePraise API (`app/api`) reads one database: **`jubileepraise`** on the Seattle
production VPS, owned by the **`jubileepraise_app`** role. It is a clone — schema *and*
data — of the old `jubilujah` database, made on 2026-09-17 by
[`db/clone-jubilujah.sh`](../db/clone-jubilujah.sh) and rebranded by migration
[`0035_jubileepraise_rebrand.sql`](../db/migrations/0035_jubileepraise_rebrand.sql).

> **Owner direction, 2026-09-17:** "Clone the database schema and data from Jubilujah DB.
> Create new database tables/references to fit JubileePraise. Connect this new database to
> the provided codebase." This supersedes DECISIONS D-2026-09-03-1 ("the database stays
> `jubilujah`"). The old database is left in place, untouched, as the rollback.

| | |
|---|---|
| Host | `94.72.120.231` (hostname `SEAIIS01SERVER`, Ubuntu, PostgreSQL 16) |
| SSH access | `ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" -o IdentitiesOnly=yes root@94.72.120.231` |
| Database | `jubileepraise` (lowercase — no quoting needed) |
| App role | `jubileepraise_app` — owns **every** object (the clone restores with `--role`) |
| Consumed by | `app/api` via `DATABASE_URL` (see `app/api/src/config.js` / `db.js`) — the API runs on the same box, so `@localhost:5432` |
| Previous database | `jubilujah` / `jubilujah_app` — still present, no longer read by this API |

> The web app (`:3030` on prod) never talks to Postgres directly — it calls the API, and the
> API is the only process that reads `DATABASE_URL`. Switching the DB is purely an
> `.env` change plus a `pm2 restart jubilujah-api --update-env`.

---

## 1. Make the clone (once per server)

Postgres on the VPS listens on **localhost only** and stays that way. SSH in as root, then:

```bash
cd /var/www/jubilujah.com          # prod code dir (web/ + api/ + db/)
sudo -u postgres bash db/clone-jubilujah.sh --password '<STRONG_PASSWORD>'
```

What the script does, in order (it prints each step and refuses to overwrite an existing
`jubileepraise` unless `--force`):

1. `CREATE ROLE jubileepraise_app LOGIN PASSWORD …` (skipped if it exists).
2. `CREATE DATABASE jubileepraise OWNER jubileepraise_app` from `template0`.
3. Creates the source's extensions (`citext`, `pgcrypto`) as the superuser.
4. `pg_dump -Fc jubilujah | pg_restore --role=jubileepraise_app -d jubileepraise` — a consistent
   snapshot; the old database keeps serving throughout, and every restored object is owned by
   the new role (the old database had mixed ownership, which is why `ALTER`s there needed the
   superuser — see PUBLISH.md, 2026-09-16).
5. Applies `0035_jubileepraise_rebrand.sql` and records it in `public._migrations`.
6. Prints row counts for both databases side by side, the owner check and the brand residue.

Anything written to `jubilujah` **after** the clone is not in `jubileepraise`. The clone is a
point-in-time copy; run it in the same window as the API cutover.

## 2. Point the API at it

In `/var/www/jubilujah.com/.env` (prod) or `app/.env` (workstation):

```ini
DATABASE_URL=postgres://jubileepraise_app:<password>@localhost:5432/jubileepraise
PGSSLMODE=disable
```

Then `pm2 restart jubilujah-api --update-env` and confirm:

```bash
curl -s localhost:4030/health    # {"status":"healthy","db":true,"service":"jubileepraise-api"}
```

## 3. Later migrations

From `app/` with `DATABASE_URL` pointed at the new database:

```bash
npm run db:migrate               # applies db/migrations/*.sql not yet in public._migrations
```

`public._migrations` was copied across with the data, so the runner knows what the old
database had already applied. (Prod's history there is incomplete — several migrations were
applied by hand with `psql` and recorded manually; the runner will re-offer those files, and
they are written to be idempotent. Check before running.)

## 4. Workstation

The local PostgreSQL 18 service on `:5432` holds `jubilujah`; the same script makes the local
copy, given a superuser connection (the `jubilee` dev role has neither `SUPERUSER` nor
`CREATEDB`):

```bash
PGSUPER=postgres://postgres:<pw>@localhost:5432/postgres \
  bash db/clone-jubilujah.sh --password jubilee_dev_pw --role jubilee
```

---

<details><summary>Superseded — the <code>jubilujah</code> database this replaced (2026-09-03 → 2026-09-17)</summary>

The API previously read the **`jubilujah`** database (role `jubilujah_app`), provisioned with
`CREATE ROLE jubilujah_app LOGIN PASSWORD …; CREATE DATABASE jubilujah OWNER jubilujah_app;`
and loaded with `npm run db:migrate -- --seed` + `npm run db:import` (34 artists / 732 albums /
5,979 songs at the time). Workstations reached it over an SSH tunnel
(`ssh -N -L 5433:localhost:5432 root@94.72.120.231`, then `@localhost:5433/jubilujah`).
The rename of 2026-08-27 briefly pointed the app at a `jubileepraise` database that did not
exist; D-2026-09-03-1 restored `jubilujah`. That database now exists for real — as the clone
above.

</details>
