-- ============================================================================
-- 0029_playlist_themes.sql — Theme-playlist per-user persistence
--
-- Backs the theme-playlist feature (a listener tunes a themed mix by persona,
-- language, arc, duration, mood, testimony/intro toggles). Three tables, all in
-- the production schema alongside the other user-generated content:
--   * playlist_preferences — the listener's saved knobs per (user, theme).
--   * playlist_rotation     — which song_ids have already been served to this
--                             listener for a (theme, language), so the next mix
--                             can avoid repeats until the cycle is reset.
--   * playlist_sends        — a shareable, tokened snapshot of a themed mix that
--                             a recipient (even without an account) can open.
--
-- song_id here is the same uuid v5 the client/manifest use (app/db/ids.js's
-- songUuid); rotation deliberately carries no FK to catalog.songs since it is an
-- append-only "served" log, not membership.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- production.playlist_preferences — saved knobs, one row per (user, theme).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.playlist_preferences (
    user_id          UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    theme_id         TEXT         NOT NULL,
    personas         TEXT[],
    language         TEXT,
    arc              TEXT,
    duration_seconds INTEGER,
    testimony_on     BOOLEAN      NOT NULL DEFAULT TRUE,
    intros_on        BOOLEAN      NOT NULL DEFAULT FALSE,
    mood             TEXT,
    mood_at          TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, theme_id)
);
COMMENT ON TABLE production.playlist_preferences IS
    'Per-(user, theme) theme-playlist settings. Frontend fills theme defaults when no row exists.';

-- ----------------------------------------------------------------------------
-- production.playlist_rotation — one row per track served to this listener for
-- a (theme, language). Drives repeat-avoidance until a cycle reset.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.playlist_rotation (
    user_id    UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    theme_id   TEXT         NOT NULL,
    language   TEXT,
    song_id    UUID         NOT NULL,
    served_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playlist_rotation_scope
    ON production.playlist_rotation (user_id, theme_id, language);
COMMENT ON TABLE production.playlist_rotation IS
    'Append-only log of song_ids already served to a listener for a (theme, language).';

-- ----------------------------------------------------------------------------
-- production.playlist_sends — a shareable, tokened snapshot of a themed mix.
-- Readable by anyone holding the token (public GET /api/playlist-share/:token).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.playlist_sends (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    token        TEXT         UNIQUE NOT NULL,
    sender_id    UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    sender_name  TEXT,
    theme_id     TEXT         NOT NULL,
    language     TEXT,
    personas     TEXT[],
    arc          TEXT,
    note         TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_playlist_sends_sender
    ON production.playlist_sends (sender_id, created_at DESC);
COMMENT ON TABLE production.playlist_sends IS
    'Shareable tokened snapshot of a themed mix. Token grants public read access.';
