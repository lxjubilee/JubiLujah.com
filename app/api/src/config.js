import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load the monorepo root .env (../../.env relative to src/).
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Parse the SERVICE_CLIENTS registry: "id:secret:scopeA|scopeB , id2:secret2".
// Entries split on ",", fields on ":", scopes on "|". A missing scope field means
// all scopes ("*"). Entries without both an id and a secret are dropped.
function parseServiceClients(raw) {
  return String(raw)
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((entry) => {
      const [id, secret, scopeStr] = entry.split(':');
      const scopes = (scopeStr || '*').split('|').map((x) => x.trim()).filter(Boolean);
      return { id: (id || '').trim(), secret: (secret || '').trim(), scopes };
    })
    .filter((c) => c.id && c.secret);
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.API_PORT || 4000),

  // Where the email/password sign-in is authenticated.
  //   'local' (default) — verify against identity.credentials in our own DB
  //                        (the dev / localhost behavior).
  //   'ji'              — delegate to JubileeInspire's POST /api/auth/login
  //                        (production): JI is the credential authority, we just
  //                        upsert the returned user locally + mint our own session.
  // Gated on an explicit env var (not NODE_ENV) so each mode is testable anywhere.
  loginMode: (process.env.AUTH_LOGIN_MODE || 'local').toLowerCase() === 'ji' ? 'ji' : 'local',

  databaseUrl: required('DATABASE_URL', 'postgres://jubilee:jubilee_dev_pw@localhost:5432/jubilujah'),

  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',').map((s) => s.trim()).filter(Boolean),

  sessionSecret: required('SESSION_SECRET', 'dev-only-change-me-please-32-bytes-min'),
  // Refresh-token lifetime (days) for the DB-backed refresh token row.
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 30),

  // User access/refresh tokens. Format is IDENTICAL to JubileeInspire's
  // (api/services/crypto.js): `base64url(JSON) . base64url(HMAC-SHA256)` — a 2-part
  // hand-rolled token, NOT a standard JWT — with millisecond exp/iat, a `type`
  // claim, and a random jti. The signing secret is JI's `JWT_SECRET` (falls back to
  // SESSION_SECRET in dev) so the whole SSO ecosystem shares one token scheme. See
  // auth/token.js. Durable revocation is via the DB-backed refresh token.
  token: {
    secret: process.env.JWT_SECRET || process.env.SESSION_SECRET || 'dev-only-change-me-please-32-bytes-min',
    accessTtlMs: Number(process.env.ACCESS_TOKEN_TTL_MS || 60 * 60 * 1000),               // 1h (JI default)
    refreshTtlMs: Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000),    // 30d
    extendedRefreshTtlMs: Number(process.env.EXTENDED_REFRESH_TTL_MS || 365 * 24 * 60 * 60 * 1000), // 1y ("keep me signed in")
  },
  // Cloudflare Turnstile (sign-in CAPTCHA). When `secret` is empty the server
  // skips verification — the dev default, paired with an empty public site key
  // on the web so no widget renders.
  turnstile: {
    siteKey: process.env.TURNSTILE_SITE_KEY || '',
    secret: process.env.TURNSTILE_SECRET_KEY || '',
  },

  // Outbound email (password reset + login OTP). When `sendgridApiKey` is empty
  // the email service falls back to a dev/log transport that just logs the
  // link/code instead of sending — so the flows are testable with no provider.
  email: {
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
    from: process.env.EMAIL_FROM || 'Jubilujah <no-reply@jubilujah.com>',
    resetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MIN || 60),
  },

  // Server-to-server admin/service auth (e.g. cross-platform password sync from
  // JubileeInspire's centralized auth). OAuth2 client-credentials: a trusted
  // partner POSTs its client_id+client_secret to /api/auth/service/token and gets
  // back a short-lived **HS256 JWT**, which it then presents as a Bearer token on
  // /api/auth/admin/*. The same `jwtSecret` both signs (issuance) and verifies
  // (admin routes). When `jwtSecret` is empty the service routes fail closed
  // (issuance => 503, admin routes => 401). Optional IP allow-list (empty =>
  // token-only). See middleware/serviceAuth.js + auth/serviceToken.js.
  service: {
    jwtSecret: process.env.SERVICE_JWT_SECRET || '',
    issuer: process.env.SERVICE_JWT_ISSUER || 'https://api.jubilujah.com',
    audience: process.env.SERVICE_JWT_AUDIENCE || 'jubilujah-admin',
    tokenTtlSec: Number(process.env.SERVICE_TOKEN_TTL_SEC || 600),
    // Registered client credentials. Format (env SERVICE_CLIENTS):
    //   id:secret:scopeA|scopeB , id2:secret2 , ...
    // Clients separated by ",", fields by ":", scopes by "|". Omit the 3rd field
    // for all-scopes ("*"). Secrets must not contain , : | (use hex/base64url).
    clients: parseServiceClients(process.env.SERVICE_CLIENTS || ''),
    allowIps: (process.env.ADMIN_SERVICE_ALLOW_IPS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    rateLimitMax: Number(process.env.ADMIN_SERVICE_RATE_MAX || 600),
  },

  // OUTBOUND cross-platform password sync. When a Jubilujah user changes or resets
  // their password, we push the new password to JubileeInspire so the shared SSO
  // credential stays in lockstep. Jubilujah is the CLIENT here (the mirror image of
  // the inbound `service` block above): it POSTs client_id+client_secret to JI's
  // /api/auth/service/token, then presents the returned Bearer JWT to JI's
  // /api/auth/admin/set-password. Sync is skipped (no-op) when clientSecret is empty.
  jiSync: {
    baseUrl: (process.env.JI_API_BASE || 'https://api.jubileeinspire.com').replace(/\/$/, ''),
    clientId: process.env.JI_SERVICE_CLIENT_ID || '',
    clientSecret: process.env.JI_SERVICE_CLIENT_SECRET || '',
    // Pre-signup /api/auth/check-email sits in the user's synchronous request path
    // (unlike the best-effort password push), so it gets a hard deadline.
    checkEmailTimeoutMs: Number(process.env.JI_CHECK_EMAIL_TIMEOUT_MS || 4000),
  },

  // Inbound credential delegation -> JubileeInspire (the mirror of jiSync's outbound
  // push). Used only when loginMode === 'ji': /api/auth/signin forwards email+password
  // +cfTurnstileToken to JI's /api/auth/login. `source` tags the request so JI knows
  // which platform the login came from. See services/jiLogin.js.
  jiLogin: {
    baseUrl: (process.env.JI_LOGIN_BASE || process.env.JI_API_BASE || 'https://api.jubileeinspire.com').replace(/\/$/, ''),
    source: process.env.JI_LOGIN_SOURCE || 'jubilujah',
  },

  // ---- Subscriptions & billing ---------------------------------------------
  // Provider-agnostic by design (BRD §Billing). `provider` selects the gateway
  // adapter in services/payments/*. In prod this is 'stripe'; locally it falls
  // back to 'mock' when no Stripe secret is configured so the whole subscribe →
  // activate → manage flow is testable end-to-end with no real gateway.
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'mock')).toLowerCase(),
    currency: (process.env.BILLING_CURRENCY || 'usd').toLowerCase(),
    // Where the gateway sends the customer back after hosted checkout.
    successPath: process.env.CHECKOUT_SUCCESS_PATH || '/account/subscription?checkout=success',
    cancelPath: process.env.CHECKOUT_CANCEL_PATH || '/subscription?checkout=cancelled',
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      // Optional: map plan code -> Stripe price id via env, overriding the DB
      // (e.g. STRIPE_PRICE_INDIVIDUAL, STRIPE_PRICE_FAMILY). Empty => use the DB.
      priceIndividual: process.env.STRIPE_PRICE_INDIVIDUAL || '',
      priceFamily: process.env.STRIPE_PRICE_FAMILY || '',
    },
  },

  // Free-plan listening quota. Daily counter resets at local midnight in this tz
  // (BRD: "reset automatically at 12:00 AM based on the configured timezone").
  listening: {
    timezone: process.env.LISTENING_TZ || 'UTC',
  },

  webBaseUrl: process.env.WEB_BASE_URL || 'http://localhost:3000',
  cdnBase: process.env.CDN_BASE || 'https://cdn.jubileeverse.com',

  // Cloudflare R2 (S3-compatible) write access for admin cover uploads. When the
  // keys are empty the upload endpoint fails closed (503). Bucket maps to the CDN
  // host root, so object key = URL path (e.g. music/albums/.../artwork/CODE.png).
  r2: {
    endpoint: process.env.R2_ENDPOINT || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'jubileeverse-cdn',
  },

  // On-demand ISR revalidation of the web after a cover change (so the new ?v=
  // cover shows immediately instead of after the scheduled revalidate window).
  revalidate: {
    secret: process.env.REVALIDATE_SECRET || '',
    webUrl: process.env.WEB_INTERNAL_URL || 'http://127.0.0.1:3000',
  },

  manifestPath: process.env.MANIFEST_PATH
    ? path.resolve(__dirname, '..', '..', process.env.MANIFEST_PATH)
    : path.join(__dirname, '..', '..', 'web', 'public', 'music', 'catalog-manifest.json'),
};

// Valid RBAC roles, ordered weakest -> strongest (index = privilege level).
// Every account carries the baseline `viewer` (view + play) which is never
// removable. The four grantable roles are reviewer, content_editor, executive,
// admin. `reviewer` is an orthogonal, Jubilujah-native capability (preview
// in-production "studio" albums); it sits low on the ladder so it grants no
// pipeline/admin powers via requireRole — studio visibility is an explicit
// membership check. `executive` is the consolidated mid-tier manager role
// (replaces the legacy radio_producer + production_manager; see migration 0017):
// it carries the pipeline-transition and radio-playlist powers below admin.
export const ROLE_ORDER = ['viewer', 'reviewer', 'content_editor', 'executive', 'admin'];
