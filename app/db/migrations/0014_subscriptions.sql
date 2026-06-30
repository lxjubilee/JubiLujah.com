-- ============================================================================
-- 0014_subscriptions.sql — Subscription Management System
--
-- A complete, normalized model for premium music subscriptions on Jubilujah.com:
--   * subscription_plans          — the catalog of plans (Free / Individual / Family)
--   * subscriptions               — one owner's subscription record + provider link
--   * family_groups / _members /  — Family-plan account linking (1 owner + 5 members)
--     family_invitations
--   * subscription_transactions   — lifecycle events (checkout, renewal, refund, …)
--   * payment_records             — concrete charges / invoices (PCI data stays at
--                                   the gateway; we keep references only)
--   * subscription_renewals       — scheduled / completed renewal cycles
--   * subscription_history        — append-only audit of every state change
--   * daily_listening_counters    — Free-plan "7 full songs / day" enforcement
--   * subscription_notifications  — in-app notification feed (mirrors emails)
--
-- Design notes:
--   * The gateway (Stripe in prod) is the source of truth for billing; we mirror
--     just enough to authorize playback and render the account UI. No card / PAN
--     data is ever stored here — only opaque provider references.
--   * "Free" is the ABSENCE of an active paid subscription row, not a stored row.
--     A user's effective entitlement is computed in services/subscriptions.js.
--   * Money is stored as integer minor units (cents) to avoid float drift.
--
-- Target: PostgreSQL 16+. Conventions match 0001_init.sql / 0012_analytics.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUM types
-- ----------------------------------------------------------------------------

-- Lifecycle of a paid subscription row. ("free" is modelled as no active row.)
CREATE TYPE production.subscription_status AS ENUM (
    'trialing',         -- in a free-trial window (future use)
    'active',           -- paid + entitled
    'past_due',         -- a renewal charge failed; grace period, retrying
    'payment_failed',   -- retries exhausted; entitlement suspended
    'cancelled',        -- ended (or cancelled and past its period end)
    'expired',          -- lapsed with no renewal
    'suspended'         -- administratively held
);
COMMENT ON TYPE production.subscription_status IS 'Lifecycle state of a paid subscription.';

CREATE TYPE production.billing_interval AS ENUM ('month', 'year');

CREATE TYPE production.payment_status AS ENUM (
    'pending', 'succeeded', 'failed', 'refunded', 'partially_refunded'
);

CREATE TYPE production.family_member_status AS ENUM ('active', 'removed');

CREATE TYPE production.family_invitation_status AS ENUM (
    'pending', 'accepted', 'revoked', 'expired'
);

