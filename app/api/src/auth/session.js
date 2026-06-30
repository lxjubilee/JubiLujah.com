import { query, withTransaction } from '../db.js';
import { config, ROLE_ORDER } from '../config.js';
import { generateAccessToken, generateRefreshToken, verifyToken, hashToken } from './token.js';

// Pick the strongest role (highest ROLE_ORDER index) for the single-string `role`
// claim, mirroring JubileeInspire's token shape. The full set rides in `roles`.
function highestRole(roles) {
  let best = 'viewer', bestIdx = -1;
  for (const r of roles || []) {
    const i = ROLE_ORDER.indexOf(r);
    if (i > bestIdx) { bestIdx = i; best = r; }
  }
  return best;
}

// Load a user + their roles by id. Returns the row (with a `roles` text[]) or null
// when the user is missing or inactive — the gate JI's auth middleware applies.
async function loadUserWithRoles(userId) {
  const r = await query(
    `SELECT u.id, u.email, u.display_name, u.is_active,
            COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM identity.users u
       LEFT JOIN identity.user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1
      GROUP BY u.id`,
    [userId]
  );
  if (r.rowCount === 0 || !r.rows[0].is_active) return null;
  return r.rows[0];
}

// ----------------------------------------------------------------------------
// Hard-delete a user account and everything that must go with it. Shared by the
// self-service DELETE /api/auth/account flow and the admin DELETE
// /api/admin/users/:id flow so the teardown stays in lockstep. Must run inside a
// transaction (pass the `client`). User-generated content with non-cascading FKs
// is removed; append-only / nullable references are de-linked (SET NULL); then
// the user row is deleted, cascading credentials, roles, sessions, security
// settings, login verifications, password resets, playlists, subscriptions, etc.
// ----------------------------------------------------------------------------
export async function purgeUserAccount(client, userId, email) {
  await client.query('DELETE FROM production.ratings WHERE rater_user_id = $1', [userId]);
  await client.query('DELETE FROM production.comments WHERE author_user_id = $1', [userId]);
  await client.query('DELETE FROM production.nominations WHERE nominator_id = $1', [userId]);
  await client.query('UPDATE identity.audit_log SET actor_user_id = NULL WHERE actor_user_id = $1', [userId]);
  await client.query('UPDATE production.pipeline_state SET assignee_user_id = NULL WHERE assignee_user_id = $1', [userId]);
  await client.query('UPDATE catalog.assets SET uploaded_by = NULL WHERE uploaded_by = $1', [userId]);
  await client.query('DELETE FROM identity.users WHERE id = $1', [userId]);
  if (email) await client.query('DELETE FROM identity.signup_verifications WHERE email = $1', [email]);
}

// ----------------------------------------------------------------------------
// Upsert a user that JubileeInspire just authenticated (loginMode === 'ji').
// Keys on EMAIL (the shared cross-platform
// identifier) instead of external_subject: identity.users.email is UNIQUE, so a
// JI login for an address that already has a local Jubilujah-native row (e.g. an
// old `jubilujah|<email>` signup) must update that row, not insert a colliding
// one. external_subject is set only on first insert and left intact thereafter.
// ----------------------------------------------------------------------------
const JI_ROLE_MAP = { user: 'content_editor', admin: 'admin', guest: 'viewer' };
// Roles JubileeInspire is authoritative over (the values JI_ROLE_MAP can mint).
// JI re-sync only grants/revokes within this set, so Jubilujah-native grants
// (e.g. `reviewer`, pipeline roles) survive an SSO login instead of being wiped.
const JI_MANAGED_ROLES = new Set(Object.values(JI_ROLE_MAP));

export async function upsertUserFromJI(jiUser) {
  const email = jiUser?.email;
  if (!email) throw new Error('JI login response missing email');
  const sub = `jubileeinspire|${jiUser.id}`;
  const name =
    jiUser.displayName ||
    [jiUser.firstName, jiUser.lastName].filter(Boolean).join(' ').trim() ||
    email;
  const role = JI_ROLE_MAP[jiUser.role] || 'viewer';
  const want = new Set([role]);
  const firstName = (jiUser.firstName || '').trim() || null;
  const lastName = (jiUser.lastName || '').trim() || null;

  return withTransaction(async (client) => {
    // First sign-in seeds display_name + first/last from JI. On return logins we
    // deliberately do NOT overwrite the name fields, so an admin's edit on
    // /admin/users sticks (names are locally authoritative once the row exists).
    // Only liveness (last_login_at / is_active) is refreshed.
    const up = await client.query(
      `INSERT INTO identity.users (external_subject, email, display_name, first_name, last_name, last_login_at, first_signin_completed)
         VALUES ($1, $2, $3, $4, $5, NOW(), TRUE)
       ON CONFLICT (email) DO UPDATE
         SET last_login_at = NOW(),
             is_active = TRUE
       RETURNING id, external_subject, email, display_name`,
      [sub, email, name, firstName, lastName]
    );
    const user = up.rows[0];

    // JI is the role authority: sync to exactly the mapped role (grant + revoke).
    const existing = await client.query('SELECT role FROM identity.user_roles WHERE user_id = $1', [user.id]);
    const have = new Set(existing.rows.map((r) => r.role));
    for (const r of want) {
      if (!have.has(r)) {
        await client.query(
          `INSERT INTO identity.user_roles (user_id, role, granted_by) VALUES ($1, $2, $1) ON CONFLICT DO NOTHING`,
          [user.id, r]
        );
        await client.query(
          `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
             VALUES ($1, 'role.grant', 'user', $2, $3)`,
          [user.id, user.id, JSON.stringify({ role: r, source: 'ji_login' })]
        );
      }
    }
    for (const r of have) {
      // Only revoke roles JI manages — leave Jubilujah-native grants intact.
      if (!want.has(r) && JI_MANAGED_ROLES.has(r)) {
        await client.query('DELETE FROM identity.user_roles WHERE user_id = $1 AND role = $2', [user.id, r]);
        await client.query(
          `INSERT INTO identity.audit_log (actor_user_id, action, target_type, target_id, payload)
             VALUES ($1, 'role.revoke', 'user', $2, $3)`,
          [user.id, user.id, JSON.stringify({ role: r, source: 'ji_login' })]
        );
      }
    }

    return { user, roles: [...want] };
  });
}

