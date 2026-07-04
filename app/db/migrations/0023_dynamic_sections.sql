-- ============================================================================
-- 0023_dynamic_sections.sql — Dynamic sections under each mobile page
--
-- Adds a SECTION layer between a page (mobile_categories) and its items. A page
-- now holds any number of named, ordered sections; each section is typed
-- (artists | albums) and the app renders it in that fixed layout (artists as
-- circular avatars, albums as square covers). Items (mobile_category_items) move
-- from belonging directly to a page to belonging to a SECTION.
--
-- Pages themselves (mobile_categories) were a fixed seed; they are now fully
-- admin-managed (create / rename / reorder / delete) — no schema change needed
-- for that, only the admin routes.
--
-- Target: PostgreSQL 16+. Conventions match 0021_mobile_app_settings.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- production.mobile_sections — named, typed rows within a page
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS production.mobile_sections (
    id            BIGSERIAL   PRIMARY KEY,
    category_id   BIGINT      NOT NULL REFERENCES production.mobile_categories(id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,          -- admin-typed section title, e.g. "Featured Artists"
    kind          TEXT        NOT NULL CHECK (kind IN ('artists','albums')),
    display_order INTEGER     NOT NULL DEFAULT 0,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    updated_by    UUID        REFERENCES identity.users(id) ON DELETE SET NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mobsec_cat ON production.mobile_sections (category_id, display_order);
COMMENT ON TABLE production.mobile_sections IS
    'Named, typed (artists|albums) sections within a mobile page; hold ordered items.';

-- ----------------------------------------------------------------------------
-- Re-point items to a section. Items keep category_id (denormalized, handy for
-- cascade/queries) and gain section_id. Membership uniqueness moves to the
-- section scope so the same artist/album can appear on different pages/sections.
-- ----------------------------------------------------------------------------
ALTER TABLE production.mobile_category_items
    ADD COLUMN IF NOT EXISTS section_id BIGINT REFERENCES production.mobile_sections(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_mobitem_sec ON production.mobile_category_items (section_id, display_order);

ALTER TABLE production.mobile_category_items
    DROP CONSTRAINT IF EXISTS mobile_category_items_category_id_item_type_item_ref_key;
ALTER TABLE production.mobile_category_items
    DROP CONSTRAINT IF EXISTS mobile_category_items_section_item_key;
ALTER TABLE production.mobile_category_items
    ADD  CONSTRAINT mobile_category_items_section_item_key UNIQUE (section_id, item_type, item_ref);
