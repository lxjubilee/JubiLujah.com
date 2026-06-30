-- ============================================================================
-- identity.credentials — email/password credentials for the SHARED identity
-- store, enabling form-based sign up / sign in on jubilujah.com (and any sibling
-- site, e.g. jubileeinspire.com) against the same identity.users rows.
--
-- Passwords are stored as scrypt hashes (salt embedded), never plaintext. SSO
-- users (OIDC) may have no credential row; password users may later also use SSO
-- since both resolve to the same identity.users row by email.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity.credentials (
    user_id        UUID         PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    password_hash  TEXT         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE identity.credentials IS
    'Scrypt email/password credentials for the shared identity store. One per user (optional).';

CREATE TRIGGER trg_credentials_touch
    BEFORE UPDATE ON identity.credentials
    FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
