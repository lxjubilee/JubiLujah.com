-- ============================================================================
-- Seed: award periods for the current cycle.
-- Opens one annual nomination window per active category for 2026.
-- Idempotent via ON CONFLICT (category_id, year).
-- ============================================================================
INSERT INTO production.award_periods (category_id, year, opens_at, closes_at, status)
SELECT c.id,
       2026,
       TIMESTAMPTZ '2026-01-01 00:00:00+00',
       TIMESTAMPTZ '2026-12-31 23:59:59+00',
       'open'
  FROM production.award_categories c
 WHERE c.active
ON CONFLICT (category_id, year) DO NOTHING;
