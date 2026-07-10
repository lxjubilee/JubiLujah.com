-- 0026_section_show_genre.sql
-- Per-section "show primary genre" toggle. When TRUE on an album section, the
-- public /api/mobile/config flags the section `showGenre` and carries each album
-- item's primary genre, so the mobile app captions covers with the genre instead
-- of the album name. Defaults FALSE so existing sections keep showing names.
-- Only meaningful for kind = 'albums'; artists carry no genre. See
-- 0023_dynamic_sections.sql for the sections table.

ALTER TABLE production.mobile_sections
    ADD COLUMN IF NOT EXISTS show_genre BOOLEAN NOT NULL DEFAULT FALSE;
