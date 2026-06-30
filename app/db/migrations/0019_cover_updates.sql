-- ============================================================================
-- 0019_cover_updates.sql — admin album-cover replacement tracking.
-- One row per album whose cover was re-uploaded via the admin UI. `version`
-- drives the ?v= cache-bust (so a replaced cover shows immediately past the
-- 1-year immutable CDN cache). `synced_to_j = FALSE` flags covers that still
-- need copying back to the J: drive (done by a script on the studio machine).
-- ============================================================================
CREATE TABLE IF NOT EXISTS production.cover_updates (
    album_code    TEXT          PRIMARY KEY,
    version       INTEGER       NOT NULL DEFAULT 1,
    content_type  TEXT,
    bytes         INTEGER,
    updated_by    UUID          REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    synced_to_j   BOOLEAN       NOT NULL DEFAULT FALSE,
    synced_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cover_updates_pending ON production.cover_updates (updated_at) WHERE synced_to_j = FALSE;
COMMENT ON TABLE production.cover_updates IS 'Admin-replaced album covers: version (cache-bust) + pending J: drive sync flag.';
