-- ============================================================================
-- 0034 · A song can be LIKED (👍) and, separately, made a FAVORITE (♥).
--
-- Owner direction, 2026-09-16: the footer player gets a thumbs-up left of Back
-- and a heart right of Next, "so users will have the ability to rate these songs
-- … and we can start collecting ratings for these songs." Two opinions, held
-- independently (kJubilee keeps its `vote` and `favorite` the same way), so a
-- listener can like a song without favoriting it and the reverse.
--
-- production.user_likes already allows songs; it gains a `kind`. Every existing
-- row is a like. The primary key widens so the same song may carry both kinds.
-- Idempotent.
-- ============================================================================

ALTER TABLE production.user_likes
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'like';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_likes_kind_check' AND conrelid = 'production.user_likes'::regclass
  ) THEN
    ALTER TABLE production.user_likes
      ADD CONSTRAINT user_likes_kind_check CHECK (kind IN ('like', 'favorite'));
  END IF;

  -- Widen the key only once: (user, type, target) -> (user, type, target, kind).
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'user_likes_pkey' AND conrelid = 'production.user_likes'::regclass
       AND pg_get_constraintdef(oid) NOT ILIKE '%kind%'
  ) THEN
    ALTER TABLE production.user_likes DROP CONSTRAINT user_likes_pkey;
    ALTER TABLE production.user_likes ADD PRIMARY KEY (user_id, target_type, target_id, kind);
  END IF;
END $$;

COMMENT ON COLUMN production.user_likes.kind IS
  '''like'' (the footer 👍, and every album like) or ''favorite'' (the footer ♥). See 0034.';
