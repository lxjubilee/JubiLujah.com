-- 0025_free_plan_daily_36.sql
-- Raise the Free-plan daily full-song allowance from 7 to 36. After the daily
-- limit is reached, playback falls back to the existing preview_seconds (60s)
-- 1-minute preview until the user upgrades. See 0014_subscriptions.sql for the
-- plan catalog + daily_listening_counters enforcement.

UPDATE production.subscription_plans
   SET daily_song_limit = 36,
       features = '["Listen to up to 36 full songs every day", "1-minute previews after your daily 36", "Browse all albums, artists, playlists & lyrics", "Ratings & reviews included", "Daily limit resets at midnight"]'
 WHERE code = 'free';
