# Jubilujah.com — Next.js + Node.js + PostgreSQL

Modern migration of the legacy static Jubilujah site to a Next.js frontend, a Node.js (Express)
backend, and PostgreSQL — with Single Sign-On to JubileeInspire, shared user management, RBAC,
security hardening, and SEO.

```
app/
├─ web/          Next.js 14 (App Router, TypeScript)        → http://localhost:3000
├─ api/          Node.js / Express backend                  → http://localhost:4000
├─ mock-oidc/    Dev OIDC provider emulating JubileeInspire  → http://localhost:4010
├─ db/           schema migrations, seeds, catalog importer
├─ docs/         architecture, API, database, SSO, deployment, testing report
└─ docker-compose.yml   Postgres 16 + mock-oidc
```

## Quick start

```bash
cd app
cp .env.example .env            # adjust if needed
docker compose up -d            # Postgres (schema+seed auto-loaded) + mock-oidc
npm install                     # install all workspaces
npm run db:import               # mirror the catalog manifest into Postgres (optional)
npm run dev                     # web :3000 + api :4000  (+ oidc runs in compose)
```

Then open http://localhost:3000.

- Sign in via **Login → Continue to JubileeInspire** → choose a dev account (Gabriel = admin).
- Browse the catalog, play an album track, and watch playback continue as you navigate.
- Visit **/admin** (admin only) for the operations console.

> No Docker? See `docs/deployment.md` for the managed-Postgres path (`npm run db:migrate -- --seed`
> against any `DATABASE_URL`), and run `mock-oidc` with `npm --workspace mock-oidc run dev`.

## Scripts (run from `app/`)

| Command | Description |
|---|---|
| `npm run dev` | Run web + api + mock-oidc together |
| `npm run build` | Production build of the Next.js app |
| `npm run db:migrate -- --seed` | Apply migrations + seeds to `DATABASE_URL` (non-Docker) |
| `npm run db:import` | Import the catalog manifest into `catalog.*` |
| `npm run smoke` | API smoke test (expects api + db running) |

## Documentation

- [docs/architecture.md](docs/architecture.md) — system design and data planes
- [docs/api.md](docs/api.md) — REST API surface (also `GET /api/openapi.json`)
- [docs/database.md](docs/database.md) — schema, the manifest↔Postgres UUID bridge
- [docs/sso-integration.md](docs/sso-integration.md) — SSO flow + real-IdP cutover
- [docs/deployment.md](docs/deployment.md) — environments, env vars, hosting
- [docs/testing-report.md](docs/testing-report.md) — migration parity + validation
