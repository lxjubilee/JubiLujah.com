-- ============================================================================
-- 0030_redirector_automation.sql — Automation API + idempotency (spec §14, §18).
--
-- Phase 5 of software/redirector.md. Adds the pieces the automation API needs:
--   - per-consumer API keys (X-Redirector-Key), stored hashed & rotatable (§18.3)
--   - an idempotency replay cache so pipeline retries never double-issue (§14.2)
--   - an audit trail for every admin mutation (§18.4)
--   - an approval workflow on aliases: requested -> pending -> approved (§14, §3.5)
-- All per-domain, in the existing `redirector` schema.
-- ============================================================================

-- §18.3 api_keys — automation credentials. The raw key is shown once at mint
-- time and only its SHA-256 is stored. Scoped per consumer so one can be revoked
-- without affecting the others. `key_prefix` (first chars of the raw key) is kept
-- for human identification in the admin UI without revealing the secret.
CREATE TABLE IF NOT EXISTS redirector.api_keys (
    key_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash     CHAR(64)    NOT NULL UNIQUE,        -- sha256(raw key), hex
    key_prefix   VARCHAR(12) NOT NULL,               -- e.g. 'rdk_ab12' for display
    consumer     VARCHAR(32) NOT NULL,               -- pipeline | persona | admin_tooling
    label        TEXT,
    scopes       TEXT[]      NOT NULL DEFAULT '{}',   -- e.g. {tokens:write, assets:write, lookup}
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    CONSTRAINT chk_rdr_key_consumer CHECK (consumer IN ('pipeline','persona','admin_tooling'))
);
CREATE INDEX IF NOT EXISTS idx_rdr_api_keys_active ON redirector.api_keys (key_hash) WHERE is_active;

-- §14.2 idempotency — replay cache for automation POSTs. Keyed by the caller's
-- Idempotency-Key, scoped to the consumer so keys from different callers never
-- collide. `request_hash` guards against reusing a key with a different body
-- (that is a 409, not a silent replay). ~24h retention, like identity's cache.
CREATE TABLE IF NOT EXISTS redirector.idempotency (
    idempotency_key VARCHAR(200) NOT NULL,
    consumer        VARCHAR(64)  NOT NULL,
    endpoint        TEXT         NOT NULL,
    request_hash    CHAR(64)     NOT NULL,
    status_code     INTEGER      NOT NULL,
    response_body   JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (consumer, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_rdr_idem_created ON redirector.idempotency (created_at);

-- §18.4 audit_log — every admin mutation, with before/after. Append-only.
CREATE TABLE IF NOT EXISTS redirector.audit_log (
    audit_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor       VARCHAR(160) NOT NULL,               -- email, client id, or 'key:<consumer>'
    actor_type  VARCHAR(16)  NOT NULL,               -- sso | api_key
    action      VARCHAR(64)  NOT NULL,               -- token.create | token.retire | alias.approve ...
    entity_type VARCHAR(32)  NOT NULL,               -- token | alias | asset | rule | node
    entity_id   TEXT,
    before_json JSONB,
    after_json  JSONB,
    occurred_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdr_audit_entity ON redirector.audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_rdr_audit_time   ON redirector.audit_log (occurred_at);

-- §16 health watcher: track when the checksum was last verified so it can run
-- on a weekly cadence independent of the daily HEAD reachability check.
ALTER TABLE redirector.assets
    ADD COLUMN IF NOT EXISTS checksum_checked_at TIMESTAMPTZ;

-- §14 /aliases approval workflow. Aliases are requested (pending) and only
-- resolve once a manager approves (§3.5). Extends the 0021 aliases table.
ALTER TABLE redirector.aliases
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS requested_by    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS reject_reason   TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_rdr_alias_status') THEN
        ALTER TABLE redirector.aliases
            ADD CONSTRAINT chk_rdr_alias_status CHECK (approval_status IN ('pending','approved','rejected'));
    END IF;
END $$;

-- Only approved aliases participate in the hot resolve path.
CREATE INDEX IF NOT EXISTS idx_rdr_aliases_approved
    ON redirector.aliases (alias) WHERE approval_status = 'approved';

COMMENT ON TABLE redirector.api_keys   IS 'Automation API credentials (X-Redirector-Key), hashed & per-consumer (spec §18.3).';
COMMENT ON TABLE redirector.idempotency IS 'Replay cache for automation POSTs; per-consumer, ~24h retention (spec §14.2).';
COMMENT ON TABLE redirector.audit_log  IS 'Append-only audit of every admin mutation with before/after (spec §18.4).';
