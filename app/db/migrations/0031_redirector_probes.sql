-- ============================================================================
-- 0031_redirector_probes.sql — unknown-token probe log (spec §9.5 / §17.1).
--
-- Phase 9 (analytics). Unknown /r/ lookups are a security signal ("enumeration
-- of sequential guesses"); scan_events only records KNOWN tokens, so probes need
-- their own tiny append-only table to be reportable. Privacy: never a raw IP —
-- the same daily-salted SHA-256 hash used by scan_events (§17.3).
-- ============================================================================
CREATE TABLE IF NOT EXISTS redirector.probe_events (
    event_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ip_hash     CHAR(64),
    input       VARCHAR(24),   -- the (truncated) unknown token/alias that was tried
    user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_rdr_probe_time ON redirector.probe_events (occurred_at);

COMMENT ON TABLE redirector.probe_events IS
    'Unknown-token probe attempts (enumeration signal), append-only, hashed IP only (spec §9.5/§17.1).';
