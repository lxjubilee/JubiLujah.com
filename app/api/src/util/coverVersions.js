// Reads/writes public/music/cover-versions.json ({ code: version }) — the shared
// cache-bust map. The API rewrites it from production.cover_updates whenever a
// cover is replaced; the web (lib/covers) reads it to append ?v=<version> to
// cover URLs so a new cover shows past the 1-year immutable CDN cache.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { query } from '../db.js';

const FILE = path.join(path.dirname(config.manifestPath), 'cover-versions.json');

export async function rewriteCoverVersions() {
  const r = await query('SELECT album_code, version FROM production.cover_updates');
  const versions = {};
  for (const row of r.rows) versions[row.album_code] = row.version;
  fs.writeFileSync(FILE, JSON.stringify({ generated: new Date().toISOString(), versions }, null, 2));
  return versions;
}

let cache = { versions: {}, mtime: 0 };
export function coverVersion(code) {
  try {
    const st = fs.statSync(FILE);
    if (st.mtimeMs !== cache.mtime) {
      cache = { versions: JSON.parse(fs.readFileSync(FILE, 'utf8')).versions || {}, mtime: st.mtimeMs };
    }
  } catch { /* no file yet */ }
  return cache.versions[String(code).toUpperCase()] || 0;
}