// ----------------------------------------------------------------------------
// User access tokens — JubileeInspire-format tokens (see auth/token.js):
// `base64url(JSON).base64url(HMAC-SHA256)` signed with the shared JWT_SECRET,
// carrying { userId, email, displayName, role, roles, type:'access', exp(ms),
// iat(ms), jti }. Verification re-checks the signature + exp AND loads the user
// from the DB (enforcing is_active), exactly like JI's auth middleware — so a
// role change or deactivation takes effect on the very next request, and durable
// revocation is via the DB-backed refresh token.
// ----------------------------------------------------------------------------

// Mint an access token for a user. Loads current email/display_name/roles and
// embeds them. Throws if the user is missing or inactive.
export async function issueAccessToken({ userId }) {
  const u = await loadUserWithRoles(userId);
  if (!u) throw new Error('cannot issue access token for a missing or inactive user');
  const { token, expiresAt } = generateAccessToken({
    userId: u.id,
    email: u.email,
    displayName: u.display_name,
    role: highestRole(u.roles),   // single-string role, JI-compatible
    roles: u.roles,               // full RBAC set, for Jubilujah's requireRole
  });
  return { token, expiresAt };
}

// Verify a presented access token -> { user, roles } or null. Checks the
// signature + exp + type, then resolves the user from the DB (is_active gate).
export async function verifyAccessToken(token) {
  const payload = verifyToken(token, 'access');
  if (!payload?.userId) return null;
  const u = await loadUserWithRoles(payload.userId);
  if (!u) return null;
  return { user: { id: u.id, email: u.email, displayName: u.display_name }, roles: u.roles };
}

// ----------------------------------------------------------------------------
// Refresh tokens. JI-format signed token (type:'refresh'); the hash is stored in
// identity.refresh_tokens so it stays revocable. Redeemed at /api/auth/refresh.
// `extended` selects the 1-year "keep me signed in" lifetime (JI parity).
// ----------------------------------------------------------------------------

export async function createRefreshToken({ userId, extended = false }) {
  const { token, hash, expiresAt } = generateRefreshToken({ userId }, { extended });
  await query(
    `INSERT INTO identity.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );
  return { token, expiresAt };
}

// Redeem a refresh token: verify the signature/exp/type, then look it up in the
// DB (not revoked/expired, user active) and SLIDE its expiry forward so an active
// session stays alive. Does NOT rotate the token, so concurrent redemptions from
// multiple tabs/devices all succeed. Returns { userId } or null.
export async function redeemRefreshToken(rawToken) {
  if (!rawToken) return null;
  const payload = verifyToken(rawToken, 'refresh');
  if (!payload?.userId) return null;
  return withTransaction(async (client) => {
    const r = await client.query(
      `SELECT rt.id, rt.user_id, u.is_active
         FROM identity.refresh_tokens rt
         JOIN identity.users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
          AND rt.revoked_at IS NULL
          AND rt.expires_at > NOW()
        FOR UPDATE OF rt`,
      [hashToken(rawToken)]
    );
    if (r.rowCount === 0 || !r.rows[0].is_active) return null;
    const expiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 3600 * 1000);
    await client.query('UPDATE identity.refresh_tokens SET expires_at = $2 WHERE id = $1', [r.rows[0].id, expiresAt]);
    return { userId: r.rows[0].user_id };
  });
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await query('UPDATE identity.refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(rawToken)]);
}

// Revoke all of a user's live refresh tokens (password reset/change, logout-all).
// With { exceptToken } the caller's current refresh token is kept alive.
export async function revokeAllRefreshTokens(userId, { exceptToken } = {}) {
  if (exceptToken) {
    await query(
      `UPDATE identity.refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL AND token_hash <> $2`,
      [userId, hashToken(exceptToken)]
    );
  } else {
    await query(
      `UPDATE identity.refresh_tokens SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }
}

// NOTE: access tokens are now stateless JWTs (see issueAccessToken), so there is
// no per-session revocation. Logging out / changing a password revokes the
// DB-backed REFRESH tokens (revokeRefreshToken / revokeAllRefreshTokens) so no
// new access token can be minted; outstanding access JWTs lapse at their TTL.
