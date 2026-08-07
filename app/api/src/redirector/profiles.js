'use strict';
// ============================================================================
// Domain profile loaders — software/redirector.md §13.
//
// Each domain ships a taxonomy.profile.json and a qr.style.json; the admin
// console renders itself from these, so adding a new domain means writing two
// profiles, not new code. Loaded once and cached.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, 'profiles');

let taxonomy = null;
export function loadTaxonomyProfile() {
  if (!taxonomy) taxonomy = JSON.parse(fs.readFileSync(path.join(dir, 'taxonomy.profile.json'), 'utf8'));
  return taxonomy;
}
