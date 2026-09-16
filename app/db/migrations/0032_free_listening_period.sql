-- ============================================================================
-- 0032 · The free plan lasts 30 days, then it asks for a subscription.
--
-- Founder direction, 2026-09-16: a signed-in listener on the free plan keeps the
-- existing 36 full songs a day (0025) — but for 30 days, not forever. After that
-- every play is refused and the upgrade prompt asks them to start a subscription,
-- "because we don't want them listening to 36 songs forever, but we do want them
-- to be able to support this ministry."
--
-- TWO PIECES, AND BOTH ARE DATA, NOT CODE:
--
--   subscription_plans.free_access_days  — how long the plan lasts. NULL means
--       forever, which is what every plan was until now and what the paid plans
--       stay. A number on the plan row rather than a constant in the API, so the
--       30 can be changed without a deploy.
--
--   free_listening_periods               — when each listener's 30 days began.
--
-- 🔴 THE CLOCK STARTS ON THE FIRST PLAY AFTER THIS SHIPS, NOT AT SIGN-UP.
-- identity.users.created_at was the obvious anchor and it is the wrong one:
--   · partner provisioning creates rows for people who have never visited;
--   · the row is shared by every site on this API, so it can predate this one;
--   · and everyone who signed up more than 30 days ago would be locked out the
--     moment this migration ran, having been given no warning at all.
-- A row here is written by the first play that needs one, so a listener who has
-- signed in but not yet played has not spent any of their 30 days — and every
-- existing listener gets a full, fresh 30 days from their next song.
--
-- A SEPARATE TABLE, NOT A COLUMN ON identity.users. That table is shared with the
-- SSO bridge and partner provisioning; a billing date does not belong in identity.
--
-- Idempotent throughout: production's migration history is incomplete (several
-- files were applied by hand and never recorded), so this must be safe to run on a
-- database in any state, and safe to run twice.
-- ============================================================================

ALTER TABLE production.subscription_plans
  ADD COLUMN IF NOT EXISTS free_access_days INTEGER
    CHECK (free_access_days IS NULL OR free_access_days > 0);

COMMENT ON COLUMN production.subscription_plans.free_access_days IS
  'Days a listener may use this plan before being asked to subscribe. NULL = no end. '
  'Counted from production.free_listening_periods.started_at.';

UPDATE production.subscription_plans
   SET free_access_days = 30
 WHERE code = 'free' AND free_access_days IS NULL;

CREATE TABLE IF NOT EXISTS production.free_listening_periods (
    user_id     UUID         PRIMARY KEY REFERENCES identity.users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE production.free_listening_periods IS
  'When each listener''s free period began: the first play that needed one. See 0032.';
