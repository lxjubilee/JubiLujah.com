-- ============================================================================
-- 0022_mobile_hero.sql — Per-page hero banner for the mobile app
--
-- Extends the Mobile App Settings curation layer (0021) with an admin-managed
-- HERO banner that is scoped PER PAGE (per mobile_categories row). Each page can
-- opt in (hero_enabled) and carry an ordered set of hero slides. A slide points
-- at a catalog album (album_ref = album_code); headline/subtitle are optional
-- overrides, and starts_at/ends_at give an optional scheduling window (e.g. a
-- seasonal banner). Read by GET /api/mobile/config; managed from the admin
-- "Mobile App Settings → Pages" screen.
--
-- Target: PostgreSQL 16+. Conventions match 0021_mobile_app_settings.sql.
-- ============================================================================

-- Per-page opt-in: does this page show a hero carousel at all?
ALTER TABLE production.mobile_categories
    ADD COLUMN IF NOT EXISTS hero_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS production.mobile_hero_slides (
    id            BIGSERIAL   PRIMARY KEY,
    category_id   BIGINT      NOT NULL REFERENCES production.mobile_categories(id) ON DELETE CASCADE,
    album_ref     TEXT        NOT NULL,          -- album_code the slide showcases
    headline      TEXT,                          -- optional; else the app uses the album title
    subtitle      TEXT,                          -- optional; else the app uses artist · year
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    starts_at     TIMESTAMPTZ,                   -- optional schedule window (NULL = always)
    ends_at       TIMESTAMPTZ,
    updated_by    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mobhero_cat ON production.mobile_hero_slides (category_id, display_order);
COMMENT ON TABLE production.mobile_hero_slides IS
    'Per-page hero banner slides for the mobile app (album-backed, ordered, schedulable).';
