#!/usr/bin/env node
// Mint fresh service-auth secrets and print a ready-to-paste prod .env block for
// the client-credentials JWT setup (see docs/AUTH_API.md §11.4).
//
//   node api/scripts/gen-service-secrets.mjs [clientId]   (default: jubileeinspire)
//
// Output goes to STDOUT only — pipe/redirect it yourself; nothing is written to
// disk. Secrets are hex so they never contain the , : | that SERVICE_CLIENTS
// uses as delimiters. Re-run to rotate (see notes the script prints).
import crypto from 'node:crypto';

const clientId = (process.argv[2] || 'jubileeinspire').trim();
const jwtSecret = crypto.randomBytes(32).toString('hex');     // 256-bit HS256 signing key
const clientSecret = crypto.randomBytes(32).toString('hex');  // this client's credential
const scopes = 'admin.set_password|admin.provision';

process.stdout.write(`# ===== JubileePraise service auth — generated ${new Date().toISOString()} =====
# Paste into the PROD .env (/var/www/jubileepraise.com/.env), then: pm2 restart jubileepraise-api
SERVICE_JWT_SECRET=${jwtSecret}
SERVICE_JWT_ISSUER=https://api.jubileepraise.com
SERVICE_JWT_AUDIENCE=jubileepraise-admin
SERVICE_TOKEN_TTL_SEC=600
SERVICE_CLIENTS=${clientId}:${clientSecret}:${scopes}

# ----- Give JubileeInspire ONLY these (in JI's env). Never share SERVICE_JWT_SECRET. -----
# JUBILEEPRAISE_API_BASE=https://api.jubileepraise.com
# JUBILEEPRAISE_CLIENT_ID=${clientId}
# JUBILEEPRAISE_CLIENT_SECRET=${clientSecret}
#
# Rotate a client secret: re-run this, update SERVICE_CLIENTS + JI's env, restart.
# Rotate the signing key: replace SERVICE_JWT_SECRET + restart (in-flight tokens
#   die immediately; TTL is only ${600}s so impact is brief).
`);