-- ----------------------------------------------------------------------------
-- production.subscription_plans — the plan catalog
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscription_plans (
    id                  UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT                       NOT NULL UNIQUE,   -- 'free' | 'individual' | 'family'
    name                TEXT                       NOT NULL,
    tagline             TEXT,
    description         TEXT,
    price_cents         INTEGER                    NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    currency            TEXT                       NOT NULL DEFAULT 'usd',
    billing_interval    production.billing_interval NOT NULL DEFAULT 'month',
    -- Entitlement parameters consumed by services/subscriptions.js + listening.js.
    max_members         INTEGER                    NOT NULL DEFAULT 1 CHECK (max_members >= 1),
    daily_song_limit    INTEGER                    CHECK (daily_song_limit IS NULL OR daily_song_limit >= 0), -- NULL = unlimited
    preview_seconds     INTEGER                    NOT NULL DEFAULT 60 CHECK (preview_seconds >= 0),
    is_paid             BOOLEAN                    NOT NULL DEFAULT FALSE,
    features            JSONB                      NOT NULL DEFAULT '[]'::jsonb,
    highlighted         BOOLEAN                    NOT NULL DEFAULT FALSE, -- "recommended" card
    cta_label           TEXT,
    -- Gateway linkage (filled in by scripts/stripe-setup.mjs / admin). NULL until
    -- the plan is wired to a live gateway price.
    provider            TEXT,                      -- 'stripe' | 'mock' | …
    provider_product_id TEXT,
    provider_price_id   TEXT,
    is_active           BOOLEAN                    NOT NULL DEFAULT TRUE,
    sort_order          INTEGER                    NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.subscription_plans IS 'Catalog of subscription plans. price_cents in minor units; daily_song_limit NULL = unlimited.';

-- ----------------------------------------------------------------------------
-- production.subscriptions — one row per owner's subscription
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscriptions (
    id                      UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID                          NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    plan_id                 UUID                          NOT NULL REFERENCES production.subscription_plans(id),
    status                  production.subscription_status NOT NULL DEFAULT 'active',
    provider                TEXT,                         -- 'stripe' | 'mock'
    provider_customer_id    TEXT,
    provider_subscription_id TEXT,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    cancel_at_period_end    BOOLEAN                       NOT NULL DEFAULT FALSE,
    cancelled_at            TIMESTAMPTZ,
    trial_end               TIMESTAMPTZ,
    started_at              TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.subscriptions IS 'A user''s paid subscription. Gateway is source of truth; this mirrors entitlement + provider refs.';

-- Statuses that still grant entitlement / count as "the user already has one".
-- A user may hold at most ONE non-terminal subscription at a time.
CREATE UNIQUE INDEX uq_subscriptions_one_live_per_user
    ON production.subscriptions (user_id)
    WHERE status IN ('trialing', 'active', 'past_due', 'payment_failed', 'suspended');

CREATE INDEX idx_subscriptions_user      ON production.subscriptions (user_id, created_at DESC);
CREATE INDEX idx_subscriptions_status    ON production.subscriptions (status);
CREATE INDEX idx_subscriptions_provider  ON production.subscriptions (provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX idx_subscriptions_period_end ON production.subscriptions (current_period_end);

-- ----------------------------------------------------------------------------
-- Family plan: groups, members, invitations
-- ----------------------------------------------------------------------------
CREATE TABLE production.family_groups (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID         NOT NULL UNIQUE REFERENCES production.subscriptions(id) ON DELETE CASCADE,
    owner_user_id   UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    max_members     INTEGER      NOT NULL DEFAULT 6 CHECK (max_members >= 1),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.family_groups IS 'A Family subscription''s account group: 1 owner + up to (max_members-1) members.';

CREATE TABLE production.family_members (
    id              UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
    family_group_id UUID                          NOT NULL REFERENCES production.family_groups(id) ON DELETE CASCADE,
    user_id         UUID                          NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    is_owner        BOOLEAN                       NOT NULL DEFAULT FALSE,
    status          production.family_member_status NOT NULL DEFAULT 'active',
    joined_at       TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    removed_at      TIMESTAMPTZ,
    CONSTRAINT uq_family_member UNIQUE (family_group_id, user_id)
);
-- A user can belong to at most one active family group at a time.
CREATE UNIQUE INDEX uq_family_member_active_user
    ON production.family_members (user_id)
    WHERE status = 'active';
CREATE INDEX idx_family_members_group ON production.family_members (family_group_id);
COMMENT ON TABLE production.family_members IS 'Linked accounts under a family group. Each member keeps independent history/playlists.';

CREATE TABLE production.family_invitations (
    id               UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    family_group_id  UUID                            NOT NULL REFERENCES production.family_groups(id) ON DELETE CASCADE,
    email            CITEXT                          NOT NULL,
    token            TEXT                            NOT NULL UNIQUE,
    status           production.family_invitation_status NOT NULL DEFAULT 'pending',
    invited_by       UUID                            REFERENCES identity.users(id) ON DELETE SET NULL,
    accepted_user_id UUID                            REFERENCES identity.users(id) ON DELETE SET NULL,
    expires_at       TIMESTAMPTZ                     NOT NULL,
    accepted_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ                     NOT NULL DEFAULT NOW()
);
-- Only one outstanding invite per (group, email).
CREATE UNIQUE INDEX uq_family_invite_pending
    ON production.family_invitations (family_group_id, email)
    WHERE status = 'pending';
CREATE INDEX idx_family_invites_email ON production.family_invitations (email) WHERE status = 'pending';
COMMENT ON TABLE production.family_invitations IS 'Outstanding/used family invites. token is the single-use accept secret.';

-- ----------------------------------------------------------------------------
-- production.subscription_transactions — lifecycle event ledger
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscription_transactions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID         REFERENCES production.subscriptions(id) ON DELETE SET NULL,
    user_id         UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    type            TEXT         NOT NULL,   -- checkout | activation | renewal | cancellation | reactivation | plan_change | refund
    provider        TEXT,
    provider_ref    TEXT,                    -- session / invoice / event id
    amount_cents    INTEGER,
    currency        TEXT         NOT NULL DEFAULT 'usd',
    status          TEXT         NOT NULL DEFAULT 'pending',
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sub_tx_user ON production.subscription_transactions (user_id, created_at DESC);
CREATE INDEX idx_sub_tx_sub  ON production.subscription_transactions (subscription_id, created_at DESC);
COMMENT ON TABLE production.subscription_transactions IS 'Append-style ledger of subscription lifecycle events (checkout/renewal/refund/…).';

-- ----------------------------------------------------------------------------
-- production.payment_records — concrete charges / invoices (references only)
-- ----------------------------------------------------------------------------
CREATE TABLE production.payment_records (
    id                       UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id          UUID                     REFERENCES production.subscriptions(id) ON DELETE SET NULL,
    user_id                  UUID                     NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    provider                 TEXT,
    provider_invoice_id      TEXT,
    provider_payment_intent  TEXT,
    amount_cents             INTEGER                  NOT NULL DEFAULT 0,
    currency                 TEXT                     NOT NULL DEFAULT 'usd',
    status                   production.payment_status NOT NULL DEFAULT 'pending',
    description              TEXT,
    invoice_url              TEXT,                    -- hosted invoice / receipt URL from the gateway
    refunded_cents           INTEGER                  NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
    paid_at                  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_user ON production.payment_records (user_id, created_at DESC);
CREATE INDEX idx_payments_sub  ON production.payment_records (subscription_id, created_at DESC);
CREATE INDEX idx_payments_invoice ON production.payment_records (provider_invoice_id) WHERE provider_invoice_id IS NOT NULL;
COMMENT ON TABLE production.payment_records IS 'One row per charge/invoice. NO card data — only opaque gateway references + amounts.';

-- ----------------------------------------------------------------------------
-- production.subscription_renewals — renewal cycles
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscription_renewals (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id   UUID         NOT NULL REFERENCES production.subscriptions(id) ON DELETE CASCADE,
    period_start      TIMESTAMPTZ  NOT NULL,
    period_end        TIMESTAMPTZ  NOT NULL,
    amount_cents      INTEGER      NOT NULL DEFAULT 0,
    currency          TEXT         NOT NULL DEFAULT 'usd',
    status            TEXT         NOT NULL DEFAULT 'scheduled', -- scheduled | succeeded | failed
    payment_record_id UUID         REFERENCES production.payment_records(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_renewals_sub ON production.subscription_renewals (subscription_id, period_end DESC);
COMMENT ON TABLE production.subscription_renewals IS 'Per-cycle renewal record (scheduled → succeeded/failed).';

-- ----------------------------------------------------------------------------
-- production.subscription_history — append-only state-change audit
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscription_history (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID         REFERENCES production.subscriptions(id) ON DELETE SET NULL,
    user_id         UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    event           TEXT         NOT NULL,   -- created | activated | renewed | cancelled | reactivated | plan_changed | suspended | expired | refunded
    from_status     TEXT,
    to_status       TEXT,
    from_plan       TEXT,
    to_plan         TEXT,
    actor           TEXT         NOT NULL DEFAULT 'system', -- user | system | admin | webhook
    actor_user_id   UUID         REFERENCES identity.users(id) ON DELETE SET NULL,
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sub_history_sub  ON production.subscription_history (subscription_id, created_at DESC);
CREATE INDEX idx_sub_history_user ON production.subscription_history (user_id, created_at DESC);
COMMENT ON TABLE production.subscription_history IS 'Append-only audit trail of subscription state transitions.';
REVOKE UPDATE, DELETE, TRUNCATE ON production.subscription_history FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- production.daily_listening_counters — Free-plan daily quota enforcement
-- ----------------------------------------------------------------------------
CREATE TABLE production.daily_listening_counters (
    user_id       UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    day           DATE         NOT NULL,         -- local-day per LISTENING_TZ (resets at 00:00)
    songs_played  INTEGER      NOT NULL DEFAULT 0,  -- full songs counted toward the daily limit
    limited_plays INTEGER      NOT NULL DEFAULT 0,  -- previews served after the limit was hit
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, day)
);
COMMENT ON TABLE production.daily_listening_counters IS 'Per-user, per-day full-song counter for the Free plan 7/day limit. Resets naturally on a new day row.';

-- ----------------------------------------------------------------------------
-- production.subscription_notifications — in-app notification feed
-- ----------------------------------------------------------------------------
CREATE TABLE production.subscription_notifications (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    type        TEXT         NOT NULL,  -- subscription_activated | payment_succeeded | payment_failed | renewal_upcoming | renewed | expired | cancelled | family_invite_sent | family_invite_accepted | family_member_removed
    title       TEXT         NOT NULL,
    body        TEXT,
    read_at     TIMESTAMPTZ,
    email_sent  BOOLEAN      NOT NULL DEFAULT FALSE,
    metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sub_notif_user ON production.subscription_notifications (user_id, created_at DESC);
CREATE INDEX idx_sub_notif_unread ON production.subscription_notifications (user_id) WHERE read_at IS NULL;
COMMENT ON TABLE production.subscription_notifications IS 'In-app subscription/billing notifications (mirrors the emails).';

-- ----------------------------------------------------------------------------
-- updated_at touch trigger (shared) for the mutable tables
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.touch_updated_at()
    RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_plans_touch       BEFORE UPDATE ON production.subscription_plans      FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_subs_touch        BEFORE UPDATE ON production.subscriptions           FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_fgroups_touch     BEFORE UPDATE ON production.family_groups           FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_finvites_touch    BEFORE UPDATE ON production.family_invitations      FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Seed the three launch plans (idempotent on code).
-- ----------------------------------------------------------------------------
INSERT INTO production.subscription_plans
    (code, name, tagline, description, price_cents, currency, billing_interval,
     max_members, daily_song_limit, preview_seconds, is_paid, highlighted, cta_label, sort_order, features)
VALUES
    ('free', 'Free', 'Start listening today',
     'Enjoy a generous daily taste of inspiring Christian music, free forever.',
     0, 'usd', 'month', 1, 7, 60, FALSE, FALSE, 'Upgrade to Unlimited Listening', 0,
     '["Listen to up to 7 full songs every day","1-minute previews after your daily 7","Browse all albums, artists, playlists & lyrics","Ratings & reviews included","Daily limit resets at midnight"]'::jsonb),

    ('individual', 'Individual', 'Unlimited, just for you',
     'Unlimited streaming of every worship, gospel, praise, instrumental and devotional track — no interruptions.',
     395, 'usd', 'month', 1, NULL, 60, TRUE, TRUE, 'Start Your Subscription', 1,
     '["Unlimited streaming — every song, every album","No playback limits or interruptions","Unlimited ratings & reviews","Full access to the entire catalog","Listen across your personal devices","Automatic monthly renewal — cancel anytime"]'::jsonb),

    ('family', 'Family', 'Unlimited for the whole household',
     'Everything in Individual for up to 6 people — each with their own history, playlists and recommendations.',
     795, 'usd', 'month', 6, NULL, 60, TRUE, FALSE, 'Start Your Subscription', 2,
     '["1 owner + up to 5 family members (6 total)","Unlimited streaming for every member","Independent history, ratings & playlists per member","Separate recommendations for each account","Owner manages members & billing","Automatic monthly renewal — cancel anytime"]'::jsonb)
ON CONFLICT (code) DO NOTHING;
