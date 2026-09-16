#!/usr/bin/env node
// ============================================================================
// gen-season-playlists.mjs — the twelve "For Your Season" default playlists.
//
//   node scripts/gen-season-playlists.mjs            # dry run: pool sizes + picks
//   node scripts/gen-season-playlists.mjs --write    # write content/playlists/*.json
//
// Founder direction, 2026-09-16: the PLAYLISTS page opens on twelve pre-generated
// playlists for the twelve emotional states and life moments people most often
// bring to music — each 36 songs from various albums.
//
// That is the "Emotional State" type of setup/playlist-functionality.md, and the
// files follow its §6.3 schema: one JSON file per playlist, 36 slots, shown under
// the public heading "For Your Season" (§3). Two deliberate supersets of the
// schema, both so a slot resolves EXACTLY rather than by fuzzy title match:
//
//   · each slot also carries `code` (album code) and `n` (track number) — the
//     keys every other part of this system uses. `album`/`track`/`artist` stay,
//     for a human reading the file.
//   · the file carries `generated` and `rules`, so a list can be regenerated
//     and anyone can see what produced it.
//
// 🔴 PRE-GENERATED, NOT COMPOSED PER VISIT. The existing theme engine
// (/api/playlist, lib/compose.ts) builds a different 120-song mix for every
// listener on every load. These are the opposite on purpose: the same 36 songs
// for everyone, in the same order, so "Broken but Held" is a playlist people can
// recommend to each other, not a slot machine. They are written once, reviewed,
// and shipped; regenerate by re-running this script.
//
// SONG CHOICE uses the same per-song data the theme engine uses —
// public/music/track-metadata.json (energy, tempo, four mood tags) — so the two
// systems cannot disagree about what a song is. That data is ESTIMATED from
// genre and title keywords (`est: 1`), and heavy states (grief, fear, loneliness)
// have thin direct tagging, which is why each playlist names several gentle moods
// and an energy ceiling rather than a single tag. Read the lists before shipping.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v5 as uuidv5 } from 'uuid';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const OUT_DIR = path.join(ROOT, 'content', 'playlists');
// The spec's canonical home for a site's defaults (§6.2). Mirrored when the
// drive is present; the app reads its own copy under content/.
const DRIVE_DIR = 'J:/jubileepraise.com/playlists';

const SONGS = 36;
// MUST match lib/ids.ts, app/api/src/ids.js and app/db/ids.js.
const JV_NAMESPACE = 'f3a1e2d4-5b6c-4d7e-8f90-1a2b3c4d5e6f';
const songUuid = (code, n) => uuidv5('song:' + String(code).toUpperCase() + ':' + String(n), JV_NAMESPACE);

// The twelve Inspire Family personas — lib/personas.ts INSPIRE_ORDER.
const PERSONAS = new Set([
  'jubilee-inspire', 'melody-inspire', 'zariah-inspire', 'elias-inspire',
  'eliana-inspire', 'caleb-inspire', 'imani-inspire', 'zev-inspire',
  'amir-inspire', 'nova-inspire', 'santiago-inspire', 'tahoma-inspire',
]);

