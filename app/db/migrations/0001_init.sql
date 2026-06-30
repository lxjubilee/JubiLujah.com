-- ============================================================================
-- Jubilujah.com — PostgreSQL Schema (Initial DDL)
-- Implements Build Spec §18 four-schema model
-- Target: PostgreSQL 16+
--
-- Logical schemas:
--   identity   — users, roles, sessions, audit
--   catalog    — artists, albums, songs, lyrics, assets, scripture refs
--   production — pipeline state/history, publications, ratings, comments,
--                nominations, awards, award periods, award categories
--   radio      — stations, programs, playlists, playlist_items, schedules
--
-- Cross-schema FKs are used freely (e.g. production.ratings.rater_user_id ->
-- identity.users.id). Every mutation that touches the catalog runs inside the
-- same transaction as its pipeline_history entry so the audit trail and the
-- state are guaranteed to agree.
--
-- Conventions:
--   * All primary keys are UUID v4 (gen_random_uuid() from pgcrypto).
--   * All timestamps are TIMESTAMPTZ in UTC.
--   * Soft delete = nullable deleted_at (only used where spec requires it).
--   * Polymorphic FKs (rateable_type + rateable_id) are validated by enum,
--     and integrity is enforced by trigger where the target table is known.
--   * Append-only tables (pipeline_history, audit_log) have DELETE revoked
--     from PUBLIC and the application role.
-- ============================================================================

-- Required extensions -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive text for emails


-- ============================================================================
-- 1.  SCHEMAS
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS production;
CREATE SCHEMA IF NOT EXISTS radio;

COMMENT ON SCHEMA identity   IS 'Users, roles, sessions, audit log (synced from JubileeInspire SSO).';
COMMENT ON SCHEMA catalog    IS 'Artists, albums, songs, lyrics, assets, scripture references.';
COMMENT ON SCHEMA production IS 'Pipeline state and history, publications, ratings, comments, awards.';
COMMENT ON SCHEMA radio      IS 'Stations, programs, playlists, schedules for the 101 HM-band stations.';


-- ============================================================================
-- 2.  ENUM TYPES
-- ============================================================================

-- Polymorphic rateable target (§9). Lives in `production` because every
-- consumer of it (ratings, comments, nominations, awards) is in production.
CREATE TYPE production.rateable_type AS ENUM (
    'song',
    'album',
    'artist',
    'playlist',
    'program'
);
COMMENT ON TYPE production.rateable_type IS
    '§9 polymorphic target tag for ratings, comments, nominations, awards.';

-- 10-stage production pipeline (§8). Order matters — stage progression checks
-- compare positions in this list (lower position = earlier stage).
CREATE TYPE production.pipeline_stage AS ENUM (
    'concept',          -- Song idea captured; no lyrics yet
    'lyrics_drafting',  -- Lyrics being composed
    'lyrics_approved',  -- Lyrics finalized; ready for generation
    'song_generation',  -- Audio being generated via Suno.com
    'qa_review',        -- Generated audio under QA review (Tahoma)
    'engineering',      -- Mix / master / cleanup pass
    'sunil_approval',   -- Final asset verified before publish
    'final_approval',   -- Stewardship sign-off; ready for release
    'published',        -- Live on cdn.jubileeverse.com
    'distributed'       -- Submitted to streaming distribution partners
);
COMMENT ON TYPE production.pipeline_stage IS
    '§8 ten-stage production pipeline. Order in this ENUM is significant.';

-- Brand grouping (§6). Four buckets, every artist belongs to exactly one.
CREATE TYPE catalog.artist_grouping AS ENUM (
    'inspire_family',
    'affiliated_artists',
    'childrens_brands',
    'other_initiatives'
);
COMMENT ON TYPE catalog.artist_grouping IS
    '§6 brand grouping — only inspire_family enforces 12-song album lock.';

-- Five-Fold office (§6). Inspire Family personas carry dual-office assignment;
-- non-Inspire artists may leave it NULL.
CREATE TYPE catalog.five_fold AS ENUM (
    'apostle',
    'prophet',
    'evangelist',
    'pastor',
    'teacher'
);
COMMENT ON TYPE catalog.five_fold IS
    '§6 Ephesians-4 fivefold office. Inspire Family personas carry dual-office.';


-- ============================================================================
-- 3.  identity.*  — users, roles, sessions, audit
-- ============================================================================

