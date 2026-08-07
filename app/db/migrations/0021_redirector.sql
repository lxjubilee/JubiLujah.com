-- ============================================================================
-- 0021_redirector.sql — Redirector Engine and QR Code System (spec v2.0).
--
-- A per-domain, self-contained redirector: a short opaque token on /r/<TOKEN>
-- resolves to a canonical asset (never a raw storage path). See
-- software/redirector.md §8 for the data model this implements.
--
-- Spec tables are named rdr_*; here they live in a dedicated `redirector`
-- schema (matching this codebase's schema-per-domain convention), so
-- rdr_tokens -> redirector.tokens, rdr_assets -> redirector.assets, etc.
-- Postgres type mapping: GUID->uuid, nvarchar->text, bit->boolean,
-- datetime2->timestamptz, bigint identity->generated identity.
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS redirector;

-- §8.1 assets — the indirection target. A token points here, never at a path.
CREATE TABLE IF NOT EXISTS redirector.assets (
    asset_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- immutable
    content_kind      VARCHAR(32)  NOT NULL,   -- album|track|book|chapter|article|app|devotional|image|video|pdf|external
    title             TEXT         NOT NULL,
    slug              VARCHAR(200),
    storage_url       TEXT,                     -- current CDN/storage location (MUTABLE)
    storage_provider  VARCHAR(64),
    mime_type         VARCHAR(128),
    byte_size         BIGINT,
    checksum_sha256   CHAR(64),
    keywords          TEXT,                     -- comma-separated; feeds persona lookup
    summary           TEXT,                     -- 1-2 sentences; feeds lookup + landing pages
    cover_image_url   TEXT,
    taxonomy_node_id  UUID,
    sort_order        INTEGER,                  -- position among siblings (resume tokens)
    published_at      TIMESTAMPTZ,
    ipx_number        VARCHAR(32),              -- links back to the IPX pipeline record
    health_status     VARCHAR(16)  NOT NULL DEFAULT 'unchecked',  -- ok|unreachable|checksum_mismatch|unchecked
    health_checked_at TIMESTAMPTZ,
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdr_assets_node   ON redirector.assets (taxonomy_node_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_rdr_assets_kind   ON redirector.assets (content_kind);
CREATE INDEX IF NOT EXISTS idx_rdr_assets_health ON redirector.assets (health_status) WHERE health_status <> 'ok';

-- §8.5 taxonomy_nodes — the domain product tree the admin console renders from.
CREATE TABLE IF NOT EXISTS redirector.taxonomy_nodes (
    node_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_node_id  UUID REFERENCES redirector.taxonomy_nodes(node_id) ON DELETE SET NULL,
    level_key       VARCHAR(64) NOT NULL,       -- matches a level in taxonomy.profile.json
    title           TEXT        NOT NULL,
    slug            VARCHAR(200),
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    cover_image_url TEXT,
    metadata_json   JSONB,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdr_taxonomy_parent ON redirector.taxonomy_nodes (parent_node_id, sort_order);

-- §8.4 rules — DQR resolution rules (evaluated at request time). §7.
CREATE TABLE IF NOT EXISTS redirector.rules (
    rule_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT        NOT NULL,
    strategy          VARCHAR(32) NOT NULL,      -- calendar_map|sequence_daily|... (§7.1)
    parameters_json   JSONB,
    pool_json         JSONB,                     -- ordered asset ids or a collection ref
    timezone          VARCHAR(64) NOT NULL DEFAULT 'America/Los_Angeles',
    default_region    CHAR(2),                   -- required for geo_route
    fallback_asset_id UUID NOT NULL REFERENCES redirector.assets(asset_id),  -- never null (§7.2)
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- §8.2 tokens — the permanent, opaque short codes. Hot path.
CREATE TABLE IF NOT EXISTS redirector.tokens (
    token               CHAR(12) PRIMARY KEY,    -- uppercase, alphabet in §3.2
    token_type          CHAR(3)  NOT NULL,       -- QR | DQR (immutable after insert)
    resolution_mode     VARCHAR(16) NOT NULL,    -- asset | rule | resume
    asset_id            UUID REFERENCES redirector.assets(asset_id),          -- required when mode=asset
    rule_id             UUID REFERENCES redirector.rules(rule_id),            -- required when mode=rule
    resume_node_id      UUID REFERENCES redirector.taxonomy_nodes(node_id),  -- required when mode=resume
    content_kind        VARCHAR(32),
    device_routes_json  JSONB,                   -- §6.4
    landing_enabled     BOOLEAN  NOT NULL DEFAULT FALSE,  -- §6.5
    landing_config_json JSONB,
    state               VARCHAR(16) NOT NULL DEFAULT 'active',  -- active|retired|superseded|suspended
    superseded_by_token CHAR(12),
    label               TEXT,
    campaign            VARCHAR(100),
    placement           VARCHAR(100),
    created_by          VARCHAR(100),
    created_via         VARCHAR(32),             -- admin_ui|api|ipx_pipeline|persona
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_resolved_at    TIMESTAMPTZ,
    resolve_count       BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_rdr_token_type CHECK (token_type IN ('QR','DQR')),
    CONSTRAINT chk_rdr_token_mode CHECK (resolution_mode IN ('asset','rule','resume')),
    CONSTRAINT chk_rdr_token_state CHECK (state IN ('active','retired','superseded','suspended'))
);
-- The covering index for the hot resolve path (§8.2).
CREATE INDEX IF NOT EXISTS idx_rdr_tokens_token_state ON redirector.tokens (token, state);

-- §8.3 aliases — human-readable names sharing the token namespace.
CREATE TABLE IF NOT EXISTS redirector.aliases (
    alias         VARCHAR(20) PRIMARY KEY,       -- uppercase; unique across aliases AND tokens
    token         CHAR(12) NOT NULL REFERENCES redirector.tokens(token),
    approved_by   VARCHAR(100),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolve_count BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rdr_aliases_token ON redirector.aliases (token);

-- §8.6 resume_state — per-subject progress for resume tokens.
CREATE TABLE IF NOT EXISTS redirector.resume_state (
    state_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token         CHAR(12) NOT NULL REFERENCES redirector.tokens(token),
    subject_key   VARCHAR(128) NOT NULL,         -- cookie id (anon) or account id (sso)
    subject_type  VARCHAR(16)  NOT NULL,         -- cookie | account
    last_asset_id UUID,
    last_position INTEGER,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (token, subject_key)
);

-- §8.7 ephemeral_tokens — short-lived persona recommendation tokens (/rp/).
CREATE TABLE IF NOT EXISTS redirector.ephemeral_tokens (
    eph_token    CHAR(12) PRIMARY KEY,           -- same alphabet, separate namespace
    asset_id     UUID NOT NULL REFERENCES redirector.assets(asset_id),
    persona_name TEXT,
    reason_text  TEXT,                           -- one line, shown on landing page
    expires_at   TIMESTAMPTZ NOT NULL,           -- creation + 30 days
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdr_eph_expires ON redirector.ephemeral_tokens (expires_at);

-- §8.8 qr_images — cached QR render metadata.
CREATE TABLE IF NOT EXISTS redirector.qr_images (
    qr_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token            CHAR(12) NOT NULL REFERENCES redirector.tokens(token),
    variant          VARCHAR(32) NOT NULL,       -- standard|print|logo|inverted|branded
    style_profile    VARCHAR(64),
    format           VARCHAR(8)  NOT NULL,       -- svg|png
    pixel_size       INTEGER,
    error_correction CHAR(1),                    -- L|M|Q|H
    file_url         TEXT,
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rdr_qr_token ON redirector.qr_images (token, variant);

-- §8.9 scan_events — append-only analytics log (written async, never blocks).
CREATE TABLE IF NOT EXISTS redirector.scan_events (
    event_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token             CHAR(12) NOT NULL,
    via_alias         VARCHAR(20),
    resolved_asset_id UUID,                      -- what was actually served (critical for DQR)
    campaign          VARCHAR(100),
    placement         VARCHAR(100),
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash           CHAR(64),                  -- SHA256(ip + daily salt); never raw IP
    user_agent        TEXT,
    device_class      VARCHAR(16),               -- mobile|tablet|desktop|bot|unknown
    referrer          TEXT,
    country_code      CHAR(2),
    is_bot            BOOLEAN NOT NULL DEFAULT FALSE,
    landing_shown     BOOLEAN NOT NULL DEFAULT FALSE,
    landing_action    VARCHAR(32)
);
CREATE INDEX IF NOT EXISTS idx_rdr_scan_token    ON redirector.scan_events (token, occurred_at);
CREATE INDEX IF NOT EXISTS idx_rdr_scan_occurred ON redirector.scan_events (occurred_at);

COMMENT ON SCHEMA redirector IS 'Redirector Engine and QR Code System (software/redirector.md v2.0) — per-domain token→asset indirection.';
