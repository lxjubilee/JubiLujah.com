-- ============================================================================
-- identity.service_idempotency — replay cache for authenticated server-to-server
-- endpoints (currently POST /api/auth/admin/set-password, the cross-platform
-- password sync from JubileeInspire).
--
-- Keyed by the caller-supplied Idempotency-Key. A replay within the retention
-- window (~24h) returns the original status + body WITHOUT re-applying the
-- operation. Stores only the (non-sensitive) response — never the request body /
-- password. Old rows can be pruned by a periodic job; the app also ignores rows
-- older than the window at lookup time.
-- ============================================================================
CREATE TABLE IF NOT EXISTS identity.service_idempotency (
    idempotency_key TEXT         PRIMARY KEY,
    endpoint        TEXT         NOT NULL,
    status_code     INTEGER      NOT NULL,
    response_body   JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_idempotency_created
    ON identity.service_idempotency (created_at);
COMMENT ON TABLE identity.service_idempotency IS
    'Replay cache for authenticated server-to-server endpoints (e.g. admin set-password). ~24h retention; stores no request data.';
