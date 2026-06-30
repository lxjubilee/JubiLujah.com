-- ============================================================================
-- 0018_now_playing.sql — real-time "now playing" heartbeat for the admin
-- Active Listeners page. One row per active listening SESSION; the player
-- upserts it on play + every ~25s and deletes it on stop. A row is considered
-- LIVE if updated within the last ~45s. This is ephemeral presence state, not
-- the analytics log (that stays in production.playback_events).
-- ============================================================================
CREATE TABLE IF NOT EXISTS production.now_playing (
    session_id   TEXT          PRIMARY KEY,
    user_id      UUID          REFERENCES identity.users(id) ON DELETE CASCADE,
    song_id      UUID,
    ip_address   INET,
    started_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_now_playing_updated ON production.now_playing (updated_at DESC);
COMMENT ON TABLE production.now_playing IS 'Ephemeral real-time listening presence (admin Active Listeners). Upserted by the player heartbeat; row is live if updated_at within ~45s.';
