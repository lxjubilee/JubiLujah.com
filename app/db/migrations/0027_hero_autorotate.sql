-- 0027_hero_autorotate.sql
-- Per-page "auto rotate hero" toggle. When TRUE on a category whose hero is
-- enabled, the public /api/mobile/config ignores the admin's manually-picked hero
-- slides and instead features ONE Inspire Persona album per day, advancing through
-- a fixed 12-persona sequence and cycling (see api/src/services/heroRotation.js).
-- Defaults FALSE so every existing manual hero keeps its curated slides. The manual
-- slides stay in mobile_hero_slides and resume the moment this is turned back off.
-- See 0022_mobile_hero.sql for hero_enabled + the mobile_hero_slides table.

ALTER TABLE production.mobile_categories
    ADD COLUMN IF NOT EXISTS hero_autorotate BOOLEAN NOT NULL DEFAULT FALSE;
