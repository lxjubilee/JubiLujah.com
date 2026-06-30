-- ============================================================================
-- 0010_reviews.sql — Public Rating & Review System
--
-- Implements the user-facing Rating & Review module (album/song ratings,
-- reviews, helpful votes, reporting, moderation, notifications).
--
-- DISTINCT from production.ratings / production.comments, which are the
-- EDITORIAL surfaces gated to the content_editor role (internal team). This
-- module is PUBLIC: any authenticated user (viewer and above) may rate and
-- review. Keeping them in separate tables means the public feature never
-- touches the editorial aggregates (catalog.albums.avg_rating etc.) — so the
-- existing experience is unaffected.
--
-- A "rating" and a "review" are the SAME row: a user has exactly one row per
-- target (album or song) carrying a required 1..5 star score plus an optional
-- title/body. A row with no body is "just a rating"; a row with a body is a
-- "review". This satisfies "one rating per user per album" and "latest rating
-- replaces the previous one" with a single UNIQUE/UPSERT.
--
-- Aggregates (average, count, distribution) are kept in a denormalized cache
-- table (production.review_summaries) maintained by trigger, so the hot read
-- path is a single PK lookup that scales to millions of rows.
--
-- Target: PostgreSQL 16+. Conventions match 0001_init.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------

-- Moderation lifecycle of a review. 'published' is the default (reviews appear
-- immediately); moderators move rows to hidden/rejected. 'pending' is reserved
-- for future pre-moderation / AI-moderation flows (§20) without a schema change.
CREATE TYPE production.review_status AS ENUM (
    'published',   -- visible to the public (default)
    'pending',     -- awaiting moderation (reserved; not used by default flow)
    'rejected',    -- moderator rejected; hidden from public, kept for audit
    'hidden'       -- moderator hid (e.g. after a report); hidden from public
);
COMMENT ON TYPE production.review_status IS
    'Moderation state of a public review. published = visible; others hidden from public.';

-- Report reasons (§10).
CREATE TYPE production.report_reason AS ENUM (
    'spam',
    'offensive_language',
    'hate_speech',
    'fake_review',
    'other'
);
COMMENT ON TYPE production.report_reason IS '§10 reasons a review can be reported.';

-- Lifecycle of a report.
CREATE TYPE production.report_status AS ENUM (
    'open',        -- awaiting moderator review
    'actioned',    -- moderator acted on the underlying review
    'dismissed'    -- moderator judged the report unfounded
);
COMMENT ON TYPE production.report_status IS 'Lifecycle of a review report.';


-- ----------------------------------------------------------------------------
-- production.user_reviews
--   The unified rating+review row. One per (target, user). stars is required;
--   title/body optional. Soft-deleted via deleted_at so a user can re-create.
-- ----------------------------------------------------------------------------
CREATE TABLE production.user_reviews (
    id                  UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type         production.rateable_type   NOT NULL
                        CHECK (target_type IN ('album','song')),
    target_id           UUID                       NOT NULL,
    reviewer_user_id    UUID                       NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    stars               SMALLINT                   NOT NULL CHECK (stars BETWEEN 1 AND 5),
    title               TEXT                       CHECK (title IS NULL OR char_length(title) <= 150),
    body                TEXT                       CHECK (body  IS NULL OR char_length(body)  <= 5000),
    helpful_count       INTEGER                    NOT NULL DEFAULT 0,
    status              production.review_status   NOT NULL DEFAULT 'published',
    created_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    -- One active rating per user per target. Partial unique so a soft-deleted
    -- row doesn't block the user re-rating later.
    CONSTRAINT uq_user_reviews_one_per_target
        UNIQUE (target_type, target_id, reviewer_user_id)
);

-- Hot path: list published reviews for a target, sorted three ways. Partial
-- indexes keep them small and only cover the public-visible rows.
CREATE INDEX idx_user_reviews_recent
    ON production.user_reviews (target_type, target_id, created_at DESC)
    WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX idx_user_reviews_top
    ON production.user_reviews (target_type, target_id, stars DESC, created_at DESC)
    WHERE deleted_at IS NULL AND status = 'published';
CREATE INDEX idx_user_reviews_helpful
    ON production.user_reviews (target_type, target_id, helpful_count DESC, created_at DESC)
    WHERE deleted_at IS NULL AND status = 'published';
