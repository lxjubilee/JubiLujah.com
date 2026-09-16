// ============================================================================
// Editorial labels: "Staff Pick" and "Featured".
//
// Owner direction, 2026-09-16, as the honest answer to a site that looks empty
// when it is new: labels that say exactly what they are, instead of manufactured
// likes or ratings (DECISIONS D-2026-09-16-6 and -7).
//
//   STAFF PICK  an album a person on the team chose. Listed by hand in
//               content/staff-picks.json and never generated — the label claims a
//               human choice, so only a human may make one.
//
//   FEATURED    the site's own rotating selection: a fresh set every day, drawn at
//               random from finished albums with covers. It claims nothing more
//               than that JubileePraise is featuring it today, which is true.
//
// Server-only (node:fs). Import from Server Components.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { dailyShuffle } from './dailyShuffle';

const PICKS_FILE = path.join(process.cwd(), 'content', 'staff-picks.json');

export type EditorialBadge = 'staff-pick' | 'featured';

let picksCache: Set<string> | null = null;

/** Album codes the team has picked. Read once per process. */
export function staffPickCodes(): Set<string> {
  if (picksCache) return picksCache;
  try {
    const doc = JSON.parse(fs.readFileSync(PICKS_FILE, 'utf8')) as { picks?: { code?: string }[] };
    picksCache = new Set((doc.picks || []).map((p) => String(p.code || '').toUpperCase()).filter(Boolean));
  } catch {
    picksCache = new Set();
  }
  return picksCache;
}

export const isStaffPick = (code: string) => staffPickCodes().has(String(code).toUpperCase());

/**
 * Today's featured albums: `count` items, the same for everyone all day, a new
 * set at 00:00 UTC. The same day-seeded shuffle the home rows already use
 * (lib/dailyShuffle), under its own seed so it is not simply the first row again.
 */
export function featuredToday<T extends { code: string }>(pool: T[], count = 12): T[] {
  const seen = new Set<string>();
  const unique = pool.filter((t) => (seen.has(t.code) ? false : (seen.add(t.code), true)));
  return dailyShuffle(unique, 'featured-today').slice(0, count);
}
