-- ============================================================================
-- 0035 · JubileePraise database — brand-bearing DATA rewritten for the new name.
--
-- Owner direction, 2026-09-17: clone the schema and data from the Jubilujah
-- database into a new `jubileepraise` database and make the references fit
-- JubileePraise. The schema needs nothing — no table, column or enum carries
-- the old name. What does carry it is DATA the API wrote under the old brand,
-- and this migration rewrites exactly those rows and nothing else.
--
-- Rewritten:
--   identity.users.external_subject          'jubilujah|<email>' → 'jubileepraise|<email>'
--                                            (a tag only — nothing looks a user up by it;
--                                            routes/auth.js has minted the new form since
--                                            the rename, so old and new signups now match)
--   production.mobile_app_versions.title/message   "…Jubilujah…" → "…JubileePraise…"
--                                            (the in-app update prompt the mobile API serves)
--   production.subscription_notifications.title/body  same, the "Welcome to Jubilujah …" rows
--   redirector.assets.title                  the "Jubilujah · Album Cover (demo)" seed row
--   redirector.*  https://[www.]jubilujah.com/…  → https://www.jubileepraise.com/…
--                                            in storage_url, cover_image_url, landing and
--                                            device-route JSON (the site's own URLs only)
--
-- Deliberately NOT rewritten (each is a name registered outside this database):
--   * `cd.jubilujah.com` — the live music CDN host; cd.jubileepraise.com has no DNS
--     (CLAUDE.md "Drives and paths"). Album/song CDN paths and redirector storage_url
--     values on that host stay exactly as they are.
--   * The JEIM1069 album and its songs titled "Jubilujah" (DECISIONS D-2026-08-27)
--     — a song title, not a brand string.
--   * App-store URLs (`com.jubilujah.app`, `apps.apple.com/app/jubilujah`) — the
--     published package ids of the mobile apps.
--   * identity.audit_log — append-only history.
--   * production.music_activity_log — append-only history.
--
-- Idempotent: every statement is a no-op once the old form is gone.
-- ============================================================================

-- Local-signup identity tags.
UPDATE identity.users
   SET external_subject = 'jubileepraise|' || substr(external_subject, length('jubilujah|') + 1),
       updated_at = NOW()
 WHERE external_subject LIKE 'jubilujah|%';

-- Mobile update prompt (served by routes/appVersion.js).
UPDATE production.mobile_app_versions
   SET title   = regexp_replace(title,   'Jubi[lL]ujah', 'JubileePraise', 'g'),
       message = regexp_replace(message, 'Jubi[lL]ujah', 'JubileePraise', 'g'),
       updated_at = NOW()
 WHERE title ~ 'Jubi[lL]ujah' OR message ~ 'Jubi[lL]ujah';

-- Subscription notifications shown in the account inbox.
UPDATE production.subscription_notifications
   SET title = regexp_replace(title, 'Jubi[lL]ujah', 'JubileePraise', 'g'),
       body  = regexp_replace(body,  'Jubi[lL]ujah', 'JubileePraise', 'g')
 WHERE title ~ 'Jubi[lL]ujah' OR body ~ 'Jubi[lL]ujah';

-- Redirector demo asset title (seeded by 0021 as "Jubilujah · Album Cover (demo)").
UPDATE redirector.assets
   SET title = regexp_replace(title, 'Jubi[lL]ujah', 'JubileePraise', 'g'),
       updated_at = NOW()
 WHERE title ~ 'Jubi[lL]ujah';

-- Redirector destinations that point at the SITE (not the CDN). The host pattern
-- is anchored so `cd.jubilujah.com` can never match.
UPDATE redirector.assets
   SET storage_url     = regexp_replace(storage_url,     '^https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com'),
       cover_image_url = regexp_replace(cover_image_url, '^https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com'),
       updated_at = NOW()
 WHERE storage_url     ~ '^https?://(www\.)?jubilujah\.com'
    OR cover_image_url ~ '^https?://(www\.)?jubilujah\.com';

UPDATE redirector.taxonomy_nodes
   SET cover_image_url = regexp_replace(cover_image_url, '^https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com')
 WHERE cover_image_url ~ '^https?://(www\.)?jubilujah\.com';

UPDATE redirector.tokens
   SET device_routes_json  = regexp_replace(device_routes_json::text,  'https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com', 'g')::jsonb
 WHERE device_routes_json::text ~ 'https?://(www\.)?jubilujah\.com';

UPDATE redirector.tokens
   SET landing_config_json = regexp_replace(landing_config_json::text, 'https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com', 'g')::jsonb
 WHERE landing_config_json::text ~ 'https?://(www\.)?jubilujah\.com';

UPDATE redirector.rules
   SET parameters_json = regexp_replace(parameters_json::text, 'https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com', 'g')::jsonb,
       pool_json       = regexp_replace(pool_json::text,       'https?://(www\.)?jubilujah\.com', 'https://www.jubileepraise.com', 'g')::jsonb
 WHERE parameters_json::text ~ 'https?://(www\.)?jubilujah\.com'
    OR pool_json::text       ~ 'https?://(www\.)?jubilujah\.com';
