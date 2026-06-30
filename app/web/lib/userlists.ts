'use client';
// Lightweight client-side "My List" and "Liked" sets (localStorage). Keeps the
// Netflix-style Add/Like actions instant and auth-free; can later be promoted to
// DB-backed lists (radio.playlists / production.ratings) for cross-device sync.
export const MY_LIST = 'jvMyList';
export const LIKED = 'jvLiked';

function read(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
}
function write(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* ignore */ }
}

export function has(key: string, code: string): boolean {
  return read(key).has(code);
}
export function toggle(key: string, code: string): boolean {
  const set = read(key);
  if (set.has(code)) set.delete(code); else set.add(code);
  write(key, set);
  return set.has(code);
}
