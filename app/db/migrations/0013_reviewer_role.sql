-- ============================================================================
-- 0013_reviewer_role.sql — Add the Jubilujah-native "reviewer" role
--
-- A `reviewer` previews in-production ("studio") albums that are hidden from
-- ordinary viewers and signed-out visitors. It is NOT minted from JubileeInspire
-- SSO (JI only maps user/admin/guest); admins grant it locally via /admin/users
-- and it is preserved across JI re-sync (see api/src/auth/session.js).
--
-- identity.user_roles.role carries an inline CHECK from 0001_init.sql; widen it
-- to include 'reviewer'. The constraint there is unnamed, so Postgres auto-named
-- it `user_roles_role_check`.
-- ============================================================================

ALTER TABLE identity.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE identity.user_roles
    ADD CONSTRAINT user_roles_role_check
    CHECK (role IN ('viewer','reviewer','content_editor','radio_producer','production_manager','admin'));
