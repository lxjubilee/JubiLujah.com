import { v5 as uuidv5 } from 'uuid';

// MUST match app/db/ids.js and app/web/lib/ids.ts — same namespace + scheme so
// album/song UUIDs are identical across db importer, API, and web client.
export const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';

export const albumUuid = (code) => uuidv5('album:' + String(code).toUpperCase(), JV_NAMESPACE);
export const songUuid = (code, n) => uuidv5('song:' + String(code).toUpperCase() + ':' + String(n), JV_NAMESPACE);
export const artistUuid = (slug) => uuidv5('artist:' + String(slug).toLowerCase(), JV_NAMESPACE);

// Validate a string is a UUID (used to guard polymorphic rateable_id inputs).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);
