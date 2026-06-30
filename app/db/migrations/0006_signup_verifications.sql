-- ============================================================================
-- identity.signup_verifications — pending (not-yet-created) account signups.
--
-- Two-phase sign-up: phase 1 stores the entered details + password hash + a
-- 6-digit email OTP here (NO identity.users row yet); phase 2 verifies the OTP
-- and only THEN creates the real account. So an unverified email never results
-- in an account. Short-lived; rows are spent (used_at) once the account is made.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity.signup_verifications (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    verification_guid UUID         NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    email             CITEXT       NOT NULL,
    display_name      TEXT         NOT NULL,
    password_hash     TEXT         NOT NULL,          -- scrypt; never the raw password
    code              VARCHAR(6)   NOT NULL,
    attempts          INTEGER      NOT NULL DEFAULT 0,
    max_attempts      INTEGER      NOT NULL DEFAULT 5,
    resend_count      INTEGER      NOT NULL DEFAULT 0,
    last_resend_at    TIMESTAMPTZ,
    expires_at        TIMESTAMPTZ  NOT NULL,
    verified_at       TIMESTAMPTZ,
    used_at           TIMESTAMPTZ,                     -- set when the account is created
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signup_verif_guid    ON identity.signup_verifications (verification_guid);
CREATE INDEX IF NOT EXISTS idx_signup_verif_email   ON identity.signup_verifications (email);
CREATE INDEX IF NOT EXISTS idx_signup_verif_expires ON identity.signup_verifications (expires_at);
COMMENT ON TABLE identity.signup_verifications IS
    'Pending email-OTP sign-ups. The account is created only after the code is verified.';
