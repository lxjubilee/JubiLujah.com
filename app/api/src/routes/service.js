import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { HttpError } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { requireServiceAuth, requireServiceScope } from '../middleware/serviceAuth.js';
import { query, withTransaction } from '../db.js';
import { hashPassword } from '../auth/password.js';
import { revokeAllRefreshTokens } from '../auth/session.js';
import { logger } from '../logger.js';

// ============================================================================
// Server-to-server admin routes (mounted at /api/auth/admin). Auth is a
// client-credentials HS256 JWT obtained from /api/auth/service/token (see
// middleware/serviceAuth.js + auth/serviceToken.js) — no OTP, Turnstile, or user
// session. Each route also requires a scope. See the requirement doc and
// AUTH_API.md §11.4 ("admin/set-password").
// ============================================================================

const router = Router();

const IDEMPOTENCY_TTL = '24 hours'; // constant, not user input — safe to interpolate

// Best-effort audit row. An audit failure must never change the API outcome.
async function audit(actorUserId, action, payload) {
  try {
    await query(
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, $2, 'user', $3, $4)`,
      [actorUserId, action, actorUserId, JSON.stringify(payload || {})]
    );
  } catch (err) {
    logger.error({ err, action }, 'service audit insert failed');
  }
}

// Idempotency cache — degrades to "no cache" on any error so a missing table or a
// transient DB issue can never break the core operation (which is itself
// naturally idempotent).
async function getIdempotent(key) {
  if (!key) return null;
  try {
    const r = await query(
      `SELECT status_code, response_body
         FROM identity.service_idempotency
        WHERE idempotency_key = $1
          AND created_at > NOW() - INTERVAL '${IDEMPOTENCY_TTL}'`,
      [key]
    );
    return r.rowCount ? { status: r.rows[0].status_code, body: r.rows[0].response_body } : null;
  } catch (err) {
    logger.warn({ err }, 'idempotency lookup failed; proceeding without replay protection');
    return null;
  }
}
async function putIdempotent(key, endpoint, status, body) {
  if (!key) return;
  try {
    await query(
      `INSERT INTO identity.service_idempotency (idempotency_key, endpoint, status_code, response_body)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO UPDATE
         SET status_code = EXCLUDED.status_code,
             response_body = EXCLUDED.response_body,
             created_at = NOW()
       WHERE identity.service_idempotency.created_at <= NOW() - INTERVAL '${IDEMPOTENCY_TTL}'`,
      [key, endpoint, status, JSON.stringify(body)]
    );
  } catch (err) {
    logger.warn({ err }, 'idempotency store failed');
  }
}

// JubileeInspire role enum (user/admin/guest) -> Jubilujah RBAC role. 'user' maps
// to content_editor for parity with self-serve signups (DEFAULT_SIGNUP_ROLE).
const ROLE_MAP = { user: 'content_editor', admin: 'admin', guest: 'viewer' };

// Whole years between an ISO YYYY-MM-DD date of birth and today (UTC). Returns
// null for an invalid/unreal date. Used for the >=13 age gate.
function ageInYears(dob) {
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

// ---- POST /api/auth/admin/set-password -------------------------------------
// Set an EXISTING account's password on behalf of a trusted partner service.
// `newPassword` is validated for presence/type here (400 on miss) and for policy
// length below (422), to keep the two distinct per the contract.
const setPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
  newPassword: z.string(),
});
router.post('/set-password', requireServiceAuth, requireServiceScope('admin.set_password'), validate(setPasswordSchema), ah(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const { newPassword } = req.body;
  const idemKey = (req.get('idempotency-key') || '').trim() || null;
  const caller = req.serviceCaller || {};

  // Password policy -> 422 (distinct from missing/malformed -> 400 via validate()).
  if (newPassword.length < 8 || newPassword.length > 200) {
    throw new HttpError(422, 'Password must be 8–200 characters.');
  }

  // Idempotent replay: return the original result without re-applying.
  const cached = await getIdempotent(idemKey);
  if (cached) {
    logger.info({ idemKey, clientId: caller.clientId }, 'set-password idempotent replay');
    return res.status(cached.status).json(cached.body);
  }

  // Resolve the account + whether it is password-capable (has a credential row).
  const r = await query(
    `SELECT u.id, (c.user_id IS NOT NULL) AS has_credential
       FROM identity.users u
  LEFT JOIN identity.credentials c ON c.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [email]
  );
  if (!r.rowCount) {
    await audit(null, 'password.admin_set_failed', { reason: 'not_found', email, caller, ip: req.ip, idemKey });
    throw new HttpError(404, 'No active account exists for that email.');
  }
  const { id: userId, has_credential } = r.rows[0];
  if (!has_credential) {
    await audit(userId, 'password.admin_set_failed', { reason: 'no_credential', caller, ip: req.ip, idemKey });
    throw new HttpError(409, 'Account is not password-capable (SSO-only; no local password).');
  }

  // Apply atomically: set credential, burn outstanding reset tokens, clear lockout, audit.
  await withTransaction(async (client) => {
    await client.query('UPDATE identity.credentials SET password_hash = $2 WHERE user_id = $1', [userId, hashPassword(newPassword)]);
    await client.query('UPDATE identity.password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await client.query('UPDATE identity.users SET locked_until = NULL WHERE id = $1', [userId]);
    await client.query(
      // actor_user_id ($1, uuid) and target_id ($3, text) take separate params so
      // Postgres doesn't try to deduce one type for a value used as both (42P08).
      `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
         VALUES ($1, 'password.admin_set', 'user', $2, $3)`,
      [userId, userId, JSON.stringify({ via: 'service', caller, ip: req.ip, idempotencyKey: idemKey })]
    );
  });
  // A credential change revokes every refresh token (all devices must re-login;
  // outstanding stateless access JWTs lapse at their TTL).
  await revokeAllRefreshTokens(userId);

  const body = { ok: true };
  await putIdempotent(idemKey, '/api/auth/admin/set-password', 200, body);
  logger.info({ userId, clientId: caller.clientId, idemKey }, 'service set-password applied');
  res.status(200).json(body);
}));