// ----------------------------------------------------------------------------
// THE TWELVE. Display order is the order here.
//
// `moods` is ranked: the first counts most. Only tags that actually occur in the
// data are used (joy, celebration, reverence, hope, triumph, awe, gratitude,
// thanksgiving, tenderness, exuberance, wonder, reflective, contemplative,
// victory, courage, longing, comfort, peace, intimacy, determination,
// intercession, surrender) — lament, sorrow and warfare are in the lexicon but
// no song carries them, so naming them would match nothing.
//
// `arc`: 'rise' starts gentle and climbs toward hope; 'settle' winds down;
// 'steady' holds its level.
// ----------------------------------------------------------------------------
const PLAYLISTS = [
  {
    id: 'overflowing-with-joy', title: 'Overflowing with Joy',
    description: 'For the days your heart is already full and you want to sing it out loud.',
    moods: ['joy', 'exuberance', 'celebration', 'thanksgiving', 'triumph'], energy: [65, 100], arc: 'steady',
    accent: '#F5B82E',
    imagePrompt: 'A joyful, diverse group of friends of all ages laughing and singing together outdoors at golden hour, arms around each other, confetti and warm light, genuine happiness and movement, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'when-youre-afraid', title: "When You're Afraid",
    description: 'Steady, peaceful songs for anxious nights and worried mornings.',
    moods: ['peace', 'comfort', 'hope', 'tenderness', 'reverence', 'reflective'], energy: [15, 62], arc: 'rise',
    exclude: ['exuberance'], accent: '#5B8DEF',
    imagePrompt: 'A calm young woman sitting by a window at dawn with a warm cup of tea, soft morning light filling the room, a peaceful hopeful expression, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'broken-but-held', title: 'Broken but Held',
    description: 'For grief and loss: songs that sit with you and still hold on to hope.',
    moods: ['comfort', 'tenderness', 'longing', 'hope', 'reflective', 'contemplative'], energy: [10, 58], arc: 'rise',
    exclude: ['exuberance', 'celebration'], accent: '#8E7CC3',
    imagePrompt: 'Two people of different generations embracing warmly in a sunlit garden, one comforting the other, tender and hopeful, soft natural light, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'in-the-waiting', title: 'In the Waiting',
    description: 'For seasons that feel stuck. Patient songs for when the answer has not come yet.',
    moods: ['hope', 'longing', 'contemplative', 'reflective', 'surrender', 'peace'], energy: [15, 65], arc: 'rise',
    exclude: ['exuberance'], accent: '#4FB3A9',
    imagePrompt: 'A thoughtful man standing at the edge of a quiet lake at sunrise looking toward the horizon, mist on the water, a sense of patient hope, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'a-grateful-heart', title: 'A Grateful Heart',
    description: 'Thanksgiving for everything that is good, from the smallest blessings up.',
    moods: ['gratitude', 'thanksgiving', 'joy', 'tenderness', 'hope'], energy: [35, 88], arc: 'steady',
    accent: '#E8894A',
    imagePrompt: 'A multigenerational family gathered around a long outdoor table sharing a meal, laughing and holding hands to give thanks, warm evening light and string lights, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'strength-for-the-battle', title: 'Strength for the Battle',
    description: 'Courage for the hard fight in front of you. You are not facing it alone.',
    moods: ['courage', 'determination', 'triumph', 'victory', 'hope'], energy: [60, 100], arc: 'rise',
    accent: '#D9534F',
    imagePrompt: 'A determined young athlete lacing up running shoes at dawn on a city rooftop, focused and strong, dramatic sunrise behind, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'rest-for-the-weary', title: 'Rest for the Weary',
    description: 'Quiet, gentle worship for when you are tired and simply need to rest.',
    moods: ['peace', 'intimacy', 'tenderness', 'contemplative', 'comfort', 'surrender'], energy: [5, 50], arc: 'settle',
    exclude: ['exuberance', 'celebration', 'triumph'], accent: '#6C8EAD',
    imagePrompt: 'A woman resting peacefully in a hammock under shady trees on a quiet afternoon, eyes closed, dappled sunlight, deeply restful mood, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'when-you-feel-alone', title: 'When You Feel Alone',
    description: 'Songs that remind you that you are seen, known and never truly by yourself.',
    moods: ['tenderness', 'intimacy', 'comfort', 'longing', 'hope', 'reverence'], energy: [15, 62], arc: 'rise',
    exclude: ['exuberance'], accent: '#7A9CC6',
    imagePrompt: 'A young man walking along a beach at sunset being greeted warmly by a friend running up to him, open arms and bright smiles, golden light, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'healing-and-recovery', title: 'Healing and Recovery',
    description: 'For the long road back: songs of restoration, one day at a time.',
    moods: ['comfort', 'hope', 'gratitude', 'tenderness', 'peace', 'reverence'], energy: [20, 70], arc: 'rise',
    exclude: ['exuberance'], accent: '#5DB075',
    imagePrompt: 'An older woman smiling as she takes a first walk outside through a flowering park with a caring friend beside her, bright hopeful spring light, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'a-new-beginning', title: 'A New Beginning',
    description: 'A new job, a new home, a new baby, a fresh start: songs for stepping forward.',
    moods: ['hope', 'wonder', 'joy', 'awe', 'gratitude'], energy: [40, 85], arc: 'rise',
    accent: '#3DA5FF',
    imagePrompt: 'A young couple carrying boxes into their new home laughing together, sunlight pouring through the open door, excitement and fresh-start energy, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'standing-in-awe', title: 'Standing in Awe',
    description: 'Worship that makes you stop and marvel at how great God is.',
    moods: ['awe', 'reverence', 'wonder', 'intimacy', 'contemplative'], energy: [25, 85], arc: 'rise',
    accent: '#B08D57',
    imagePrompt: 'A small group of hikers standing together on a mountain ridge at sunrise, arms raised in wonder at a vast glowing valley below, photorealistic cinematic 16:9 banner, no text.',
  },
  {
    id: 'celebrating-a-victory', title: 'Celebrating a Victory',
    description: 'For answered prayers and breakthroughs. Lift your hands, it happened!',
    moods: ['triumph', 'victory', 'celebration', 'thanksgiving', 'exuberance', 'joy'], energy: [62, 100], arc: 'steady',
    accent: '#F0A020',
    imagePrompt: 'A crowd of friends cheering and celebrating together at an outdoor evening gathering, lifting someone up in joy, festival lights and genuine excitement, photorealistic cinematic 16:9 banner, no text.',
  },
];

