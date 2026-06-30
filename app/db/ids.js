'use strict';
// ============================================================================
// Deterministic catalog identity — shared by db/ scripts and the API.
// The manifest is authoritative for the catalog; Postgres editorial tables key
// off a deterministic UUIDv5 derived from the album code (+ track number) so the
// same album/song always maps to the same UUID on both web and api.
// ============================================================================
const { v5: uuidv5 } = require('uuid');

// Fixed application namespace. Do NOT change — it would orphan existing rows.
const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';

function albumUuid(code) {
  return uuidv5('album:' + String(code).toUpperCase(), JV_NAMESPACE);
}
function songUuid(code, trackNumber) {
  return uuidv5('song:' + String(code).toUpperCase() + ':' + String(trackNumber), JV_NAMESPACE);
}
function artistUuid(slug) {
  return uuidv5('artist:' + String(slug).toLowerCase(), JV_NAMESPACE);
}

module.exports = { JV_NAMESPACE, albumUuid, songUuid, artistUuid };
