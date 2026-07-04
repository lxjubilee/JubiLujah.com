-- ============================================================================
-- 0024_music_type_albums.sql — Manual album association for Music Types
--
-- Lets the admin pick EXACTLY which albums appear under each curated Music Type
-- (the pinned genres + any genre the admin adds), instead of relying solely on
-- the catalog's genre tags. Auto-discovered genres (those with >= min_album_count
-- tagged albums) remain tag-based — they aren't stored here.
--
-- Album refs are catalog album codes (e.g. CAIM1001EN), the same refs used by
-- sections and hero slides. Target: PostgreSQL 16+.
-- ============================================================================
CREATE TABLE IF NOT EXISTS production.mobile_music_type_albums (
    id            BIGSERIAL   PRIMARY KEY,
    music_type_id BIGINT      NOT NULL REFERENCES production.mobile_music_types(id) ON DELETE CASCADE,
    album_ref     TEXT        NOT NULL,            -- album_code
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (music_type_id, album_ref)
);
CREATE INDEX IF NOT EXISTS idx_mtalbums ON production.mobile_music_type_albums (music_type_id, display_order);
COMMENT ON TABLE production.mobile_music_type_albums IS
    'Admin-curated album membership for a Music Type genre (overrides tag matching).';
