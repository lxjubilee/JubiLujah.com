#!/usr/bin/env node
// ============================================================================
// enrich-tracks.mjs — Phase 0 of the Playlist System (spec §19 Phase 1 step 2).
//
// The catalog has NO per-track energy / tempo / mood (every track is just
// {n,title,file,url,audio}). The theme-eligibility engine needs those. This
// script synthesizes them into public/music/track-metadata.json, keyed by
// songUuid, from an LLM-authored knowledge base:
//   • enrichment/genre-priors.json  — energy/tempo/mood band per catalog genre
//   • enrichment/mood-lexicon.json   — title/theme keyword refiners
// plus a deterministic per-track jitter seeded by the track's UUID so tracks
// within one album differ. Every value is an estimate (est:1) and is meant to
// be replaced later by audio-DSP or per-track analysis WITHOUT changing the
// schema. Deterministic: same inputs → byte-identical output (no randomness).
//
// Run:  node scripts/enrich-tracks.mjs   (from app/web)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v5 as uuidv5 } from 'uuid';

const __dir = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(__dir, '..');
const MUSIC = join(WEB, 'public', 'music');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// Must match lib/ids.ts / app/api/src/ids.js exactly.
const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';
const songUuid = (code, n) => uuidv5('song:' + String(code).toUpperCase() + ':' + String(n), JV_NAMESPACE);

// Language suffix → canonical code (mirror of lib/languages.ts albumLanguage()).
const SUFFIX_TO_LANG = {
  en:'en', es:'es', fr:'fr', de:'de', it:'it', br:'pt-BR', pt:'pt-PT', nl:'nl', ru:'ru', pl:'pl',
  zh:'zh', ja:'ja', ko:'ko', ar:'ar', hi:'hi', th:'th', tr:'tr', vi:'vi', tl:'tl', he:'he', sv:'sv',
  da:'da', cs:'cs', hu:'hu', bg:'bg', hr:'hr', id:'id', ro:'ro', uk:'uk', el:'el', yue:'yue', ms:'ms',
  ur:'ur', bn:'bn', ta:'ta', fa:'fa', sw:'sw', no:'no', fi:'fi', af:'af', la:'la',
};
function albumLanguage(code) {
  const m = /^[A-Za-z]{4}\d{4}([A-Za-z-]+)$/.exec(String(code || '').trim());
  const suffix = (m ? m[1] : String(code || '').slice(-2)).toLowerCase();
  return SUFFIX_TO_LANG[suffix] || 'other';
}

// Deterministic jitter: three independent 0..1 floats from the track UUID hex.
function jitters(uuid) {
  const hex = uuid.replace(/-/g, '');
  const slice = (i) => parseInt(hex.slice(i, i + 8), 16) / 0xffffffff;
  return [slice(0), slice(8), slice(16)];
}
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = Math.round;

// ── load knowledge base + catalog ──────────────────────────────────────────
const priors = readJson(join(MUSIC, 'enrichment', 'genre-priors.json'));
const lexicon = readJson(join(MUSIC, 'enrichment', 'mood-lexicon.json'));
const manifest = readJson(join(MUSIC, 'catalog-manifest.json'));
const albumGenres = (readJson(join(MUSIC, 'album-genres.json')).genres) || {};
const albumThemes = (readJson(join(MUSIC, 'album-themes.json')).themes) || {};

const GENRE = priors.genres;
const DEFAULT_PRIOR = priors._default;
const priorFor = (g) => GENRE[g] || null;

// Blend up to two genre priors (primary weighted heavier).
function blendedPrior(genres) {
  const p = priorFor(genres[0]);
  const s = priorFor(genres[1]);
  if (!p) return { energy: [...DEFAULT_PRIOR.energy], tempo: [...DEFAULT_PRIOR.tempo], moods: [...DEFAULT_PRIOR.moods] };
  if (!s) return { energy: [...p.energy], tempo: [...p.tempo], moods: [...p.moods] };
  const mix = (a, b) => [round(a[0] * 0.65 + b[0] * 0.35), round(a[1] * 0.65 + b[1] * 0.35)];
  return { energy: mix(p.energy, s.energy), tempo: mix(p.tempo, s.tempo), moods: [...new Set([...p.moods, ...s.moods])] };
}

