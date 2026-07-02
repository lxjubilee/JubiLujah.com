-- ============================================================================
-- 0020_mobile_app_versions.sql — latest published mobile-app version per
-- platform, used by the public GET /api/app-version/check endpoint so the
-- mobile app can prompt users to update. One row per platform. Bump
-- `latest_version` to offer an (optional) update; set `mandatory = TRUE` or
-- raise `min_supported_version` above a build to force it. `store_url` is the
-- App Store / Play Store link the "Update" button opens.
-- ============================================================================
CREATE TABLE IF NOT EXISTS production.mobile_app_versions (
    platform              TEXT          PRIMARY KEY CHECK (platform IN ('ios', 'android')),
    latest_version        TEXT          NOT NULL,   -- e.g. "2.1.0"
    min_supported_version TEXT          NOT NULL,   -- builds below this get a mandatory update
    store_url             TEXT          NOT NULL,   -- App Store / Play Store link
    title                 TEXT,                     -- optional popup title override
    message               TEXT,                     -- optional popup message override
    mandatory             BOOLEAN       NOT NULL DEFAULT FALSE, -- force-update override flag
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE production.mobile_app_versions IS 'Latest mobile-app version per platform for the in-app update prompt (public /api/app-version/check).';

-- Seed with the CURRENT shipping version (2.0.0) so no update is prompted until
-- `latest_version` is bumped. Idempotent: re-running the migration leaves any
-- values an operator has since changed untouched.
INSERT INTO production.mobile_app_versions (platform, latest_version, min_supported_version, store_url)
VALUES
  ('android', '2.0.0', '1.0.0', 'https://play.google.com/store/apps/details?id=com.jubilujah.app'),
  ('ios',     '2.0.0', '1.0.0', 'https://apps.apple.com/app/id6781227388')
ON CONFLICT (platform) DO NOTHING;
