-- ============================================================================
-- 0015_manage_music.sql — Manage Music admin module (BRD: Manage Music)
--
-- A management/publishing-state LAYER over the authoritative catalog manifest.
-- The manifest (folder-scan of the CDN, web/public/music/catalog-manifest.json)
-- remains the source of truth for what EXISTS on cdn.jubileeverse.com. These
-- tables add the bits the manifest does NOT carry: per-album / per-song publish
-- visibility, CDN sync history, asset-validation results, an admin activity
-- audit trail, and the scheduled-sync config.
--
-- IMPORTANT: no media is duplicated here — only metadata and CDN *references*.
-- Albums/songs are keyed by the same deterministic UUIDs used everywhere else
-- (album:CODE / song:CODE:N under namespace f3a1e2d4-… — see app/db/ids.js) plus
-- their human album_code so the admin UI can join the manifest cheaply.
--
-- Target: PostgreSQL 16+. Conventions match 0001_init.sql / 0012_analytics.sql.
-- ============================================================================

-- Publish state of an album/song on Jubilujah.com.
--   published — visible on the public site (and admin)
--   hidden    — admin-suppressed: must NOT appear anywhere on the public site,
--               but stays in the admin panel
--   draft     — not yet released (e.g. studio album with no cover) — hidden from
--               the public site like `hidden`, but semantically "not ready"
CREATE TYPE production.music_visibility AS ENUM ('published', 'hidden', 'draft');
COMMENT ON TYPE production.music_visibility IS 'Public visibility of a managed album/song.';

