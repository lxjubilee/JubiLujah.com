import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { logger } from './logger.js';
import { healthCheck } from './db.js';
import { attachSession } from './middleware/session.js';
import { notFound, errorHandler } from './middleware/error.js';

import authRouter from './routes/auth.js';
import catalogRouter from './routes/catalog.js';
import ratingsRouter from './routes/ratings.js';
import commentsRouter from './routes/comments.js';
import reviewsRouter from './routes/reviews.js';
import reviewsAdminRouter from './routes/reviewsAdmin.js';
import analyticsRouter from './routes/analytics.js';
import awardsRouter from './routes/awards.js';
import pipelineRouter from './routes/pipeline.js';
import radioRouter from './routes/radio.js';
import meRouter from './routes/me.js';
import adminRouter from './routes/admin.js';
import serviceRouter from './routes/service.js';
import serviceTokenRouter from './routes/serviceToken.js';
import subscriptionsRouter from './routes/subscriptions.js';
import subscriptionsWebhookRouter from './routes/subscriptionsWebhook.js';
import listeningRouter from './routes/listening.js';
import musicAdminRouter from './routes/music.js';
import publishRouter from './routes/publish.js';
import tracksRouter from './routes/tracks.js';
import { serviceRateKey } from './middleware/serviceAuth.js';
import { startMusicScheduler } from './services/musicScheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);

// ---- Observability: structured logs + correlation id -----------------------
app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (req, res, err) => (res.statusCode >= 500 || err ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
}));

// ---- Security headers + CORS ------------------------------------------------
app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin / curl (no origin) and whitelisted browser origins.
    if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: true,
}));

// Gateway webhook MUST see the raw, unparsed body to verify the signature, so it
// is mounted with express.raw BEFORE the global JSON parser. (No session needed.)
// `/api/billing/webhook` is the configured Stripe endpoint; the legacy
// `/api/subscriptions/webhook` path is kept as an alias for back-compat.
app.use(
  ['/api/billing/webhook', '/api/subscriptions/webhook'],
  express.raw({ type: '*/*' }),
  subscriptionsWebhookRouter,
);

app.use(express.json({ limit: '256kb' }));
app.use(attachSession);       // resolves req.auth from the Bearer access JWT (no cookies)

// ---- Rate limits ------------------------------------------------------------
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD',
});
// Separate, more permissive limiter for authenticated server-to-server callers,
// keyed per-token (not IP). Independent of the public /api/auth/* limiter.
const serviceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: config.service.rateLimitMax,
  standardHeaders: true, legacyHeaders: false, keyGenerator: serviceRateKey,
});

// ---- Health + OpenAPI -------------------------------------------------------
app.get('/health', async (req, res) => {
  const db = await healthCheck();
  res.status(db ? 200 : 503).json({ status: db ? 'healthy' : 'degraded', db, service: 'jubilujah-api' });
});

app.get('/api/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

// ---- Server-to-server admin routes -----------------------------------------
// Client-credentials JWT bearer auth with their own per-client limiter.
// `/api/auth/service/token` issues the JWT (client-credentials); `/api/auth/admin/*`
// consumes it. See routes/serviceToken.js + routes/service.js.
app.use('/api/auth/service', serviceLimiter, serviceTokenRouter);
app.use('/api/auth/admin', serviceLimiter, serviceRouter);

// NOTE: no CSRF guard — auth is purely a stateless `Authorization: Bearer <JWT>`
// (no ambient session cookie), so cross-site requests carry no usable credential.

// ---- Routes -----------------------------------------------------------------
app.use('/api/auth', authLimiter, authRouter);
app.use('/api', catalogRouter);                  // public catalog (manifest-backed)
app.use('/api/ratings', writeLimiter, ratingsRouter);
app.use('/api/comments', writeLimiter, commentsRouter);
// Public Rating & Review module. /api/admin/reviews is mounted BEFORE the
// generic /api/admin router so its admin-only moderation routes win.
app.use('/api/admin/reviews', writeLimiter, reviewsAdminRouter);
app.use('/api/reviews', writeLimiter, reviewsRouter);
// Media analytics: POST /play (any listener) + admin-only dashboard reads.
app.use('/api/analytics', writeLimiter, analyticsRouter);
app.use('/api/awards', writeLimiter, awardsRouter);
app.use('/api/pipeline', writeLimiter, pipelineRouter);
app.use('/api', writeLimiter, radioRouter);      // /stations /programs /playlists
app.use('/api/me', writeLimiter, meRouter);      // personal user playlists (requireAuth)
// Subscriptions: plan catalog, checkout, lifecycle, billing history + the Free-
// plan listening quota. (The signed gateway webhook is mounted above, pre-JSON.)
app.use('/api/subscriptions', writeLimiter, subscriptionsRouter);
app.use('/api/listening', writeLimiter, listeningRouter);
// Manage Music admin module (CDN sync, publish/hide, validation). Mounted BEFORE
// the generic /api/admin router so its routes resolve first.
app.use('/api/admin/music', writeLimiter, musicAdminRouter);
app.use('/api/admin/publish', writeLimiter, publishRouter);
app.use('/api/admin/tracks', writeLimiter, tracksRouter);
app.use('/api/admin', writeLimiter, adminRouter);

// ---- 404 + error handler ----------------------------------------------------
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env, loginMode: config.loginMode }, 'Jubilujah API listening');
  // Warm the catalog manifest cache.
  import('./manifest.js').then((m) => m.getManifest()).catch(() => {});
  // Manage Music scheduled CDN sync (opt-in via MUSIC_SYNC_SCHEDULER=on).
  startMusicScheduler();
});

export default app;