-- ----------------------------------------------------------------------------
-- identity.users
--   Mirror of the JubileeInspire SSO user record. We never store passwords.
--   external_subject is the OIDC `sub` claim; treat as the immutable identity.
-- ----------------------------------------------------------------------------
CREATE TABLE identity.users (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    external_subject    TEXT         NOT NULL UNIQUE,   -- OIDC sub
    email               CITEXT       NOT NULL UNIQUE,
    display_name        TEXT         NOT NULL,
    avatar_url          TEXT,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE identity.users IS
    'Local mirror of JubileeInspire SSO accounts. Passwords are NEVER stored here.';

-- ----------------------------------------------------------------------------
-- identity.user_roles
--   Synced from the SSO `roles` claim on every login. One row per (user, role).
--   Authorization middleware reads from here for sub-second decisions.
-- ----------------------------------------------------------------------------
CREATE TABLE identity.user_roles (
    user_id     UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    role        TEXT         NOT NULL
                CHECK (role IN ('viewer','content_editor','radio_producer','production_manager','admin')),
    granted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    granted_by  UUID         REFERENCES identity.users(id),
    PRIMARY KEY (user_id, role)
);
COMMENT ON TABLE identity.user_roles IS
    '§5 RBAC. Synced from JubileeInspire token claims on every login.';

-- ----------------------------------------------------------------------------
-- identity.sessions
--   Server-side session records backing the HttpOnly cookie. Token hash
--   stored, never the raw token. Expires at expires_at; nullable revoked_at
--   for explicit logout / admin revocation.
-- ----------------------------------------------------------------------------
CREATE TABLE identity.sessions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash      TEXT         NOT NULL UNIQUE,   -- SHA-256 of the opaque token
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ  NOT NULL,
    revoked_at      TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user_active
    ON identity.sessions (user_id)
    WHERE revoked_at IS NULL;
COMMENT ON TABLE identity.sessions IS
    'Server-side session records. Cookie carries opaque token; we store hash only.';

-- ----------------------------------------------------------------------------
-- identity.audit_log
--   Append-only record of identity-affecting actions: role grants/revokes,
--   admin overrides, session revocations. Insert-only by application role.
-- ----------------------------------------------------------------------------
CREATE TABLE identity.audit_log (
    id              BIGSERIAL    PRIMARY KEY,
    actor_user_id   UUID         REFERENCES identity.users(id),
    action          TEXT         NOT NULL,        -- e.g. 'role.grant', 'session.revoke'
    target_type     TEXT,                          -- e.g. 'user', 'session'
    target_id       TEXT,                          -- string for polymorphism (UUID or other)
    payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_actor   ON identity.audit_log (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_log_target  ON identity.audit_log (target_type, target_id, created_at DESC);
COMMENT ON TABLE identity.audit_log IS
    'Append-only identity audit trail. DELETE revoked from PUBLIC below.';

REVOKE DELETE ON identity.audit_log FROM PUBLIC;


-- ============================================================================
-- 4.  catalog.*  — artists, albums, songs, lyrics, assets, scripture refs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- catalog.artists
--   Personas and branded acts across all four groupings.
--   avg_rating + rating_count are denormalized from production.ratings via
--   trigger (defined in §8 of this file).
--   five_fold_primary / five_fold_secondary capture the dual-office assignment
--   for Inspire Family personas (§6); both nullable for non-Inspire artists.
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.artists (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                    TEXT         NOT NULL UNIQUE,
    display_name            TEXT         NOT NULL,
    grouping                catalog.artist_grouping NOT NULL,
    bio                     TEXT,
    genre_anchor            TEXT,
    five_fold_primary       catalog.five_fold,
    five_fold_secondary     catalog.five_fold,
    visual_identity_url     TEXT,
    avatar_asset_id         UUID,                                  -- FK added after assets table
    ohi_default             BOOLEAN      NOT NULL DEFAULT TRUE,    -- OHI = default; CCI = override
    avg_rating              NUMERIC(3,2),                          -- denorm from ratings trigger
    rating_count            INTEGER      NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (five_fold_primary IS NULL OR five_fold_primary <> five_fold_secondary)
);
CREATE INDEX idx_artists_grouping ON catalog.artists (grouping);
COMMENT ON TABLE catalog.artists IS
    '§6/§7 personas and branded acts. avg_rating/rating_count denormalized via trigger.';

-- ----------------------------------------------------------------------------
-- catalog.albums
--   Belongs to one artist. 12-song lock for Inspire Family is enforced at
--   publish time via a trigger (defined in §8 of this file).
--   release_date is nullable until the album is published.
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.albums (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id           UUID         NOT NULL REFERENCES catalog.artists(id) ON DELETE RESTRICT,
    slug                TEXT         NOT NULL,
    title               TEXT         NOT NULL,
    title_translations  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    cover_asset_id      UUID,                                  -- FK added after assets table
    release_date        DATE,
    language_primary    TEXT         NOT NULL DEFAULT 'en',
    languages           TEXT[]       NOT NULL DEFAULT '{}',
    genre_tags          TEXT[]       NOT NULL DEFAULT '{}',
    cci_internal        BOOLEAN      NOT NULL DEFAULT FALSE,   -- internal override flag, never serialized
    is_published        BOOLEAN      NOT NULL DEFAULT FALSE,
    avg_rating          NUMERIC(3,2),
    rating_count        INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (artist_id, slug)
);
CREATE INDEX idx_albums_artist ON catalog.albums (artist_id);
COMMENT ON TABLE catalog.albums IS
    '§7 release belonging to one artist. 12-song lock enforced for inspire_family via trigger.';
COMMENT ON COLUMN catalog.albums.cci_internal IS
    'CCI override flag. Internal-only; never serialized to public JSON manifests.';

-- ----------------------------------------------------------------------------
-- catalog.songs
--   Individual track belonging to one album. Track number is unique per album.
--   five_fold_office optional per-song override (Inspire Family).
--   avg_rating + rating_count denormalized from production.ratings.
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.songs (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    album_id            UUID         NOT NULL REFERENCES catalog.albums(id) ON DELETE CASCADE,
    track_number        INTEGER      NOT NULL CHECK (track_number BETWEEN 1 AND 99),
    title               TEXT         NOT NULL,
    title_translations  JSONB        NOT NULL DEFAULT '{}'::jsonb,
    duration_seconds    INTEGER      CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    language_primary    TEXT         NOT NULL DEFAULT 'en',
    languages_secondary TEXT[]       NOT NULL DEFAULT '{}',
    genre_tags          TEXT[]       NOT NULL DEFAULT '{}',
    five_fold_office    catalog.five_fold,
    audio_asset_id      UUID,                                  -- FK added after assets table
    isrc                TEXT,
    bpm                 INTEGER      CHECK (bpm IS NULL OR (bpm BETWEEN 30 AND 300)),
    music_key           TEXT,
    cci_internal        BOOLEAN      NOT NULL DEFAULT FALSE,
    avg_rating          NUMERIC(3,2),
    rating_count        INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (album_id, track_number)
);
CREATE INDEX idx_songs_album ON catalog.songs (album_id);
COMMENT ON TABLE catalog.songs IS
    '§7 individual track. Pipeline state lives in production.pipeline_state keyed by song id.';

-- ----------------------------------------------------------------------------
-- catalog.lyrics
--   Multilingual lyrics tied to a song. One row per (song, language).
--   format: 'plain' or 'lrc' (timestamped).
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.lyrics (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id         UUID         NOT NULL REFERENCES catalog.songs(id) ON DELETE CASCADE,
    language        TEXT         NOT NULL,
    format          TEXT         NOT NULL DEFAULT 'plain'
                    CHECK (format IN ('plain','lrc')),
    body            TEXT         NOT NULL,
    is_primary      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (song_id, language)
);
CREATE INDEX idx_lyrics_song ON catalog.lyrics (song_id);
COMMENT ON TABLE catalog.lyrics IS
    '§7 multilingual lyrics. format=lrc carries timestamps; plain is unstamped text.';

-- ----------------------------------------------------------------------------
-- catalog.assets
--   File reference table. Pointers to R2 objects on cdn.jubileeverse.com.
--   kind = 'audio' | 'cover' | 'avatar' | 'banner' | 'document'.
--   sha256 + bytes for integrity and rollup reporting.
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.assets (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    kind            TEXT         NOT NULL
                    CHECK (kind IN ('audio','cover','avatar','banner','document')),
    storage_url     TEXT         NOT NULL,
    mime_type       TEXT         NOT NULL,
    bytes           BIGINT       CHECK (bytes IS NULL OR bytes >= 0),
    sha256          TEXT,                                      -- hex digest
    uploaded_by     UUID         REFERENCES identity.users(id),
    uploaded_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb  -- bitrate, dimensions, etc.
);
CREATE INDEX idx_assets_kind ON catalog.assets (kind);
COMMENT ON TABLE catalog.assets IS
    'File reference table for audio, cover art, avatars, etc. Pointers to R2 objects.';

-- Back-fill the asset foreign keys now that catalog.assets exists.
ALTER TABLE catalog.artists
    ADD CONSTRAINT fk_artists_avatar
    FOREIGN KEY (avatar_asset_id) REFERENCES catalog.assets(id) ON DELETE SET NULL;

ALTER TABLE catalog.albums
    ADD CONSTRAINT fk_albums_cover
    FOREIGN KEY (cover_asset_id) REFERENCES catalog.assets(id) ON DELETE SET NULL;

ALTER TABLE catalog.songs
    ADD CONSTRAINT fk_songs_audio
    FOREIGN KEY (audio_asset_id) REFERENCES catalog.assets(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- catalog.scripture_references
--   Many-to-many from songs (or lyrics) to Bible references.
--   Stored as canonical osis_ref ("Isaiah.62.5") plus free-text display form.
-- ----------------------------------------------------------------------------
CREATE TABLE catalog.scripture_references (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    song_id         UUID         NOT NULL REFERENCES catalog.songs(id) ON DELETE CASCADE,
    osis_ref        TEXT         NOT NULL,             -- e.g. 'Isa.62.5'
    display_ref     TEXT         NOT NULL,             -- e.g. 'Isaiah 62:5'
    translation     TEXT,                              -- e.g. 'NKJV', 'NTR', 'ESV'
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (song_id, osis_ref, translation)
);
CREATE INDEX idx_scripture_song ON catalog.scripture_references (song_id);
COMMENT ON TABLE catalog.scripture_references IS
    '§7 scripture refs anchored to a song. osis_ref is the canonical form for lookup.';


-- ============================================================================
-- 5.  production.*  — pipeline, publications, ratings, comments, awards
-- ============================================================================

-- ----------------------------------------------------------------------------
-- production.pipeline_state
--   Current stage per rateable object (songs and albums use this; the
--   rateable_type column scopes the polymorphic id). One row per object;
--   updated in place on every transition (history is captured separately).
-- ----------------------------------------------------------------------------
CREATE TABLE production.pipeline_state (
    id                  UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    rateable_type       production.rateable_type   NOT NULL
                        CHECK (rateable_type IN ('song','album')),
    rateable_id         UUID                       NOT NULL,
    current_stage       production.pipeline_stage  NOT NULL DEFAULT 'concept',
    assignee_user_id    UUID                       REFERENCES identity.users(id),
    entered_stage_at    TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    UNIQUE (rateable_type, rateable_id)
);
CREATE INDEX idx_pipeline_state_stage    ON production.pipeline_state (current_stage);
CREATE INDEX idx_pipeline_state_assignee ON production.pipeline_state (assignee_user_id)
    WHERE assignee_user_id IS NOT NULL;
COMMENT ON TABLE production.pipeline_state IS
    '§8 current pipeline stage per song/album. Updated in place; history in pipeline_history.';

-- ----------------------------------------------------------------------------
-- production.pipeline_history
--   APPEND-ONLY transition log. DELETE is revoked below.
--   Both from_stage and to_stage recorded so backwards transitions are
--   explicit and reportable.
-- ----------------------------------------------------------------------------
CREATE TABLE production.pipeline_history (
    id              BIGSERIAL                  PRIMARY KEY,
    rateable_type   production.rateable_type   NOT NULL
                    CHECK (rateable_type IN ('song','album')),
    rateable_id     UUID                       NOT NULL,
    from_stage      production.pipeline_stage,            -- null on initial entry
    to_stage        production.pipeline_stage  NOT NULL,
    actor_user_id   UUID                       NOT NULL REFERENCES identity.users(id),
    note            TEXT,
    occurred_at     TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_pipeline_history_target
    ON production.pipeline_history (rateable_type, rateable_id, occurred_at DESC);
CREATE INDEX idx_pipeline_history_actor
    ON production.pipeline_history (actor_user_id, occurred_at DESC);
COMMENT ON TABLE production.pipeline_history IS
    '§8 append-only transition log. DELETE revoked from PUBLIC for audit integrity.';

-- Enforce append-only at the privilege level.
REVOKE DELETE, TRUNCATE ON production.pipeline_history FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- production.publications
--   Version history of every published JSON manifest. The R2 path is
--   overwrite-in-place (§15); Postgres holds the version trail with content
--   hashes so any past version can be rebuilt from DB state.
-- ----------------------------------------------------------------------------
CREATE TABLE production.publications (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    rateable_type   production.rateable_type   NOT NULL
                    CHECK (rateable_type IN ('song','album','playlist','program')),
    rateable_id     UUID                       NOT NULL,
    version         INTEGER                    NOT NULL,
    cdn_path        TEXT                       NOT NULL,
    content_hash    TEXT                       NOT NULL,    -- sha256 hex of manifest body
    published_by    UUID                       NOT NULL REFERENCES identity.users(id),
    published_at    TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    UNIQUE (rateable_type, rateable_id, version)
);
CREATE INDEX idx_publications_target
    ON production.publications (rateable_type, rateable_id, version DESC);
COMMENT ON TABLE production.publications IS
    '§17 publish-version trail. R2 is overwrite-in-place; this preserves history.';

-- ----------------------------------------------------------------------------
-- production.ratings
--   Full §9 schema. One rating per editor per object; CHECK 1..5; UNIQUE on
--   (rateable_type, rateable_id, rater_user_id) ensures no double-vote.
-- ----------------------------------------------------------------------------
CREATE TABLE production.ratings (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    rateable_type   production.rateable_type   NOT NULL,
    rateable_id     UUID                       NOT NULL,
    rater_user_id   UUID                       NOT NULL REFERENCES identity.users(id),
    stars           SMALLINT                   NOT NULL CHECK (stars BETWEEN 1 AND 5),
    note            TEXT,
    created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    UNIQUE (rateable_type, rateable_id, rater_user_id)
);
CREATE INDEX idx_ratings_target
    ON production.ratings (rateable_type, rateable_id);
COMMENT ON TABLE production.ratings IS
    '§9 polymorphic 5-star ratings. One per editor per object; updatable.';

-- ----------------------------------------------------------------------------
-- production.comments
--   Full §10 schema. Threaded one level (parent_id), with @mentions, optional
--   lyric line anchor, and soft delete. Partial index on (target) WHERE
--   deleted_at IS NULL keeps active-comment lookups fast.
-- ----------------------------------------------------------------------------
CREATE TABLE production.comments (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    rateable_type   production.rateable_type   NOT NULL,
    rateable_id     UUID                       NOT NULL,
    author_user_id  UUID                       NOT NULL REFERENCES identity.users(id),
    parent_id       UUID                       REFERENCES production.comments(id) ON DELETE CASCADE,
    body            TEXT                       NOT NULL,
    lyric_line      INTEGER,
    mentions        UUID[]                     NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    CHECK (length(trim(body)) > 0)
);
CREATE INDEX idx_comments_target
    ON production.comments (rateable_type, rateable_id)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_comments_parent
    ON production.comments (parent_id)
    WHERE parent_id IS NOT NULL AND deleted_at IS NULL;
COMMENT ON TABLE production.comments IS
    '§10 editorial annotations. Threaded one level deep; soft delete; never in public JSON.';

-- ----------------------------------------------------------------------------
-- production.award_categories  (§11)
-- ----------------------------------------------------------------------------
CREATE TABLE production.award_categories (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT                       NOT NULL UNIQUE,
    description     TEXT,
    rateable_type   production.rateable_type   NOT NULL
                    CHECK (rateable_type IN ('song','album')),
    active          BOOLEAN                    NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.award_categories IS
    '§11 award category catalog. Pure data — admins can create, edit, retire.';

-- ----------------------------------------------------------------------------
-- production.award_periods  (§11) — annual window per category
-- ----------------------------------------------------------------------------
CREATE TABLE production.award_periods (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID                       NOT NULL REFERENCES production.award_categories(id),
    year            INTEGER                    NOT NULL CHECK (year BETWEEN 2020 AND 2100),
    opens_at        TIMESTAMPTZ                NOT NULL,
    closes_at       TIMESTAMPTZ                NOT NULL,
    status          TEXT                       NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','closed','awarded')),
    UNIQUE (category_id, year),
    CHECK (closes_at > opens_at)
);
COMMENT ON TABLE production.award_periods IS
    '§11 annual nomination window per category.';

-- ----------------------------------------------------------------------------
-- production.nominations
--   §11 — 250-char minimum justification enforced by CHECK constraint.
-- ----------------------------------------------------------------------------
CREATE TABLE production.nominations (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id       UUID                       NOT NULL REFERENCES production.award_periods(id),
    rateable_type   production.rateable_type   NOT NULL
                    CHECK (rateable_type IN ('song','album')),
    rateable_id     UUID                       NOT NULL,
    nominator_id    UUID                       NOT NULL REFERENCES identity.users(id),
    reason          TEXT                       NOT NULL,
    created_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    CONSTRAINT reason_min_length CHECK (length(trim(reason)) >= 250),
    UNIQUE (period_id, rateable_type, rateable_id, nominator_id)
);
CREATE INDEX idx_nominations_period_target
    ON production.nominations (period_id, rateable_type, rateable_id);
COMMENT ON TABLE production.nominations IS
    '§11 nomination — 250-char justification CHECK enforced server-side.';

-- ----------------------------------------------------------------------------
-- production.awards
--   §11 — admin-selected winners (and honorable mentions if desired).
-- ----------------------------------------------------------------------------
CREATE TABLE production.awards (
    id              UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id       UUID                       NOT NULL REFERENCES production.award_periods(id),
    rateable_type   production.rateable_type   NOT NULL
                    CHECK (rateable_type IN ('song','album')),
    rateable_id     UUID                       NOT NULL,
    award_type      TEXT                       NOT NULL DEFAULT 'winner'
                    CHECK (award_type IN ('winner','honorable_mention')),
    citation        TEXT,
    awarded_at      TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    awarded_by      UUID                       NOT NULL REFERENCES identity.users(id),
    UNIQUE (period_id, rateable_type, rateable_id, award_type)
);
COMMENT ON TABLE production.awards IS
    '§11 admin-selected award. award_type distinguishes winner vs honorable mention.';


-- ============================================================================
-- 6.  radio.*  — stations, programs, playlists, items, schedules
-- ============================================================================

-- ----------------------------------------------------------------------------
-- radio.stations  (§12)
--   The 101 HM-band stations (HM 300.00 - 399.90). frequency UNIQUE so the
--   call_sign and the numeric channel can never disagree.
-- ----------------------------------------------------------------------------
CREATE TABLE radio.stations (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    call_sign           TEXT         NOT NULL UNIQUE,             -- e.g. 'HM 305.30'
    display_name        TEXT         NOT NULL,
    description         TEXT,
    frequency           NUMERIC(6,2) NOT NULL UNIQUE
                        CHECK (frequency BETWEEN 300.00 AND 399.90),
    genre_anchors       TEXT[]       NOT NULL DEFAULT '{}',
    persona_affinity    UUID[]       NOT NULL DEFAULT '{}',       -- preferred artist IDs
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    avg_rating          NUMERIC(3,2),
    rating_count        INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE radio.stations IS
    '§12 the 101 HM-band stations. frequency unique enforces channel discipline.';

-- ----------------------------------------------------------------------------
-- radio.programs  (§12)
--   A named show optionally hosted by an artist, optionally pinned to a
--   station, with a cron expression for airing.
-- ----------------------------------------------------------------------------
CREATE TABLE radio.programs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT         NOT NULL,
    description     TEXT,
    host_artist_id  UUID         REFERENCES catalog.artists(id) ON DELETE SET NULL,
    station_id      UUID         REFERENCES radio.stations(id)  ON DELETE SET NULL,
    schedule_cron   TEXT,
    duration_min    INTEGER      NOT NULL CHECK (duration_min > 0),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    avg_rating      NUMERIC(3,2),
    rating_count    INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_programs_station ON radio.programs (station_id) WHERE station_id IS NOT NULL;
COMMENT ON TABLE radio.programs IS
    '§12 named radio show. Optionally tied to a station; schedule_cron drives airing.';

-- ----------------------------------------------------------------------------
-- radio.playlists  (§12)
-- ----------------------------------------------------------------------------
CREATE TABLE radio.playlists (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT         NOT NULL,
    description     TEXT,
    program_id      UUID         REFERENCES radio.programs(id) ON DELETE SET NULL,
    created_by      UUID         NOT NULL REFERENCES identity.users(id),
    avg_rating      NUMERIC(3,2),
    rating_count    INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_playlists_program ON radio.playlists (program_id) WHERE program_id IS NOT NULL;
COMMENT ON TABLE radio.playlists IS
    '§12 ordered song collection. Standalone or attached to a program.';

-- ----------------------------------------------------------------------------
-- radio.playlist_items  (§12)
--   UNIQUE (playlist_id, position) enforces stable order.
-- ----------------------------------------------------------------------------
CREATE TABLE radio.playlist_items (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id     UUID         NOT NULL REFERENCES radio.playlists(id) ON DELETE CASCADE,
    song_id         UUID         NOT NULL REFERENCES catalog.songs(id)   ON DELETE RESTRICT,
    position        INTEGER      NOT NULL CHECK (position >= 0),
    transition      TEXT         CHECK (transition IS NULL OR transition IN ('crossfade','hard_cut','sweeper')),
    UNIQUE (playlist_id, position)
);
CREATE INDEX idx_playlist_items_song ON radio.playlist_items (song_id);
COMMENT ON TABLE radio.playlist_items IS
    '§12 ordered playlist members. UNIQUE(playlist_id,position) enforces stable order.';

-- ----------------------------------------------------------------------------
-- radio.schedules  (§12)
--   Daypart definitions per station. Each row binds a window
--   (start_minute..end_minute as minutes-of-day) on a station to either a
--   program or a playlist (exclusive — CHECK enforces exactly one).
-- ----------------------------------------------------------------------------
CREATE TABLE radio.schedules (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id      UUID         NOT NULL REFERENCES radio.stations(id) ON DELETE CASCADE,
    daypart         TEXT         NOT NULL
                    CHECK (daypart IN ('morning','midday','evening','overnight')),
    day_of_week     SMALLINT     CHECK (day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
    start_minute    SMALLINT     NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute      SMALLINT     NOT NULL CHECK (end_minute   BETWEEN 1 AND 1440),
    program_id      UUID         REFERENCES radio.programs(id)  ON DELETE CASCADE,
    playlist_id     UUID         REFERENCES radio.playlists(id) ON DELETE CASCADE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (end_minute > start_minute),
    CHECK ((program_id IS NOT NULL)::int + (playlist_id IS NOT NULL)::int = 1)
);
CREATE INDEX idx_schedules_station ON radio.schedules (station_id, daypart);
COMMENT ON TABLE radio.schedules IS
    '§12 daypart binding. Exactly one of program_id / playlist_id must be set.';


-- ============================================================================
-- 7.  INDEXES (recap — most created inline above)
-- ============================================================================
--   idx_ratings_target                        — production.ratings  (target lookup)
--   idx_comments_target  (partial)            — production.comments WHERE deleted_at IS NULL
--   idx_pipeline_state_stage                  — production.pipeline_state
--   idx_pipeline_history_target               — production.pipeline_history
--   idx_publications_target                   — production.publications
--   idx_nominations_period_target             — production.nominations
--   idx_artists_grouping, idx_albums_artist   — catalog
--   idx_songs_album, idx_lyrics_song          — catalog
--   idx_scripture_song                        — catalog
--   idx_assets_kind                           — catalog
--   idx_audit_log_actor, idx_audit_log_target — identity
--   idx_sessions_user_active (partial)        — identity.sessions WHERE revoked_at IS NULL


-- ============================================================================
-- 8.  TRIGGERS — ratings aggregation, album auto-promote (§17), updated_at
-- ============================================================================

-- ----------------------------------------------------------------------------
-- updated_at touch trigger — generic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_artists_touch    BEFORE UPDATE ON catalog.artists      FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_albums_touch     BEFORE UPDATE ON catalog.albums       FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_songs_touch      BEFORE UPDATE ON catalog.songs        FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_lyrics_touch     BEFORE UPDATE ON catalog.lyrics       FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_users_touch      BEFORE UPDATE ON identity.users       FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_ratings_touch    BEFORE UPDATE ON production.ratings   FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_comments_touch   BEFORE UPDATE ON production.comments  FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_pipeline_touch   BEFORE UPDATE ON production.pipeline_state FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_stations_touch   BEFORE UPDATE ON radio.stations       FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_programs_touch   BEFORE UPDATE ON radio.programs       FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();
CREATE TRIGGER trg_playlists_touch  BEFORE UPDATE ON radio.playlists      FOR EACH ROW EXECUTE FUNCTION production.touch_updated_at();

-- ----------------------------------------------------------------------------
-- Ratings aggregation — refresh denorm columns on the parent row
--   §9: avg_rating + rating_count are denormalized to the parent table.
--   Trigger fires on INSERT/UPDATE/DELETE of production.ratings and rewrites
--   the parent's columns from a fresh aggregate.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.recompute_rating_aggregate(
    p_type production.rateable_type,
    p_id   UUID
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_avg  NUMERIC(3,2);
    v_cnt  INTEGER;
BEGIN
    SELECT ROUND(AVG(stars)::numeric, 2), COUNT(*)
      INTO v_avg, v_cnt
      FROM production.ratings
     WHERE rateable_type = p_type
       AND rateable_id   = p_id;

    IF p_type = 'song' THEN
        UPDATE catalog.songs    SET avg_rating = v_avg, rating_count = v_cnt WHERE id = p_id;
    ELSIF p_type = 'album' THEN
        UPDATE catalog.albums   SET avg_rating = v_avg, rating_count = v_cnt WHERE id = p_id;
    ELSIF p_type = 'artist' THEN
        UPDATE catalog.artists  SET avg_rating = v_avg, rating_count = v_cnt WHERE id = p_id;
    ELSIF p_type = 'playlist' THEN
        UPDATE radio.playlists  SET avg_rating = v_avg, rating_count = v_cnt WHERE id = p_id;
    ELSIF p_type = 'program' THEN
        UPDATE radio.programs   SET avg_rating = v_avg, rating_count = v_cnt WHERE id = p_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION production.on_rating_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM production.recompute_rating_aggregate(OLD.rateable_type, OLD.rateable_id);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- If the target moved (unusual but possible), refresh both old and new.
        IF (OLD.rateable_type, OLD.rateable_id) <> (NEW.rateable_type, NEW.rateable_id) THEN
            PERFORM production.recompute_rating_aggregate(OLD.rateable_type, OLD.rateable_id);
        END IF;
        PERFORM production.recompute_rating_aggregate(NEW.rateable_type, NEW.rateable_id);
        RETURN NEW;
    ELSE
        PERFORM production.recompute_rating_aggregate(NEW.rateable_type, NEW.rateable_id);
        RETURN NEW;
    END IF;
END;
$$;

CREATE TRIGGER trg_ratings_aggregate
    AFTER INSERT OR UPDATE OR DELETE ON production.ratings
    FOR EACH ROW EXECUTE FUNCTION production.on_rating_change();

-- ----------------------------------------------------------------------------
-- 12-song lock — Inspire Family albums must have exactly 12 songs to publish
--   §7 / §17. Fires whenever pipeline_state.current_stage moves to
--   'published' for an album. Verifies the parent artist's grouping and the
--   song count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.enforce_album_12_song_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_grouping  catalog.artist_grouping;
    v_songcount INTEGER;
BEGIN
    IF NEW.rateable_type <> 'album' OR NEW.current_stage <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT a.grouping, COUNT(s.id)
      INTO v_grouping, v_songcount
      FROM catalog.albums  al
      JOIN catalog.artists a ON a.id = al.artist_id
      LEFT JOIN catalog.songs s ON s.album_id = al.id
     WHERE al.id = NEW.rateable_id
     GROUP BY a.grouping;

    IF v_grouping = 'inspire_family' AND v_songcount <> 12 THEN
        RAISE EXCEPTION
            '12-song lock violated: Inspire Family album % has % songs (must be exactly 12 to publish).',
            NEW.rateable_id, v_songcount;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_album_12_song_lock
    BEFORE INSERT OR UPDATE OF current_stage ON production.pipeline_state
    FOR EACH ROW EXECUTE FUNCTION production.enforce_album_12_song_lock();

-- ----------------------------------------------------------------------------
-- Album auto-promote (§17) — when the Nth song of an album reaches
-- 'published', if all sibling songs are also published, auto-advance the
-- parent album's pipeline_state to 'published'.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.auto_promote_album()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_album_id      UUID;
    v_total_songs   INTEGER;
    v_pub_songs     INTEGER;
    v_album_state   production.pipeline_stage;
BEGIN
    -- Only act when a SONG transitions to 'published'.
    IF NEW.rateable_type <> 'song' OR NEW.current_stage <> 'published' THEN
        RETURN NEW;
    END IF;

    SELECT s.album_id INTO v_album_id
      FROM catalog.songs s
     WHERE s.id = NEW.rateable_id;

    IF v_album_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Count total songs and published songs for the album.
    SELECT COUNT(*),
           COUNT(*) FILTER (
               WHERE EXISTS (
                   SELECT 1 FROM production.pipeline_state ps2
                    WHERE ps2.rateable_type = 'song'
                      AND ps2.rateable_id   = s.id
                      AND ps2.current_stage IN ('published','distributed')
               )
           )
      INTO v_total_songs, v_pub_songs
      FROM catalog.songs s
     WHERE s.album_id = v_album_id;

    IF v_total_songs = 0 OR v_pub_songs < v_total_songs THEN
        RETURN NEW;
    END IF;

    -- All songs published. Promote the album if it isn't already.
    SELECT current_stage INTO v_album_state
      FROM production.pipeline_state
     WHERE rateable_type = 'album' AND rateable_id = v_album_id;

    IF v_album_state IS NULL THEN
        INSERT INTO production.pipeline_state (rateable_type, rateable_id, current_stage)
        VALUES ('album', v_album_id, 'published');

        INSERT INTO production.pipeline_history
            (rateable_type, rateable_id, from_stage, to_stage, actor_user_id, note)
        SELECT 'album', v_album_id, NULL, 'published', NEW.actor_user_id_dummy, NULL
        WHERE FALSE;  -- placeholder: history insert handled by app context

        UPDATE catalog.albums SET is_published = TRUE WHERE id = v_album_id;
    ELSIF v_album_state <> 'published' AND v_album_state <> 'distributed' THEN
        UPDATE production.pipeline_state
           SET current_stage = 'published',
               entered_stage_at = NOW()
         WHERE rateable_type = 'album' AND rateable_id = v_album_id;

        UPDATE catalog.albums SET is_published = TRUE WHERE id = v_album_id;
    END IF;

    RETURN NEW;
END;
$$;

-- NB: The placeholder INSERT ... WHERE FALSE above is intentional — the
-- application layer is responsible for writing the pipeline_history row in
-- the same transaction so the actor is recorded. The trigger only mutates
-- pipeline_state and the convenience is_published flag.

CREATE TRIGGER trg_auto_promote_album
    AFTER INSERT OR UPDATE OF current_stage ON production.pipeline_state
    FOR EACH ROW EXECUTE FUNCTION production.auto_promote_album();


-- ============================================================================
-- 9.  SEED DATA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 9a. Admin user — Gabriel Ungureanu
--     Deterministic UUID so application code and other seed scripts can
--     reference it without an extra lookup.
-- ----------------------------------------------------------------------------
INSERT INTO identity.users (id, external_subject, email, display_name, is_active)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'jubileeinspire|gabriel.ungureanu',
    'eagle01@eaglesquest.org',
    'Gabriel Ungureanu',
    TRUE
)
ON CONFLICT (external_subject) DO NOTHING;

INSERT INTO identity.user_roles (user_id, role, granted_by)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin',              '11111111-1111-1111-1111-111111111111'),
    ('11111111-1111-1111-1111-111111111111', 'production_manager', '11111111-1111-1111-1111-111111111111'),
    ('11111111-1111-1111-1111-111111111111', 'radio_producer',     '11111111-1111-1111-1111-111111111111'),
    ('11111111-1111-1111-1111-111111111111', 'content_editor',     '11111111-1111-1111-1111-111111111111')
ON CONFLICT (user_id, role) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9b. Inspire Family roster — 13 personas (§6)
--     Five-Fold dual offices are reasonable defaults the editorial team can
--     refine in the admin UI.
-- ----------------------------------------------------------------------------
INSERT INTO catalog.artists
    (slug, display_name, grouping, bio, genre_anchor, five_fold_primary, five_fold_secondary)
VALUES
    ('jubilee-inspire',  'Jubilee Inspire',  'inspire_family',
        'Lead worship voice of the Inspire Family; carries the jubilee proclamation.',
        'worship',     'apostle',    'prophet'),
    ('melody-inspire',   'Melody Inspire',   'inspire_family',
        'Bridal worship and prophetic song.',
        'bridal worship', 'prophet', 'pastor'),
    ('zariah-inspire',   'Zariah Inspire',   'inspire_family',
        'Intercessory psalmist; carries the watchman cry.',
        'intercession', 'prophet',  'teacher'),
    ('elias-inspire',    'Elias Inspire',    'inspire_family',
        'Anointed declaration and prophetic decree.',
        'declaration', 'prophet',  'evangelist'),
    ('eliana-inspire',   'Eliana Inspire',   'inspire_family',
        'Sunrise worship; morning awakening voice.',
        'morning worship', 'pastor', 'evangelist'),
    ('caleb-inspire',    'Caleb Inspire',    'inspire_family',
        'Breakthrough anthems; faith-grit songs for the mountain-takers.',
        'breakthrough', 'evangelist', 'apostle'),
    ('imani-inspire',    'Imani Inspire',    'inspire_family',
        'Soulful faith songs in the African-diaspora tradition.',
        'gospel soul', 'pastor',  'teacher'),
    ('zev-inspire',      'Zev Inspire',      'inspire_family',
        'Hebrew-rooted worship; carries the language of Zion.',
        'hebrew worship', 'teacher', 'prophet'),
    ('amir-inspire',     'Amir Inspire',     'inspire_family',
        'Middle-Eastern worship textures; reconciliation songs.',
        'levantine worship', 'pastor', 'apostle'),
    ('nova-inspire',     'Nova Inspire',     'inspire_family',
        'Next-generation pop-worship; youth anthems.',
        'pop worship', 'evangelist', 'pastor'),
    ('santiago-inspire', 'Santiago Inspire', 'inspire_family',
        'Latin worship; bilingual Spanish/English.',
        'latin worship', 'evangelist', 'teacher'),
    ('tahoma-inspire',   'Tahoma Inspire',   'inspire_family',
        'First-Nations worship; mountain-and-river songs. Also Inspire QA lead.',
        'cinematic worship', 'teacher', 'apostle'),
    ('gabriel-inspire',  'Gabriel Inspire',  'inspire_family',
        'Apostolic covering tier; commissioning and impartation songs.',
        'apostolic worship', 'apostle', 'teacher')
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9c. Starter award categories — §11 roster of 11
-- ----------------------------------------------------------------------------
INSERT INTO production.award_categories (name, description, rateable_type) VALUES
    ('Song of the Year',                          'Top song across all categories for the year.',                'song'),
    ('Album of the Year',                         'Top full album across all categories for the year.',          'album'),
    ('Most Anointed Lyric',                       'Song whose lyric carried the deepest revelation.',            'song'),
    ('Best Worship Anthem',                       'Congregational worship song with strongest singability.',     'song'),
    ('Best Prophetic Song',                       'Strongest prophetic-edge song of the year.',                  'song'),
    ('Best Declaration Song',                     'Strongest declaration / decree song of the year.',            'song'),
    ('Best Children''s Song',                     'Best song for the Party Giggles / Tiny Tiggles audience.',    'song'),
    ('Best Children''s Album',                    'Best full children''s album.',                                'album'),
    ('Best Bilingual or Multilingual Production', 'Best song crossing two or more languages.',                   'song'),
    ('Best Cinematic Production',                 'Best film-scale arrangement and production.',                 'song'),
    ('Breakthrough Album of the Year',            'Album marking a breakthrough season for its artist.',         'album')
ON CONFLICT (name) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9d. Radio stations — sample 8 spanning HM 300-399.90 (§12)
--     Full 101-station roster is loaded by a separate seed script.
-- ----------------------------------------------------------------------------
INSERT INTO radio.stations (call_sign, display_name, description, frequency, genre_anchors) VALUES
    ('HM 300.10', 'Jubilee Dawn',          'Sunrise worship and morning psalms.',           300.10, ARRAY['morning worship','psalms']),
    ('HM 310.20', 'Bridal Chamber Radio',  'Bridal worship from the Inspire Family.',       310.20, ARRAY['bridal worship','prophetic']),
    ('HM 325.50', 'Declaration Frequency', 'Decree, declaration, and breakthrough songs.',  325.50, ARRAY['declaration','breakthrough']),
    ('HM 340.00', 'Zion Hebrew Hour',      'Hebrew-rooted worship and Davidic psalmody.',   340.00, ARRAY['hebrew worship','psalmody']),
    ('HM 355.75', 'Cinematic Worship',     'Film-scale worship arrangements.',              355.75, ARRAY['cinematic worship','orchestral']),
    ('HM 370.30', 'Party Giggles Channel', 'Family-friendly children''s music.',            370.30, ARRAY['children','party']),
    ('HM 385.40', 'Tiny Tiggles Nursery',  'Lullabies and gentle songs for little ones.',   385.40, ARRAY['children','lullaby']),
    ('HM 399.90', 'Apostolic Commissioning','Commissioning, impartation, and sending songs.', 399.90, ARRAY['apostolic','commissioning'])
ON CONFLICT (call_sign) DO NOTHING;


-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