// ---- POST /api/auth/admin/provision-user -----------------------------------
// Create an account directly (no signup OTP) for a trusted partner service
// (cross-platform sync). Maps the JubileeInspire user shape onto Jubilujah's
// identity schema (users + credentials + user_roles). Create-only: an existing
// email returns 409 (a non-error to the caller; password is NOT changed — use
// set-password for that). See AUTH_API.md §12.
const provisionSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string(),                                   // length checked below -> 422
  firstName: z.string().trim().max(50).optional(),
  lastName: z.string().trim().max(50).optional(),
  displayName: z.string().trim().max(100).optional(),
  role: z.enum(['user', 'admin', 'guest']).optional(),
  emailVerified: z.boolean().optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourcePlatform: z.string().trim().max(32).optional(),
});
router.post('/provision-user', requireServiceAuth, requireServiceScope('admin.provision'), validate(provisionSchema), ah(async (req, res) => {
  const b = req.body;
  const email = b.email.toLowerCase();
  const idemKey = (req.get('idempotency-key') || '').trim() || null;
  const caller = req.serviceCaller || {};
  const EP = '/api/auth/admin/provision-user';

  // Policy -> 422 (distinct from missing/malformed -> 400 via validate()).
  if (b.password.length < 8 || b.password.length > 200) {
    throw new HttpError(422, 'Password must be 8–200 characters.');
  }
  // Age gate (>=13). Jubilujah has no DOB column, so the date is validated/gated
  // but not persisted.
  if (b.dateOfBirth) {
    const age = ageInYears(b.dateOfBirth);
    if (age === null) throw new HttpError(422, 'Invalid date of birth.');
    if (age < 13) throw new HttpError(422, 'User must be at least 13 years old.');
  }

  // Idempotent replay.
  const cached = await getIdempotent(idemKey);
  if (cached) {
    logger.info({ idemKey, clientId: caller.clientId }, 'provision-user idempotent replay');
    return res.status(cached.status).json(cached.body);
  }

  // Derive a non-empty display_name (NOT NULL column).
  const displayName = (
    b.displayName
    || [b.firstName, b.lastName].filter(Boolean).join(' ').trim()
    || email.split('@')[0]
  ).slice(0, 200);
  const jubiRole = ROLE_MAP[b.role || 'user'];
  const sourcePlatform = (b.sourcePlatform || 'jubileeinspire').slice(0, 32);
  const externalSubject = `${sourcePlatform}|${email}`;
  // emailVerified from a trusted origin clears the first-sign-in OTP gate.
  const firstSigninCompleted = b.emailVerified === true;

  // Create-only: an existing email is an idempotent "already exists" (409).
  const existing = await query('SELECT 1 FROM identity.users WHERE email = $1', [email]);
  if (existing.rowCount) {
    await audit(null, 'account.provision_conflict', { email, caller, ip: req.ip, idemKey });
    const body = { error: 'conflict', message: 'An account with this email already exists.' };
    await putIdempotent(idemKey, EP, 409, body);
    return res.status(409).json(body);
  }

  let created;
  try {
    created = await withTransaction(async (client) => {
      const u = await client.query(
        `INSERT INTO identity.users
           (external_subject, email, display_name, is_active, first_signin_completed, last_login_at)
         VALUES ($1, $2, $3, TRUE, $4, NULL)
         RETURNING id, email, display_name`,
        [externalSubject, email, displayName, firstSigninCompleted]
      );
      const userId = u.rows[0].id;
      await client.query('INSERT INTO identity.credentials (user_id, password_hash) VALUES ($1, $2)', [userId, hashPassword(b.password)]);
      await client.query(
        'INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING',
        [userId, jubiRole]
      );
      await client.query(
        `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
           VALUES ($1, 'account.provisioned', 'user', $2, $3)`,
        [userId, userId, JSON.stringify({ via: 'service', caller, ip: req.ip, sourcePlatform, role: jubiRole, emailVerified: firstSigninCompleted, idempotencyKey: idemKey })]
      );
      return u.rows[0];
    });
  } catch (err) {
    // Lost the race (email/external_subject created between the check and insert).
    if (err && err.code === '23505') {
      const body = { error: 'conflict', message: 'An account with this email already exists.' };
      await putIdempotent(idemKey, EP, 409, body);
      return res.status(409).json(body);
    }
    throw err;
  }

  const body = {
    user: {
      id: created.id,
      email: created.email,
      displayName: created.display_name,
      role: jubiRole,                 // Jubilujah RBAC role (mapped from the JI role)
      emailVerified: firstSigninCompleted,
    },
  };
  await putIdempotent(idemKey, EP, 201, body);
  logger.info({ userId: created.id, clientId: caller.clientId, role: jubiRole, idemKey }, 'service provision-user created');
  res.status(201).json(body);
}));

export default router;
