-- ============================================================================
-- identity.password_resets — single-use, time-boxed password reset tokens.
--
-- Only the SHA-256 hash (hex) of the raw token is stored; the raw token travels
-- ONLY in the emailed reset link. `used_at` enforces single-use. Powers the
-- forgot-password / reset-password flow on jubilujah.com (and any sibling site
-- sharing this identity store). Change-password needs no table.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity.password_resets (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash   TEXT         NOT NULL UNIQUE,        -- SHA-256(raw token), hex
    expires_at   TIMESTAMPTZ  NOT NULL,               -- now() + ~60 min (set in app)
    used_at      TIMESTAMPTZ,                          -- NULL until redeemed (single-use)
    request_ip   INET,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user
    ON identity.password_resets (user_id, created_at DESC);
-- Fast lookup of still-unredeemed tokens at redemption time.
CREATE INDEX IF NOT EXISTS idx_password_resets_active
    ON identity.password_resets (token_hash)
    WHERE used_at IS NULL;
COMMENT ON TABLE identity.password_resets IS
    'Single-use, ~60min password reset tokens. Stores SHA-256 hash only; raw token only in the email link.';
