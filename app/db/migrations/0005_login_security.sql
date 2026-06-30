-- ============================================================================
-- 0005_login_security.sql
-- Sign-in hardening for jubilujah.com: a one-time first-sign-in email OTP gate,
-- login lockout, the OTP challenge store, and a per-user 2FA toggle. Adapts the
-- JubileeInspire reference to this identity schema. Idempotent; the migration
-- runner wraps this file in a single transaction.
-- ============================================================================

-- --- identity.users: one-time first-signin gate + lockout window ------------
ALTER TABLE identity.users
    ADD COLUMN IF NOT EXISTS first_signin_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE identity.users
    ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Grandfather every EXISTING account so only NEW signups are challenged with the
-- one-time OTP on their next sign-in. (New rows default FALSE.)
UPDATE identity.users SET first_signin_completed = TRUE
 WHERE first_signin_completed = FALSE;

COMMENT ON COLUMN identity.users.first_signin_completed IS
    'TRUE once the account has passed its one-time email OTP gate on /signin.';
COMMENT ON COLUMN identity.users.locked_until IS
    'When set and in the future, /signin is blocked (423) until this time.';

-- Sparse: only locked rows matter.
CREATE INDEX IF NOT EXISTS idx_users_locked_until
    ON identity.users (locked_until)
    WHERE locked_until IS NOT NULL;

-- --- identity.login_verifications: pending OTP challenges --------------------
CREATE TABLE IF NOT EXISTS identity.login_verifications (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_guid UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    user_id           UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    code              VARCHAR(6)   NOT NULL,
    attempts          INTEGER      NOT NULL DEFAULT 0,
    max_attempts      INTEGER      NOT NULL DEFAULT 5,
    resend_count      INTEGER      NOT NULL DEFAULT 0,   -- cap 2 => 3 codes total then lockout
    last_resend_at    TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ  NOT NULL,
    verified_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_verif_guid    ON identity.login_verifications (verification_guid);
CREATE INDEX IF NOT EXISTS idx_login_verif_user    ON identity.login_verifications (user_id);
CREATE INDEX IF NOT EXISTS idx_login_verif_expires ON identity.login_verifications (expires_at);
COMMENT ON TABLE identity.login_verifications IS
    'Pending email OTP challenges for login 2FA / first-signin gate. Short-lived.';

-- --- identity.user_security_settings: 2FA toggle (room to grow) -------------
CREATE TABLE IF NOT EXISTS identity.user_security_settings (
    user_id            UUID         PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    two_factor_enabled BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE identity.user_security_settings IS
    'Per-user security prefs. two_factor_enabled forces an OTP on EVERY signin.';

-- updated_at touch (reuses production.touch_updated_at from 0001); guarded so a
-- re-run does not error on a duplicate trigger.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_security_touch') THEN
        CREATE TRIGGER trg_user_security_touch
            BEFORE UPDATE ON identity.user_security_settings
            FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
    END IF;
END$$;
