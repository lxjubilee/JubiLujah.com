-- ============================================================================
-- Seed: full 101-station HM-band roster (HM 300.00 .. 399.90).
-- The base schema seeds 8 hand-named stations; this fills out the remaining
-- channels programmatically. ON CONFLICT keeps the named ones intact.
--
-- 101 channels: 300.00, 301.00, ... 399.00 (100 integer channels) + 399.90.
-- ============================================================================
DO $$
DECLARE
    i      INTEGER;
    freq   NUMERIC(6,2);
    sign   TEXT;
BEGIN
    FOR i IN 0..99 LOOP
        freq := 300.00 + i;                       -- 300.00 .. 399.00
        sign := 'HM ' || to_char(freq, 'FM999.00');
        INSERT INTO radio.stations (call_sign, display_name, description, frequency, genre_anchors)
        VALUES (
            sign,
            'Jubilee Channel ' || to_char(freq, 'FM999.00'),
            'Auto-provisioned HM-band station.',
            freq,
            ARRAY['worship']
        )
        ON CONFLICT (call_sign) DO NOTHING;
    END LOOP;

    -- The 101st channel: HM 399.90
    INSERT INTO radio.stations (call_sign, display_name, description, frequency, genre_anchors)
    VALUES ('HM 399.90', 'Apostolic Commissioning', 'Commissioning, impartation, and sending songs.', 399.90, ARRAY['apostolic','commissioning'])
    ON CONFLICT (call_sign) DO NOTHING;
END $$;
