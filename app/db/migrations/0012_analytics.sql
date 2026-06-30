-- ============================================================================
-- 0012_analytics.sql — Media Analytics (playback tracking + rollups)
--
-- The raw source of truth is production.playback_events: one row per playback.
-- Every album/song/user/trend metric in the dashboard is an aggregate over it.
-- production.analytics_daily is a cheap incremental rollup (cache) for the
-- "plays over time" / totals cards so they don't scan the raw event log.
--
-- Scale note: playback_events is designed to be RANGE-partitioned by month on
-- created_at for very high volume (see docs/ANALYTICS_FEATURE.md). It ships as a
-- single indexed table here; converting to partitions is a non-breaking follow
-- up because all access goes through the aggregate queries / rollup table.
--
-- Target: PostgreSQL 16+. Conventions match 0001_init.sql.
-- ============================================================================

-- Where the play was initiated from (§ Play Tracking).
CREATE TYPE production.playback_source AS ENUM (
    'album', 'playlist', 'search', 'recommendation', 'radio', 'direct', 'other'
);
COMMENT ON TYPE production.playback_source IS 'Origin of a playback event.';

-- ----------------------------------------------------------------------------
-- production.playback_events — raw playback log
-- ----------------------------------------------------------------------------
CREATE TABLE production.playback_events (
    id                  BIGSERIAL                     PRIMARY KEY,
    user_id             UUID                          REFERENCES identity.users(id) ON DELETE SET NULL,
    session_id          TEXT,
    album_id            UUID,
    song_id             UUID,
    artist_id           UUID,
    device_type         TEXT,                         -- mobile | tablet | desktop | other
    browser             TEXT,
    os                  TEXT,
    ip_address          INET,
    source              production.playback_source    NOT NULL DEFAULT 'other',
    started_at          TIMESTAMPTZ                   NOT NULL,
    ended_at            TIMESTAMPTZ,
    listening_seconds   INTEGER                       NOT NULL DEFAULT 0 CHECK (listening_seconds >= 0),
    duration_seconds    INTEGER                       CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    completion_pct      NUMERIC(5,2)                  NOT NULL DEFAULT 0 CHECK (completion_pct >= 0 AND completion_pct <= 100),
    completed           BOOLEAN                       NOT NULL DEFAULT FALSE,
    skipped             BOOLEAN                       NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);

-- Aggregation-path indexes (every dashboard query filters/group-bys one of these).
CREATE INDEX idx_pbe_song    ON production.playback_events (song_id, created_at DESC);
CREATE INDEX idx_pbe_album   ON production.playback_events (album_id, created_at DESC);
CREATE INDEX idx_pbe_artist  ON production.playback_events (artist_id);
CREATE INDEX idx_pbe_user    ON production.playback_events (user_id, created_at DESC);
CREATE INDEX idx_pbe_created ON production.playback_events (created_at);
CREATE INDEX idx_pbe_day     ON production.playback_events (((started_at AT TIME ZONE 'UTC')::date));

COMMENT ON TABLE production.playback_events IS
    'Raw playback log — one row per play. Source of truth for all media analytics.';

-- Analytics is append-only / system-written: no public UPDATE/DELETE.
REVOKE UPDATE, DELETE, TRUNCATE ON production.playback_events FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- production.analytics_daily — incremental daily rollup (cache)
-- ----------------------------------------------------------------------------
CREATE TABLE production.analytics_daily (
    day                 DATE          PRIMARY KEY,
    plays               INTEGER       NOT NULL DEFAULT 0,
    listening_seconds   BIGINT        NOT NULL DEFAULT 0,
    completed_plays     INTEGER       NOT NULL DEFAULT 0,
    skipped_plays       INTEGER       NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.analytics_daily IS
    'Per-day rollup of plays/listening seconds for fast trend + total cards.';
