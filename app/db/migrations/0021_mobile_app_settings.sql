-- ============================================================================
-- 0021_mobile_app_settings.sql — Mobile App Settings (admin-managed categories)
--
-- A curation LAYER (like 0015 Manage Music) that controls what the MOBILE app
-- shows and in what order, independently of the website. The catalog manifest
-- stays the source of album/artist/track/genre data; these tables only decide
-- which top-level categories appear, their order, their membership, and the
-- Music Type genres. Read by the public GET /api/mobile/config endpoint and
-- managed from the admin "Mobile App Settings" screen.
--
-- Item refs are the SAME identifiers the mobile app resolves against its
-- manifest: album_code (e.g. CAIM1001EN) and artist_slug (e.g. jubilee-inspire).
-- Category membership is optional here: when a category has no explicit rows,
-- the read API computes sensible defaults from the manifest (personas, children,
-- etc.), so the five categories work out of the box before any curation.
--
-- Target: PostgreSQL 16+. Conventions match 0015_manage_music.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- production.mobile_categories — the top-level mobile categories (seeded)
-- ----------------------------------------------------------------------------
CREATE TABLE production.mobile_categories (
    id            BIGSERIAL   PRIMARY KEY,
    key           TEXT        NOT NULL UNIQUE,   -- home | inspire_family | family_friendly | children | music_type
    label         TEXT        NOT NULL,
    -- How the read API + app interpret this category's membership:
    --   curated     — an admin-picked mix of albums/artists/collections
    --   personas    — approved artist personas (Inspire Family)
    --   albums      — approved albums/artists
    --   music_type  — browse-by-genre (uses mobile_music_types, not items)
    kind          TEXT        NOT NULL CHECK (kind IN ('curated','personas','albums','music_type')),
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,   -- inactive = removed from the app entirely
    is_visible    BOOLEAN     NOT NULL DEFAULT TRUE,   -- visible = shows in the app (soft hide)
    updated_by    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mobcat_order ON production.mobile_categories (display_order);
COMMENT ON TABLE production.mobile_categories IS
    'Top-level mobile app categories: order, visibility, active/inactive.';

-- ----------------------------------------------------------------------------
-- production.mobile_category_items — membership + order for a category
-- (curated / personas / albums). Empty => read API uses manifest defaults.
-- ----------------------------------------------------------------------------
CREATE TABLE production.mobile_category_items (
    id            BIGSERIAL   PRIMARY KEY,
    category_id   BIGINT      NOT NULL REFERENCES production.mobile_categories(id) ON DELETE CASCADE,
    item_type     TEXT        NOT NULL CHECK (item_type IN ('album','artist','collection')),
    item_ref      TEXT        NOT NULL,          -- album_code | artist_slug | collection id
    title         TEXT,                          -- collection display title (else derived)
    album_refs    TEXT[],                        -- collection: its album_codes, in order
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (category_id, item_type, item_ref)
);
CREATE INDEX idx_mobitem_cat ON production.mobile_category_items (category_id, display_order);
COMMENT ON TABLE production.mobile_category_items IS
    'Ordered membership (album/artist/collection) per mobile category.';

-- ----------------------------------------------------------------------------
-- production.mobile_music_types — the MUSIC TYPE genres (seeded pinned 5)
-- ----------------------------------------------------------------------------
CREATE TABLE production.mobile_music_types (
    id            BIGSERIAL   PRIMARY KEY,
    genre         TEXT        NOT NULL UNIQUE,   -- matches catalog/manifest genre tags
    label         TEXT        NOT NULL,
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_pinned     BOOLEAN     NOT NULL DEFAULT FALSE,  -- always shown, above the auto ">= N albums" list
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_mobmt_order ON production.mobile_music_types (display_order);
COMMENT ON TABLE production.mobile_music_types IS
    'Music Type genres for the mobile app: pinned 5 + admin-managed order/visibility.';

-- ----------------------------------------------------------------------------
-- production.mobile_settings — singleton knobs
-- ----------------------------------------------------------------------------
CREATE TABLE production.mobile_settings (
    id            INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    -- A non-pinned genre appears under Music Type once it has >= this many albums.
    min_album_count INTEGER   NOT NULL DEFAULT 12,
    updated_by    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE production.mobile_settings IS
    'Singleton settings for the mobile app (e.g. Music Type minimum album count).';

-- ============================================================================
-- Seed — structure only (idempotent). The five categories in the required
-- order, the five fixed Music Types, and the singleton settings row. Category
-- membership is intentionally NOT seeded here: the read API derives defaults
-- from the manifest until an admin curates it.
-- ============================================================================
INSERT INTO production.mobile_categories (key, label, kind, display_order) VALUES
    ('home',            'Home',            'curated',    1),
    ('inspire_family',  'Inspire Family',  'personas',   2),
    ('family_friendly', 'Family Friendly', 'albums',     3),
    ('children',        'Children Music',  'albums',      4),
    ('music_type',      'Music Type',      'music_type', 5)
ON CONFLICT (key) DO NOTHING;

INSERT INTO production.mobile_music_types (genre, label, display_order, is_pinned) VALUES
    ('Contemporary',      'Contemporary',      1, TRUE),
    ('Praise & Worship',  'Praise & Worship',  2, TRUE),
    ('Country',           'Country',           3, TRUE),
    ('Pentecostal Shout', 'Pentecostal Shout', 4, TRUE),
    ('Gospel',            'Gospel',            5, TRUE)
ON CONFLICT (genre) DO NOTHING;

INSERT INTO production.mobile_settings (id, min_album_count) VALUES (1, 12)
ON CONFLICT (id) DO NOTHING;