// Precompile lexicon groups to lower-cased word lists.
const groups = lexicon.groups.map((g) => ({ energy: g.energy, moods: g.moods, words: g.words.map((w) => w.toLowerCase()) }));
function refine(text) {
  const t = ' ' + text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  let energyDelta = 0;
  const moodWeight = {};
  for (const g of groups) {
    let hit = false;
    for (const w of g.words) {
      // word-boundary-ish contains (word surrounded by spaces after normalization)
      if (t.includes(' ' + w + ' ') || (w.includes(' ') && t.includes(w))) { hit = true; break; }
    }
    if (hit) {
      energyDelta += g.energy;
      for (const m of g.moods) moodWeight[m] = (moodWeight[m] || 0) + 2;
    }
  }
  return { energyDelta, moodWeight };
}

// ── walk the catalog ─────────────────────────────────────────────────────────
const out = {};
let playable = 0, enriched = 0;
const langCount = {}, moodCount = {};

for (const cat of manifest.categories || []) {
  for (const artist of cat.artists || []) {
    for (const album of artist.albums || []) {
      const code = album.code;
      const genres = (albumGenres[String(code).toUpperCase()] || album.genres || []);
      const base = blendedPrior(genres);
      const albumText = `${album.title || ''} ${albumThemes[String(code).toUpperCase()] || ''}`;
      const lang = albumLanguage(code);
      for (const track of album.tracks || []) {
        if (!track || track.audio !== true || !track.url) continue; // hard: playable only
        playable++;
        const id = songUuid(code, track.n);
        const [jE, jT, jD] = jitters(id);
        const r = refine(`${track.title || ''} ${albumText}`);

        let energy = round(base.energy[0] + jE * (base.energy[1] - base.energy[0])) + r.energyDelta;
        energy = clamp(energy, 1, 100);
        const tempo = round(base.tempo[0] + jT * (base.tempo[1] - base.tempo[0]));
        // Duration estimate: faster ⇒ shorter, with jitter. Flagged estimate.
        const dur = clamp(round(255 - (tempo - 60) * 0.42 + (jD - 0.5) * 44), 120, 330);

        // Mood ranking: genre baseline (weight 3 primary-ish) + lexicon refiners.
        const weight = {};
        base.moods.forEach((m, i) => { weight[m] = (weight[m] || 0) + (i < 3 ? 3 : 2); });
        for (const m in r.moodWeight) weight[m] = (weight[m] || 0) + r.moodWeight[m];
        const moods = Object.entries(weight)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 4)
          .map(([m]) => m);

        out[id] = { energy, tempo, moods, lang, dur, est: 1 };
        enriched++;
        langCount[lang] = (langCount[lang] || 0) + 1;
        for (const m of moods) moodCount[m] = (moodCount[m] || 0) + 1;
      }
    }
  }
}

const payload = {
  generated: new Date().toISOString(),
  method: 'llm-knowledge-base+lexicon+uuid-jitter (estimated; see enrichment/*.json)',
  schema: { energy: '0-100', tempo: 'BPM', moods: 'controlled vocab', lang: 'language code', dur: 'seconds (estimated)', est: '1 = estimated, not measured' },
  count: enriched,
  tracks: out,
};
mkdirSync(MUSIC, { recursive: true });
writeFileSync(join(MUSIC, 'track-metadata.json'), JSON.stringify(payload));

console.log(`playable tracks seen: ${playable}`);
console.log(`enriched: ${enriched}`);
console.log('languages:', JSON.stringify(Object.fromEntries(Object.entries(langCount).sort((a, b) => b[1] - a[1]).slice(0, 12))));
console.log('top moods:', JSON.stringify(Object.fromEntries(Object.entries(moodCount).sort((a, b) => b[1] - a[1]))));