-- ----------------------------------------------------------------------------
-- production.music_album_state — one row per album_code (publish + health state)
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_album_state (
    album_code          TEXT                          PRIMARY KEY,
    album_id            UUID                          NOT NULL,        -- albumUuid(code)
    title               TEXT                          NOT NULL DEFAULT '',
    artist_slug         TEXT                          NOT NULL DEFAULT '',
    artist_name         TEXT                          NOT NULL DEFAULT '',
    category            TEXT,
    release_year        INTEGER,
    cdn_path            TEXT,                                          -- e.g. /music/albums/inspire/…
    cover_url           TEXT,                                          -- absolute CDN cover URL
    song_count          INTEGER                       NOT NULL DEFAULT 0,
    audio_present_count INTEGER                       NOT NULL DEFAULT 0,
    audio_missing_count INTEGER                       NOT NULL DEFAULT 0,
    cover_present       BOOLEAN,                                       -- NULL = not yet probed
    metadata_complete   BOOLEAN                       NOT NULL DEFAULT FALSE,
    visibility          production.music_visibility   NOT NULL DEFAULT 'draft',
    -- 'auto'  — visibility tracks the manifest (re-derived every sync)
    -- 'manual'— an admin set it explicitly; sync will NOT override it
    visibility_source   TEXT                          NOT NULL DEFAULT 'auto'
                                                      CHECK (visibility_source IN ('auto','manual')),
    validation          JSONB                         NOT NULL DEFAULT '[]'::jsonb,  -- [{check,passed,detail}]
    present_in_manifest BOOLEAN                       NOT NULL DEFAULT TRUE,         -- false => broken/removed CDN ref
    last_modified_at    TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ,
    published_at        TIMESTAMPTZ,
    hidden_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mas_visibility   ON production.music_album_state (visibility);
CREATE INDEX idx_mas_artist       ON production.music_album_state (artist_slug);
CREATE INDEX idx_mas_category     ON production.music_album_state (category);
CREATE INDEX idx_mas_cover        ON production.music_album_state (cover_present);
CREATE INDEX idx_mas_metadata     ON production.music_album_state (metadata_complete);
CREATE INDEX idx_mas_present      ON production.music_album_state (present_in_manifest);
CREATE INDEX idx_mas_synced       ON production.music_album_state (last_synced_at DESC);
-- Case-insensitive title/artist search support.
CREATE INDEX idx_mas_title_lower  ON production.music_album_state (lower(title));
CREATE INDEX idx_mas_artist_lower ON production.music_album_state (lower(artist_name));
COMMENT ON TABLE production.music_album_state IS
    'Publish + asset-health state per album, layered over the catalog manifest.';

-- ----------------------------------------------------------------------------
-- production.music_song_state — one row per song_id (publish + audio state)
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_song_state (
    song_id             UUID                          PRIMARY KEY,     -- songUuid(code, n)
    album_code          TEXT                          NOT NULL,
    album_id            UUID                          NOT NULL,
    track_number        INTEGER                       NOT NULL,
    title               TEXT                          NOT NULL DEFAULT '',
    artist_name         TEXT                          NOT NULL DEFAULT '',
    duration_seconds    INTEGER,
    cdn_path            TEXT,                                          -- relative track path
    mp3_url             TEXT,                                          -- absolute CDN mp3 URL
    mp3_available       BOOLEAN                       NOT NULL DEFAULT FALSE,
    lyrics_available    BOOLEAN                       NOT NULL DEFAULT FALSE,
    metadata_complete   BOOLEAN                       NOT NULL DEFAULT FALSE,
    visibility          production.music_visibility   NOT NULL DEFAULT 'draft',
    visibility_source   TEXT                          NOT NULL DEFAULT 'auto'
                                                      CHECK (visibility_source IN ('auto','manual')),
    present_in_manifest BOOLEAN                       NOT NULL DEFAULT TRUE,
    last_modified_at    TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mss_album        ON production.music_song_state (album_code, track_number);
CREATE INDEX idx_mss_visibility   ON production.music_song_state (visibility);
CREATE INDEX idx_mss_audio        ON production.music_song_state (mp3_available);
CREATE INDEX idx_mss_present      ON production.music_song_state (present_in_manifest);
CREATE INDEX idx_mss_title_lower  ON production.music_song_state (lower(title));
COMMENT ON TABLE production.music_song_state IS
    'Publish + audio-availability state per song, layered over the catalog manifest.';

-- ----------------------------------------------------------------------------
-- production.music_sync_runs — CDN synchronization history + result summary/log
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_sync_runs (
    id                  BIGSERIAL                     PRIMARY KEY,
    trigger             TEXT                          NOT NULL DEFAULT 'manual'
                                                      CHECK (trigger IN ('manual','scheduled')),
    status              TEXT                          NOT NULL DEFAULT 'running'
                                                      CHECK (status IN ('running','success','error')),
    actor_user_id       UUID                          REFERENCES identity.users(id) ON DELETE SET NULL,
    started_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    finished_at         TIMESTAMPTZ,
    albums_scanned      INTEGER                       NOT NULL DEFAULT 0,
    songs_scanned       INTEGER                       NOT NULL DEFAULT 0,
    albums_new          INTEGER                       NOT NULL DEFAULT 0,
    songs_new           INTEGER                       NOT NULL DEFAULT 0,
    albums_updated      INTEGER                       NOT NULL DEFAULT 0,
    songs_updated       INTEGER                       NOT NULL DEFAULT 0,
    albums_removed      INTEGER                       NOT NULL DEFAULT 0,
    songs_removed       INTEGER                       NOT NULL DEFAULT 0,
    missing_covers      INTEGER                       NOT NULL DEFAULT 0,
    missing_audio       INTEGER                       NOT NULL DEFAULT 0,
    summary             JSONB                         NOT NULL DEFAULT '{}'::jsonb,
    log                 JSONB                         NOT NULL DEFAULT '[]'::jsonb,
    error               TEXT,
    created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_msr_started ON production.music_sync_runs (started_at DESC);
COMMENT ON TABLE production.music_sync_runs IS
    'One row per CDN sync execution (manual or scheduled) with its result summary + log.';

-- ----------------------------------------------------------------------------
-- production.music_validation_results — normalized per-album asset checks
-- (latest result per album + check; the album_state.validation JSONB is a cache)
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_validation_results (
    id                  BIGSERIAL                     PRIMARY KEY,
    album_code          TEXT                          NOT NULL,
    check_name          TEXT                          NOT NULL,
    passed              BOOLEAN                       NOT NULL,
    detail              TEXT,
    checked_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW(),
    UNIQUE (album_code, check_name)
);
CREATE INDEX idx_mvr_album  ON production.music_validation_results (album_code);
CREATE INDEX idx_mvr_failed ON production.music_validation_results (passed) WHERE passed = FALSE;
COMMENT ON TABLE production.music_validation_results IS
    'Latest pass/fail of each asset-validation check per album.';

-- ----------------------------------------------------------------------------
-- production.music_sync_config — singleton scheduled-sync configuration
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_sync_config (
    id                  INTEGER                       PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    schedule            TEXT                          NOT NULL DEFAULT 'off'
                                                      CHECK (schedule IN ('off','hourly','6h','12h','daily','weekly')),
    enabled             BOOLEAN                       NOT NULL DEFAULT FALSE,
    last_run_at         TIMESTAMPTZ,
    next_run_at         TIMESTAMPTZ,
    updated_by          UUID                          REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
INSERT INTO production.music_sync_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE production.music_sync_config IS
    'Singleton: scheduled CDN-sync cadence for the Manage Music module.';

-- ----------------------------------------------------------------------------
-- production.music_activity_log — append-only admin action audit
-- ----------------------------------------------------------------------------
CREATE TABLE production.music_activity_log (
    id                  BIGSERIAL                     PRIMARY KEY,
    actor_user_id       UUID                          REFERENCES identity.users(id) ON DELETE SET NULL,
    actor_name          TEXT,
    action              TEXT                          NOT NULL,   -- album.published, song.hidden, sync.executed, …
    target_type         TEXT                          NOT NULL CHECK (target_type IN ('album','song','sync','config','bulk')),
    target_id           TEXT,                                     -- album_code / song_id / run id
    previous_value      JSONB,
    new_value           JSONB,
    created_at          TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mal_created ON production.music_activity_log (created_at DESC);
CREATE INDEX idx_mal_target  ON production.music_activity_log (target_type, target_id);
COMMENT ON TABLE production.music_activity_log IS
    'Append-only audit of Manage Music administrator actions (publish/hide/edit/sync).';
-- Audit trail is system-written and immutable.
REVOKE UPDATE, DELETE, TRUNCATE ON production.music_activity_log FROM PUBLIC;
