-- ============================================================================
-- 0033 · Remember that an account was DELETED, so single sign-on never quietly
-- brings it back.
--
-- Founder direction, 2026-09-16: single sign-on across the Jubilee family must be
-- single. Anyone with a Jubilee ID who arrives here signed in elsewhere is signed
-- in — and "if they have a Jubilee ID within the ecosystem, it should auto-create
-- an account for them within this jubileepraise.com system as well."
--
-- The silent check (web middleware ASK) now creates that account. But accounts
-- here are HARD-deleted (purgeUserAccount), so without a record of the deletion
-- the very next page load after someone deleted their account would ask the SSO,
-- get their still-live Jubilee ID, and create the account again — they would be
-- unable to leave. This is that record.
--
-- ONLY A HASH OF THE EMAIL. The point of deleting an account is that the site
-- stops holding it; a tombstone that kept the address would undo that. A SHA-256
-- of the lower-cased address is enough to answer "did this person delete their
-- account here?" and nothing more.
--
-- Consulted ONLY when a silent check finds no account. Following a sibling site's
-- link in, or signing up, is a deliberate choice to be here and is never blocked.
-- Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity.account_tombstones (
    email_sha256  TEXT         PRIMARY KEY,
    deleted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE identity.account_tombstones IS
  'SHA-256 (hex) of the lower-cased email of every deleted account. Stops the SSO silent check '
  'from recreating an account its owner deleted. Written by purgeUserAccount. See 0033.';