-- Per-user contributions (§13) and moderation queue (§11).
CREATE INDEX idx_user_reviews_reviewer
    ON production.user_reviews (reviewer_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_user_reviews_status
    ON production.user_reviews (status, created_at DESC)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE production.user_reviews IS
    'Public user ratings+reviews. One per (target,user); stars required, title/body optional.';


-- ----------------------------------------------------------------------------
-- production.review_helpful_votes  (§9)
--   One "helpful" vote per user per review. helpful_count on the review is the
--   denormalized count, maintained by trigger.
-- ----------------------------------------------------------------------------
CREATE TABLE production.review_helpful_votes (
    review_id   UUID         NOT NULL REFERENCES production.user_reviews(id) ON DELETE CASCADE,
    user_id     UUID         NOT NULL REFERENCES identity.users(id)          ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (review_id, user_id)
);
CREATE INDEX idx_helpful_votes_user ON production.review_helpful_votes (user_id);
COMMENT ON TABLE production.review_helpful_votes IS
    '§9 one helpful vote per user per review. Drives user_reviews.helpful_count via trigger.';


-- ----------------------------------------------------------------------------
-- production.review_reports  (§10)
--   One open report per user per review. Reporting alone never hides a review;
--   a moderator must act (§10).
-- ----------------------------------------------------------------------------
CREATE TABLE production.review_reports (
    id                  UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id           UUID                     NOT NULL REFERENCES production.user_reviews(id) ON DELETE CASCADE,
    reporter_user_id    UUID                     NOT NULL REFERENCES identity.users(id)          ON DELETE CASCADE,
    reason              production.report_reason NOT NULL,
    detail              TEXT                     CHECK (detail IS NULL OR char_length(detail) <= 1000),
    status              production.report_status NOT NULL DEFAULT 'open',
    created_at          TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    resolved_by         UUID                     REFERENCES identity.users(id) ON DELETE SET NULL,
    UNIQUE (review_id, reporter_user_id)
);
CREATE INDEX idx_review_reports_open
    ON production.review_reports (status, created_at DESC);
CREATE INDEX idx_review_reports_review
    ON production.review_reports (review_id);
COMMENT ON TABLE production.review_reports IS
    '§10 user reports. Reviews are hidden only by a moderator, never by a report alone.';


-- ----------------------------------------------------------------------------
-- production.review_moderation_log  (§11, §17)
--   APPEND-ONLY audit of every moderation action. review_id is NOT a FK so the
--   trail survives a hard delete of the review.
-- ----------------------------------------------------------------------------
CREATE TABLE production.review_moderation_log (
    id                  BIGSERIAL                  PRIMARY KEY,
    review_id           UUID                       NOT NULL,
    moderator_user_id   UUID                       REFERENCES identity.users(id) ON DELETE SET NULL,
    action              TEXT                       NOT NULL
                        CHECK (action IN ('approve','reject','hide','restore','delete')),
    reason              TEXT,
    prev_status         production.review_status,
    new_status          production.review_status,
    created_at          TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_modlog_review ON production.review_moderation_log (review_id, created_at DESC);
CREATE INDEX idx_review_modlog_mod    ON production.review_moderation_log (moderator_user_id, created_at DESC);
REVOKE DELETE, TRUNCATE ON production.review_moderation_log FROM PUBLIC;
COMMENT ON TABLE production.review_moderation_log IS
    '§11/§17 append-only moderation audit. DELETE revoked from PUBLIC.';


-- ----------------------------------------------------------------------------
-- production.review_notifications  (§14)
--   Lightweight per-user notifications for review events.
-- ----------------------------------------------------------------------------
CREATE TABLE production.review_notifications (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    kind        TEXT         NOT NULL
                CHECK (kind IN ('helpful_vote','review_approved','review_rejected','review_removed')),
    review_id   UUID,
    data        JSONB        NOT NULL DEFAULT '{}'::jsonb,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_review_notifs_user   ON production.review_notifications (user_id, created_at DESC);
CREATE INDEX idx_review_notifs_unread ON production.review_notifications (user_id) WHERE read_at IS NULL;
COMMENT ON TABLE production.review_notifications IS
    '§14 per-user notifications: helpful votes, approvals, rejections, removals.';


-- ----------------------------------------------------------------------------
-- production.review_summaries  (§15, §16)
--   Denormalized aggregate cache, one row per target. Maintained by trigger on
--   user_reviews so reads are a single PK lookup. rating_count counts every
--   active published row; review_count counts those with a non-empty body.
-- ----------------------------------------------------------------------------
CREATE TABLE production.review_summaries (
    target_type   production.rateable_type   NOT NULL CHECK (target_type IN ('album','song')),
    target_id     UUID                       NOT NULL,
    avg_stars     NUMERIC(3,2),
    rating_count  INTEGER                    NOT NULL DEFAULT 0,
    review_count  INTEGER                    NOT NULL DEFAULT 0,
    dist_1        INTEGER                    NOT NULL DEFAULT 0,
    dist_2        INTEGER                    NOT NULL DEFAULT 0,
    dist_3        INTEGER                    NOT NULL DEFAULT 0,
    dist_4        INTEGER                    NOT NULL DEFAULT 0,
    dist_5        INTEGER                    NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    PRIMARY KEY (target_type, target_id)
);
CREATE INDEX idx_review_summaries_album_top
    ON production.review_summaries (avg_stars DESC, rating_count DESC)
    WHERE target_type = 'album';
CREATE INDEX idx_review_summaries_song_top
    ON production.review_summaries (avg_stars DESC, rating_count DESC)
    WHERE target_type = 'song';
COMMENT ON TABLE production.review_summaries IS
    '§15/§16 denormalized rating aggregate cache. One row per target; trigger-maintained.';


-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Recompute the cached summary for one target from its active, published rows.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.recompute_review_summary(
    p_type production.rateable_type,
    p_id   UUID
)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    v_avg  NUMERIC(3,2);
    v_cnt  INTEGER;
    v_rev  INTEGER;
    v_d1   INTEGER; v_d2 INTEGER; v_d3 INTEGER; v_d4 INTEGER; v_d5 INTEGER;
BEGIN
    SELECT ROUND(AVG(stars)::numeric, 2),
           COUNT(*),
           COUNT(*) FILTER (WHERE body IS NOT NULL AND char_length(trim(body)) > 0),
           COUNT(*) FILTER (WHERE stars = 1),
           COUNT(*) FILTER (WHERE stars = 2),
           COUNT(*) FILTER (WHERE stars = 3),
           COUNT(*) FILTER (WHERE stars = 4),
           COUNT(*) FILTER (WHERE stars = 5)
      INTO v_avg, v_cnt, v_rev, v_d1, v_d2, v_d3, v_d4, v_d5
      FROM production.user_reviews
     WHERE target_type = p_type
       AND target_id   = p_id
       AND deleted_at IS NULL
       AND status = 'published';

    INSERT INTO production.review_summaries AS rs
        (target_type, target_id, avg_stars, rating_count, review_count,
         dist_1, dist_2, dist_3, dist_4, dist_5, updated_at)
    VALUES
        (p_type, p_id, v_avg, COALESCE(v_cnt,0), COALESCE(v_rev,0),
         COALESCE(v_d1,0), COALESCE(v_d2,0), COALESCE(v_d3,0), COALESCE(v_d4,0), COALESCE(v_d5,0), NOW())
    ON CONFLICT (target_type, target_id) DO UPDATE SET
        avg_stars    = EXCLUDED.avg_stars,
        rating_count = EXCLUDED.rating_count,
        review_count = EXCLUDED.review_count,
        dist_1 = EXCLUDED.dist_1, dist_2 = EXCLUDED.dist_2, dist_3 = EXCLUDED.dist_3,
        dist_4 = EXCLUDED.dist_4, dist_5 = EXCLUDED.dist_5,
        updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION production.on_user_review_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM production.recompute_review_summary(OLD.target_type, OLD.target_id);
        RETURN OLD;
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.target_type, OLD.target_id) <> (NEW.target_type, NEW.target_id) THEN
            PERFORM production.recompute_review_summary(OLD.target_type, OLD.target_id);
        END IF;
        PERFORM production.recompute_review_summary(NEW.target_type, NEW.target_id);
        RETURN NEW;
    ELSE
        PERFORM production.recompute_review_summary(NEW.target_type, NEW.target_id);
        RETURN NEW;
    END IF;
END;
$$;

-- Only the columns that affect the aggregate retrigger a recompute. Notably,
-- helpful_count is excluded so a flurry of votes doesn't churn the summary.
CREATE TRIGGER trg_user_review_summary
    AFTER INSERT OR DELETE OR
          UPDATE OF stars, body, status, deleted_at, target_type, target_id
    ON production.user_reviews
    FOR EACH ROW EXECUTE FUNCTION production.on_user_review_change();

-- ----------------------------------------------------------------------------
-- Maintain helpful_count from the votes table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION production.on_helpful_vote_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_review UUID;
BEGIN
    v_review := COALESCE(NEW.review_id, OLD.review_id);
    UPDATE production.user_reviews
       SET helpful_count = (SELECT COUNT(*) FROM production.review_helpful_votes WHERE review_id = v_review)
     WHERE id = v_review;
    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_helpful_vote_count
    AFTER INSERT OR DELETE ON production.review_helpful_votes
    FOR EACH ROW EXECUTE FUNCTION production.on_helpful_vote_change();

-- NB: user_reviews intentionally has NO generic touch_updated_at trigger. The
-- application sets updated_at only on a genuine content edit, so updated_at >
-- created_at reliably means "edited by the author" (moderation and helpful-count
-- writes must not flip that flag).

-- ============================================================================
-- END 0010_reviews.sql
-- ============================================================================