// ---- load -------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/music/catalog-manifest.json'), 'utf8'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/music/track-metadata.json'), 'utf8')).tracks || {};

const candidates = [];
for (const cat of manifest.categories || []) {
  for (const artist of cat.artists || []) {
    if (!PERSONAS.has(artist.slug)) continue;
    for (const al of artist.albums || []) {
      if (!/EN$/i.test(al.code) || al.christmas) continue;   // English, not seasonal
      for (const t of al.tracks || []) {
        if (!t.audio || !t.url) continue;                     // playable only
        const id = songUuid(al.code, t.n);
        const m = meta[id];
        if (!m || !Array.isArray(m.moods) || m.lang !== 'en') continue;
        candidates.push({
          id, code: al.code, n: t.n, title: t.title, album: al.title,
          artist: artist.name, persona: artist.slug, energy: m.energy, moods: m.moods,
        });
      }
    }
  }
}

// ---- scoring ----------------------------------------------------------------
// A song's four tags are ranked too (its first is its strongest), and a playlist's
// moods are ranked. Score = Σ (weight of the tag in the song) × (weight of that
// mood in the playlist). A song qualifies only if one of its TOP TWO tags is one
// of the playlist's moods — a song whose fourth tag happens to be "peace" is not
// a peaceful song.
const SONG_W = [1, 0.6, 0.35, 0.2];
function score(c, pl) {
  if (!pl.moods.includes(c.moods[0]) && !pl.moods.includes(c.moods[1])) return 0;
  if (pl.exclude && pl.exclude.includes(c.moods[0])) return 0;
  let s = 0;
  c.moods.forEach((mood, i) => {
    const r = pl.moods.indexOf(mood);
    if (r >= 0) s += SONG_W[i] * (1 - (r / pl.moods.length) * 0.5);
  });
  return s;
}

// Deterministic tie-break, seeded per playlist: the same inputs always produce
// the same list, so a re-run that changes nothing changes no file.
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}

function pool(pl, widen) {
  const [lo, hi] = pl.energy;
  return candidates
    .filter((c) => c.energy >= lo - widen && c.energy <= hi + widen)
    .map((c) => ({ c, s: score(c, pl) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || hash(pl.id + a.c.id) - hash(pl.id + b.c.id));
}

// ---- selection ----------------------------------------------------------------
// Spread is the point of "from various albums": at most 2 songs from one album
// and at most 6 from one artist, and — across the twelve — no song appears in two
// playlists while an unused one still fits. Each limit relaxes, in that order and
// only as far as needed, when a playlist cannot otherwise reach 36.
const LADDER = [
  { widen: 0, perAlbum: 2, perPersona: 6, reuse: false },
  { widen: 8, perAlbum: 2, perPersona: 6, reuse: false },
  { widen: 15, perAlbum: 2, perPersona: 8, reuse: false },
  { widen: 15, perAlbum: 3, perPersona: 10, reuse: false },
  { widen: 25, perAlbum: 3, perPersona: 12, reuse: false },
  { widen: 25, perAlbum: 3, perPersona: 12, reuse: true },
];

const usedGlobally = new Set();

function select(pl) {
  for (const [step, rule] of LADDER.entries()) {
    const picks = [];
    const perAlbum = new Map();
    const perPersona = new Map();
    const inList = new Set();
    for (const { c } of pool(pl, rule.widen)) {
      if (picks.length >= SONGS) break;
      if (inList.has(c.id)) continue;
      if (!rule.reuse && usedGlobally.has(c.id)) continue;
      if ((perAlbum.get(c.code) || 0) >= rule.perAlbum) continue;
      if ((perPersona.get(c.persona) || 0) >= rule.perPersona) continue;
      picks.push(c);
      inList.add(c.id);
      perAlbum.set(c.code, (perAlbum.get(c.code) || 0) + 1);
      perPersona.set(c.persona, (perPersona.get(c.persona) || 0) + 1);
    }
    if (picks.length >= SONGS) return { picks, step, rule };
  }
  return { picks: [], step: -1, rule: null };
}

// ---- ordering -----------------------------------------------------------------
function order(picks, arc) {
  const sorted = picks.slice().sort((a, b) =>
    arc === 'settle' ? b.energy - a.energy : arc === 'rise' ? a.energy - b.energy : 0);
  // Never the same album or the same artist twice in a row: swap in the nearest
  // later song that breaks the run. Order within the arc barely moves.
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (sorted[i].code !== prev.code && sorted[i].persona !== prev.persona) continue;
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].code !== prev.code && sorted[j].persona !== prev.persona) {
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
        break;
      }
    }
  }
  return sorted;
}

