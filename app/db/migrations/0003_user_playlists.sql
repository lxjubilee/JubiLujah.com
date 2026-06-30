-- ============================================================================
-- production.user_playlists — personal, user-owned playlists.
--
-- Distinct from radio.playlists (which are producer/station programming, gated
-- by the radio_producer role). These belong to ANY authenticated user: a signed
-- in listener can create named collections of songs and save them. Lives in the
-- production schema as user-generated content alongside ratings/comments.
-- ============================================================================
CREATE TABLE IF NOT EXISTS production.user_playlists (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    name            TEXT         NOT NULL CHECK (length(trim(name)) > 0),
    description     TEXT,
    is_public       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_playlists_owner
    ON production.user_playlists (owner_user_id, created_at DESC);
COMMENT ON TABLE production.user_playlists IS
    'Personal playlists owned by an individual user. Distinct from radio.playlists.';

-- ----------------------------------------------------------------------------
-- production.user_playlist_items
--   Ordered membership. UNIQUE(playlist_id, position) keeps a stable order;
--   UNIQUE(playlist_id, song_id) prevents the same song appearing twice.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.user_playlist_items (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id     UUID         NOT NULL REFERENCES production.user_playlists(id) ON DELETE CASCADE,
    song_id         UUID         NOT NULL REFERENCES catalog.songs(id) ON DELETE CASCADE,
    position        INTEGER      NOT NULL CHECK (position >= 0),
    added_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (playlist_id, position),
    UNIQUE (playlist_id, song_id)
);
CREATE INDEX IF NOT EXISTS idx_user_playlist_items_song
    ON production.user_playlist_items (song_id);
COMMENT ON TABLE production.user_playlist_items IS
    'Ordered members of a personal playlist. No duplicate songs per playlist.';

-- updated_at touch (reuses the generic function defined in 0001_init.sql).
DROP TRIGGER IF EXISTS trg_user_playlists_touch ON production.user_playlists;
CREATE TRIGGER trg_user_playlists_touch
    BEFORE UPDATE ON production.user_playlists
    FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
