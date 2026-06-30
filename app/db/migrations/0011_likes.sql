-- ============================================================================
-- 0011_likes.sql — Account-backed favorites ("likes")
--
-- Replaces the per-browser localStorage "Liked" set with a DB-backed, per-user
-- favorites list so likes persist across devices and power a "Liked" page.
-- Polymorphic over album/song (the hover-tile like targets albums today).
-- ============================================================================

CREATE TABLE production.user_likes (
    user_id      UUID                       NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    target_type  production.rateable_type   NOT NULL CHECK (target_type IN ('album','song')),
    target_id    UUID                       NOT NULL,
    created_at   TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, target_type, target_id)
);
CREATE INDEX idx_user_likes_user   ON production.user_likes (user_id, created_at DESC);
CREATE INDEX idx_user_likes_target ON production.user_likes (target_type, target_id);
COMMENT ON TABLE production.user_likes IS
    'Account-backed favorites. One row per (user, target_type, target_id).';