// ---- run ------------------------------------------------------------------------
console.log(`${candidates.length} playable, tagged, English Inspire Family songs to choose from.\n`);

// Scarcest first, so the heavy states — which have the fewest gentle songs —
// get first claim on them instead of losing them to a playlist with plenty.
const byScarcity = PLAYLISTS
  .map((pl) => ({ pl, size: pool(pl, 0).length }))
  .sort((a, b) => a.size - b.size);

const results = new Map();
let failed = 0;
for (const { pl, size } of byScarcity) {
  const { picks, step, rule } = select(pl);
  if (!picks.length) { failed++; console.log(`✗ ${pl.title}: cannot reach ${SONGS} (pool ${size})`); continue; }
  picks.forEach((c) => usedGlobally.add(c.id));
  const albums = new Set(picks.map((c) => c.code)).size;
  const artists = new Set(picks.map((c) => c.persona)).size;
  console.log(`✓ ${pl.title.padEnd(26)} pool ${String(size).padStart(4)} · rule step ${step}` +
    ` (±${rule.widen} energy, ≤${rule.perAlbum}/album, ≤${rule.perPersona}/artist${rule.reuse ? ', reuse' : ''})` +
    ` · ${albums} albums · ${artists} artists`);
  results.set(pl.id, { pl, picks: order(picks, pl.arc), rule });
}
if (failed) { console.error(`\n${failed} playlist(s) could not be filled.`); process.exit(1); }

if (!WRITE) {
  const sample = results.get(PLAYLISTS[2].id);
  console.log(`\nSample — ${sample.pl.title}:`);
  sample.picks.slice(0, 8).forEach((c, i) => console.log(`  ${i + 1}. ${c.title} — ${c.artist} (${c.album}) · energy ${c.energy} · ${c.moods.slice(0, 2).join(', ')}`));
  console.log('\nDry run. Re-run with --write to write the files.');
  process.exit(0);
}

const generated = new Date().toISOString();
fs.mkdirSync(OUT_DIR, { recursive: true });
const driveOk = fs.existsSync(path.dirname(DRIVE_DIR));
if (driveOk) fs.mkdirSync(DRIVE_DIR, { recursive: true });

PLAYLISTS.forEach((pl, index) => {
  const { picks, rule } = results.get(pl.id);
  const doc = {
    id: pl.id,
    title: pl.title,
    type: 'Emotional State',
    order: index + 1,
    description: pl.description,
    accent: pl.accent,
    imagePrompt: pl.imagePrompt,
    imageAspectRatio: '16:9',
    linkedImage: '',
    journey: { isJourney: false, days: null, nextPlaylistId: null },
    surfacing: { timeOfDay: [], calendar: [] },
    songCount: picks.length,
    generated,
    rules: { moods: pl.moods, energy: pl.energy, exclude: pl.exclude || [], arc: pl.arc, ...rule },
    songs: picks.map((c, i) => ({
      slot: i + 1,
      album: c.album,
      track: c.title,
      artist: c.artist,
      // Per-slot descriptions (§6.3) are written by hand, not generated.
      description: '',
      code: c.code,
      n: c.n,
    })),
  };
  const json = JSON.stringify(doc, null, 2) + '\n';
  fs.writeFileSync(path.join(OUT_DIR, `${pl.id}.json`), json);
  if (driveOk) fs.writeFileSync(path.join(DRIVE_DIR, `${pl.id}.json`), json);
});
console.log(`\nWrote ${PLAYLISTS.length} playlists → ${path.relative(process.cwd(), OUT_DIR)}` + (driveOk ? ` and ${DRIVE_DIR}` : ''));
