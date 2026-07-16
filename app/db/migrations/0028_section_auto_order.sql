-- 0028_section_auto_order.sql
-- Per-section "auto order" toggle. When TRUE on an albums section, the public
-- /api/mobile/config presents that section's albums in a deterministic order that
-- reshuffles every 24h (UTC) — a pure permutation, so every curated album stays
-- visible; only the order changes (see api/src/services/sectionOrder.js). Defaults
-- FALSE so existing sections keep their admin-dragged order. The saved manual order
-- stays in mobile_category_items and resumes the moment this is turned back off.
-- Only meaningful for kind = 'albums'; artists sections ignore it. See
-- 0023_dynamic_sections.sql for the sections table and 0026_section_show_genre.sql
-- for the sibling per-section toggle this mirrors.

ALTER TABLE production.mobile_sections
    ADD COLUMN IF NOT EXISTS auto_order BOOLEAN NOT NULL DEFAULT FALSE;
