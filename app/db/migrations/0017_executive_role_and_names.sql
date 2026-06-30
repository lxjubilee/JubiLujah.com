-- ============================================================================
-- 0017_executive_role_and_names.sql
--
-- Two admin/user-management changes (see /admin/users):
--
-- 1) First/last name. identity.users only stored a single `display_name`. Add
--    `first_name` + `last_name` so admins can edit them independently; keep
--    `display_name` as the derived "First Last" used everywhere else (tokens,
--    UI). Backfill names from the existing display_name (first token = first
--    name, remainder = last name) as a best-effort.
--
-- 2) Role consolidation. The grantable roles are now exactly:
--       reviewer, content_editor, executive, admin
--    (every account keeps the baseline `viewer` = view + play, which is never
--    removable). The two legacy mid-tier roles `radio_producer` and
--    `production_manager` collapse into the single new `executive` role:
--    anyone who had either is granted `executive`, and the old rows are dropped.
--    The CHECK constraint is rewritten to the final five-role set.
--
-- NOTE: the migration runner (db/run-migrations.js) wraps this file in its own
-- transaction, so no explicit BEGIN/COMMIT here.
-- ============================================================================

-- 1) Names --------------------------------------------------------------------
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE identity.users ADD COLUMN IF NOT EXISTS last_name  TEXT;

UPDATE identity.users
   SET first_name = NULLIF(split_part(display_name, ' ', 1), ''),
       last_name  = NULLIF(trim(substr(display_name, length(split_part(display_name, ' ', 1)) + 1)), '')
 WHERE first_name IS NULL AND last_name IS NULL;

-- 2) Roles --------------------------------------------------------------------
-- Drop the CHECK first so the data migration can write 'executive' and so the
-- legacy values can be removed without tripping the old constraint.
ALTER TABLE identity.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- Grant `executive` to every holder of a legacy mid-tier role, then drop the old rows.
INSERT INTO identity.user_roles (user_id, role, granted_by)
SELECT DISTINCT user_id, 'executive', granted_by
  FROM identity.user_roles
 WHERE role IN ('radio_producer', 'production_manager')
ON CONFLICT DO NOTHING;

DELETE FROM identity.user_roles WHERE role IN ('radio_producer', 'production_manager');

-- Final five-role set: baseline viewer + the four grantable roles.
ALTER TABLE identity.user_roles
    ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('viewer', 'reviewer', 'content_editor', 'executive', 'admin'));
