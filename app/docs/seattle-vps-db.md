# Seattle VPS — `jubilujah` PostgreSQL database

Point the Jubilujah API (`app/api`) at a dedicated **`jubilujah`** database on the
Seattle production VPS instead of the local Docker Postgres.

> **Status: provisioned & live.** The `jubilujah_app` role and `jubilujah` database
> exist on the VPS (PostgreSQL 16.11). Schema (`0001_init`, `0002_credentials`),
> seeds, and the catalog mirror (34 artists / 732 albums / 5,979 songs) are loaded.
> The API connects over the SSH tunnel below; the role password lives in `app/.env`
> (gitignored). Re-running any step is idempotent.

| | |
|---|---|
| Host | `94.72.120.231` (hostname `SEAIIS01SERVER`, Ubuntu) |
| SSH access | `ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" -o IdentitiesOnly=yes root@94.72.120.231` |
| Database | `jubilujah` (lowercase — no quoting needed) |
| App role | `jubilujah_app` |
| Consumed by | `app/api` via `DATABASE_URL` (see `app/api/src/config.js` / `db.js`) |

> The web app (`:3000`) never talks to Postgres directly — it calls the API, and the
> API is the only process that reads `DATABASE_URL`. Switching the DB is purely an
> `app/.env` change plus provisioning the server.

---

## 1. Provision Postgres on the VPS

SSH in as root, then:

```bash
# Install Postgres 16 if it isn't already present
apt-get update && apt-get install -y postgresql postgresql-contrib
systemctl enable --now postgresql
pg_isready                                  # expect: accepting connections

# Create the app role + database (pick a strong password)
sudo -u postgres psql <<'SQL'
CREATE ROLE jubilujah_app LOGIN PASSWORD 'CHANGE_ME_STRONG';
CREATE DATABASE jubilujah OWNER jubilujah_app;
SQL
```

## 2. Connect over an SSH tunnel (the chosen, secure default)

The VPS Postgres listens on **localhost only** (`127.0.0.1:5432`) and stays that way —
nothing is exposed to the internet. The workstation app reaches it by forwarding a
local port through SSH. Open the tunnel and leave it running:

```bash
ssh -i "$USERPROFILE/.ssh/id_ed25519_jubilee_prod" -o IdentitiesOnly=yes \
    -N -L 5433:localhost:5432 root@94.72.120.231
```

Now `localhost:5433` on your machine forwards to the VPS's `:5432`. The API connects
there with **no SSL flag** — SSH already encrypts the hop and Postgres sees a local
connection.

> Alternative (not used here): run the API **on the VPS** and connect via
> `@localhost:5432` — then no tunnel is needed. Exposing 5432 directly to the
> internet is discouraged.

## 3. Load schema + seed (already done — idempotent to re-run)

From `app/`, with the tunnel open and `DATABASE_URL` pointed at it:

```bash
npm run db:migrate -- --seed     # applies db/migrations/*.sql + db/seed/*.sql
npm run db:import                # mirror the catalog manifest into catalog.*
npm run smoke                    # optional: API smoke test against the DB
```

## 4. The API is wired to the VPS DB

`app/.env` already has the active connection (tunnel form):

```ini
DATABASE_URL=postgres://jubilujah_app:<password>@localhost:5433/jubilujah
PGSSLMODE=disable
```

Restart the API (`npm run dev:api`, or `node api/src/index.js`) and confirm:

```bash
curl -s localhost:4000/health    # {"status":"healthy","db":true,...}
```

---

### Notes
- Keep the password out of git — `app/.env` is gitignored; only `.env.example` (placeholder) is tracked.
- If the API is deployed onto the VPS, use `@localhost:5432/jubilujah` and `PGSSLMODE=disable`
  (no need to expose 5432 externally) — that's the more secure default.
