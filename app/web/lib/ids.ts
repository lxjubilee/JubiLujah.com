import { v5 as uuidv5 } from 'uuid';

// MUST match app/api/src/ids.js and app/db/ids.js — identical namespace + scheme.
export const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';

export const albumUuid = (code: string) =>
  uuidv5('album:' + String(code).toUpperCase(), JV_NAMESPACE);
export const songUuid = (code: string, n: number | string) =>
  uuidv5('song:' + String(code).toUpperCase() + ':' + String(n), JV_NAMESPACE);
export const artistUuid = (slug: string) =>
  uuidv5('artist:' + String(slug).toLowerCase(), JV_NAMESPACE);
