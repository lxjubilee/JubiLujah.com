-- 0009_account_deletion_fks.sql
-- Make account self-deletion robust.
--
-- DELETE /api/auth/account hard-deletes identity.users. Several "actor / creator
-- / granter" references to that table were ON DELETE NO ACTION and NOT cleared by
-- the delete handler, so a user who had granted a role to someone else, published,
-- awarded, created a radio playlist, or appeared in pipeline history could NOT be
-- deleted: DELETE FROM identity.users raised a FK violation and the whole
-- transaction rolled back -- leaving the account in the DB ("still exists").
--
-- Switch these 5 FKs to ON DELETE SET NULL so the user row can be removed while
-- their authored/historical rows survive with a null actor. The four NOT NULL
-- columns are made nullable to allow the SET NULL. (The other user references --
-- ratings/comments/nominations + audit_log/pipeline_state/assets -- are already
-- handled in the delete handler.)
--
-- NOTE: the migration runner (db/run-migrations.js) wraps this file in its own
-- transaction, so no explicit BEGIN/COMMIT here.

-- identity.user_roles.granted_by (already nullable) -> SET NULL
ALTER TABLE identity.user_roles DROP CONSTRAINT IF EXISTS user_roles_granted_by_fkey;
ALTER TABLE identity.user_roles
  ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by)
  REFERENCES identity.users(id) ON DELETE SET NULL;

-- production.pipeline_history.actor_user_id
ALTER TABLE production.pipeline_history ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE production.pipeline_history DROP CONSTRAINT IF EXISTS pipeline_history_actor_user_id_fkey;
ALTER TABLE production.pipeline_history
  ADD CONSTRAINT pipeline_history_actor_user_id_fkey FOREIGN KEY (actor_user_id)
  REFERENCES identity.users(id) ON DELETE SET NULL;

-- production.publications.published_by
ALTER TABLE production.publications ALTER COLUMN published_by DROP NOT NULL;
ALTER TABLE production.publications DROP CONSTRAINT IF EXISTS publications_published_by_fkey;
ALTER TABLE production.publications
  ADD CONSTRAINT publications_published_by_fkey FOREIGN KEY (published_by)
  REFERENCES identity.users(id) ON DELETE SET NULL;

-- production.awards.awarded_by
ALTER TABLE production.awards ALTER COLUMN awarded_by DROP NOT NULL;
ALTER TABLE production.awards DROP CONSTRAINT IF EXISTS awards_awarded_by_fkey;
ALTER TABLE production.awards
  ADD CONSTRAINT awards_awarded_by_fkey FOREIGN KEY (awarded_by)
  REFERENCES identity.users(id) ON DELETE SET NULL;

-- radio.playlists.created_by
ALTER TABLE radio.playlists ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE radio.playlists DROP CONSTRAINT IF EXISTS playlists_created_by_fkey;
ALTER TABLE radio.playlists
  ADD CONSTRAINT playlists_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES identity.users(id) ON DELETE SET NULL;
