# Deployment & Operations

## Environments

| Service | Dev | Production (suggested) |
|---|---|---|
| Web (Next.js) | `localhost:3000` | Vercel / Cloudflare Pages |
| API (Express) | `localhost:4000` | Containerized (Fly/Render/ECS) or same host as web |
| Postgres | Docker `localhost:5432` | Managed (Neon / Supabase / RDS) |
| OIDC | `mock-oidc` `localhost:4010` | `api.JubileeInspire.com` |

## Environment variables

All configuration is via env (see `.env.example`). Key variables:

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | 32+ random bytes; signs/identifies sessions — **rotate per environment** |
| `CORS_ORIGIN` | Comma-separated allowed browser origins |
| `COOKIE_DOMAIN` | Shared parent domain for cross-site session (prod) |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_REDIRECT_URI` | SSO client config |
| `WEB_BASE_URL` | Where the callback redirects after login |
| `MANIFEST_PATH` | Path to the catalog manifest |
| `NEXT_PUBLIC_API_BASE` | API base the web app proxies to |
| `NEXT_PUBLIC_CDN_BASE` | CDN base for audio/art |

In production set `NODE_ENV=production` (enables `Secure` cookies + HSTS via helmet) and serve
everything over HTTPS.

## Local stack (Docker)

```bash
cd app && cp .env.example .env
docker compose up -d          # Postgres (schema+seed auto-loaded) + mock-oidc
npm install
npm run db:import             # optional: mirror catalog into Postgres
npm run dev                   # web + api
```

## Without Docker (managed Postgres)

```bash
export DATABASE_URL=postgres://...           # your managed instance
npm run db:migrate -- --seed                 # apply schema + seeds (idempotent)
npm run db:import
npm --workspace mock-oidc run dev            # or point OIDC_* at the real IdP
npm run dev
```

## Production build

```bash
npm run build                  # Next.js production build
npm --workspace web run start  # serve web
npm --workspace api run start  # serve api (NODE_ENV=production)
```

## Operational notes

- **Sessions**: server-side in `identity.sessions`; expire after `SESSION_TTL_HOURS`. Revoke by setting
  `revoked_at` (logout does this).
- **Backups**: managed Postgres daily logical backup + PITR (Build-Spec §20). Audit/history tables are
  append-only.
- **Rate limits**: auth endpoints 50/15 min; writes 120/min. Tune in `api/src/index.js` or move to the
  edge (Cloudflare) in production.
- **Manifest refresh / adding albums**: replace `web/public/music/catalog-manifest.json` (and re-run
  `db:import` if you want the catalog mirror updated). The API hot-reloads the manifest on mtime change,
  **but the catalog pages (`/`, `/inspire`, category pages) are ISR/prerendered at build time** — a manifest
  change does NOT appear on them until you **rebuild** (`rm -rf web/.next && npm run build && pm2 restart
  jubilujah-web`) and purge the Cloudflare cache. Full runbook: [publishing-albums.md](publishing-albums.md).
- **Security checklist**: HTTPS+HSTS, HttpOnly/Secure/SameSite cookies, CSRF on mutations, parameterized
  SQL, Zod validation, helmet headers, locked CORS, secrets only via env. Rotate `SESSION_SECRET` and
  OIDC client secret per environment.
