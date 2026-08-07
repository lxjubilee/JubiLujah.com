// ============================================================================
// POST /api/playlist — compose a theme playlist (spec §2.2/§2.3/§5.3/§8/§10/§11).
//
// This is a Next Route Handler (server). It runs the eligibility + composition
// engine and returns a fully serializable playlist the client can render and
// hand to the player. Stateless: rotation memory (§14.1) is passed in as
// `served` (the client fetches it from the authed /api/me API) and per-user
// preferences persist separately — this endpoint is pure and cacheable-shaped
// so it also serves anonymous/shared listeners.
//
// NOTE: `rewrites()` in next.config.mjs proxies /api/* to the Express backend
// only as an afterFiles fallback, so this filesystem route takes precedence.
// ============================================================================
import { NextResponse } from 'next/server';
import { getTheme, resolveEligiblePersonas } from '@/lib/playlistThemes';
import { compose, type Arc, type Interlude } from '@/lib/compose';
import { eligiblePool, availableLanguages } from '@/lib/eligibility';
import { backstageSlugIndex } from '@/lib/backstage';
import { personaImage, personaCardImage } from '@/lib/personas';
import { DEFAULT_LANG } from '@/lib/languages';
import { getTestimonies } from '@/lib/testimonies';

export const dynamic = 'force-dynamic'; // per-listener, never statically cached

const ARCS: Arc[] = ['steady', 'build', 'worship_set'];

interface Body {
  themeId: string;
  lang?: string;
  personas?: string[];
  arc?: Arc;
  durationSeconds?: number | null;
  mood?: string | null;
  testimonyOn?: boolean;
  served?: string[];
  seed?: string;
}

// Mood check-in (§9) → an energy bias inside the theme's admissible range.
const MOOD_BIAS: Record<string, number> = {
  celebrating: 0.12, grateful: 0.0, hopeful: 0.04, seeking: -0.06, weary: -0.16, heavy: -0.18,
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const theme = getTheme(String(body.themeId || ''));
  if (!theme) return NextResponse.json({ error: 'unknown_theme' }, { status: 404 });

  const langs = availableLanguages(theme);
  const lang = body.lang && langs.includes(body.lang) ? body.lang
    : langs.includes(DEFAULT_LANG) ? DEFAULT_LANG
      : langs[0] || DEFAULT_LANG;

  const eligible = resolveEligiblePersonas(theme);
  // Selection defaults to all eligible personas (§3.3); floor of one enforced.
  let personas = Array.isArray(body.personas) && body.personas.length
    ? body.personas.filter((p) => eligible.includes(p))
    : eligible;
  if (!personas.length) personas = eligible;

  const arc: Arc = body.arc && ARCS.includes(body.arc) && theme.supported_arcs.includes(body.arc)
    ? body.arc
    : (theme.supported_arcs[0] as Arc) || 'steady';

  const testimonyOn = body.testimonyOn !== false;
  const interludes: Interlude[] = getTestimonies(theme.testimony_categories, lang);

  const result = compose({
    theme,
    lang,
    personas,
    arc,
    seed: String(body.seed || 'anon'),
    durationSeconds: body.durationSeconds ?? null,
    served: new Set(Array.isArray(body.served) ? body.served : []),
    energyBias: body.mood ? MOOD_BIAS[body.mood] ?? 0 : 0,
    interludes,
    testimonyOn,
  });

  // Per-eligible-persona counts for the current language (for the selector), and
  // the backstage index so each track can expose the §6 Story affordance.
  const pool = eligiblePool(theme, lang);
  const personaCounts: Record<string, number> = {};
  for (const p of eligible) personaCounts[p] = 0;
  for (const t of pool) if (personaCounts[t.personaSlug] !== undefined) personaCounts[t.personaSlug]++;

  const bsIndex = backstageSlugIndex();
  const entries = result.entries.map((e) => {
    if (e.type === 'interlude') {
      return { type: 'interlude' as const, ...e.interlude };
    }
    const t = e.track;
    const slug = bsIndex.get(t.albumCode.toUpperCase())?.get(t.title.toLowerCase().trim()) || null;
    return {
      type: 'track' as const,
      songId: t.songId,
      n: t.n,
      title: t.title,
      personaSlug: t.personaSlug,
      personaName: t.personaName,
      albumCode: t.albumCode,
      albumTitle: t.albumTitle,
      url: t.url,
      cover: t.cover,
      energy: t.meta.energy,
      tempo: t.meta.tempo,
      moods: t.meta.moods,
      dur: t.meta.dur,
      backstage: slug ? { slug } : null,
    };
  });

  return NextResponse.json({
    theme: {
      id: theme.theme_id,
      name: theme.theme_name,
      statement: theme.theme_statement,
      accent: theme.accent || null,
      heroImage: theme.hero_image || null,
      supportedArcs: theme.supported_arcs,
      defaultArc: theme.default_arc,
      testimonyCategories: theme.testimony_categories,
      targetTrackCount: theme.target_track_count,
      minDistinctAlbums: theme.min_distinct_albums,
    },
    lang,
    arc,
    personas,
    availableLanguages: langs,
    eligiblePersonas: eligible.map((slug) => ({
      slug,
      count: personaCounts[slug] || 0,
      image: personaCardImage(slug) || personaImage(slug),
    })),
    entries,
    trackCount: result.trackCount,
    distinctAlbums: result.distinctAlbums,
    runtimeSeconds: result.runtimeSeconds,
    poolSize: result.poolSize,
    warnings: result.warnings,
    underfilled: result.underfilled,
    rotationReset: result.rotationReset,
  });
}
