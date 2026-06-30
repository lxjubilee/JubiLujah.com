-- ============================================================================
-- 0008_refresh_tokens.sql
-- Long-lived refresh tokens for Bearer clients (web localStorage + native/mobile).
-- The access credential stays the opaque identity.sessions token (short-to-medium
-- lived); a refresh token is redeemed at POST /api/auth/refresh to mint a fresh
-- access session WITHOUT re-entering credentials. Only the SHA-256 hash is stored,
-- never the raw token. Non-rotating with a SLIDING expiry: each redemption pushes
-- expires_at forward, so an active session persists until explicit logout (revoke)
-- or idle past the TTL. Idempotent; the runner wraps this file in one transaction.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity.refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash  TEXT         NOT NULL UNIQUE,   -- SHA-256 of the opaque refresh token
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Partial index for the hot path: a user's live (unrevoked) refresh tokens.
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active
    ON identity.refresh_tokens (user_id)
    WHERE revoked_at IS NULL;

COMMENT ON TABLE identity.refresh_tokens IS
    'Long-lived refresh tokens (hash only). Redeemed at /api/auth/refresh; rotated each use.';
