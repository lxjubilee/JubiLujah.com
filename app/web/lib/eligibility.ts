// ============================================================================
// Track eligibility engine — spec §2.2 (SERVER-ONLY).
//
// A track qualifies for a theme only if ALL seven rules hold. Rule 7 (a
// resolvable CDN url) is already guaranteed by lib/catalogTracks (it only emits
// playable tracks), but is asserted here so the rule set is complete and honest.
// ============================================================================
import type { CatalogTrack } from './catalogTracks';
import { allCatalogTracks } from './catalogTracks';
import { resolveEligiblePersonas, type ThemeRecord } from './playlistThemes';

const inRange = (v: number, r: { min: number; max: number }) => v >= r.min && v <= r.max;
const intersects = (a: string[], b: string[]) => a.some((x) => b.includes(x));

export interface EligibilityContext {
  theme: ThemeRecord;
  /** Listener's active language (rule 6). */
  lang: string;
  /** Personas eligible under the theme (resolved once). */
  eligiblePersonas: Set<string>;
}

export function makeContext(theme: ThemeRecord, lang: string): EligibilityContext {
  return { theme, lang, eligiblePersonas: new Set(resolveEligiblePersonas(theme)) };
}

/** The seven rules of §2.2, in order. Returns the first failing rule (1-7) or 0. */
export function failingRule(t: CatalogTrack, ctx: EligibilityContext): number {
  const { theme } = ctx;
  if (!inRange(t.meta.energy, theme.energy_range)) return 1;
  if (!inRange(t.meta.tempo, theme.tempo_range)) return 2;
  if (!intersects(t.meta.moods, theme.emotional_profile)) return 3;
  if (t.meta.moods.some((m) => theme.excluded_moods.includes(m))) return 4;
  if (!ctx.eligiblePersonas.has(t.personaSlug)) return 5;
  if (t.meta.lang !== ctx.lang) return 6;
  if (!t.url) return 7;
  return 0;
}

export const isEligible = (t: CatalogTrack, ctx: EligibilityContext): boolean => failingRule(t, ctx) === 0;

/**
 * The full theme-eligible pool for a language: every track passing §2.2 for any
 * theme-eligible persona. This is the cacheable pool (§16); listener artist
 * selection is applied afterwards by the composer.
 */
export function eligiblePool(theme: ThemeRecord, lang: string): CatalogTrack[] {
  const ctx = makeContext(theme, lang);
  return allCatalogTracks().filter((t) => isEligible(t, ctx));
}

/** Distinct languages whose eligible pool can satisfy the theme's composition
 *  floor (target count AND min distinct albums) — spec §7: partial pools hidden. */
export function availableLanguages(theme: ThemeRecord): string[] {
  const byLang = new Map<string, { count: number; albums: Set<string> }>();
  for (const t of allCatalogTracks()) {
    const ctx = { theme, lang: t.meta.lang, eligiblePersonas: new Set(resolveEligiblePersonas(theme)) };
    if (!isEligible(t, ctx)) continue;
    let e = byLang.get(t.meta.lang);
    if (!e) { e = { count: 0, albums: new Set() }; byLang.set(t.meta.lang, e); }
    e.count += 1;
    e.albums.add(t.albumCode);
  }
  const out: string[] = [];
  for (const [lang, e] of byLang) {
    if (lang === 'other') continue;
    if (e.count >= theme.target_track_count && e.albums.size >= theme.min_distinct_albums) out.push(lang);
  }
  // English first, then alphabetical — matches the site's language ordering intent.
  out.sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
  return out;
}
