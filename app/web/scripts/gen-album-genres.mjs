// ============================================================================
// Derive each album's PRIMARY + SECONDARY music-style genre from its source
// content files and write public/music/album-genres.json (consumed by
// lib/genres.ts). Labels are clean and <= 20 characters.
//
// Source priority (per album, under <ARTWORK_BASE>/<album.path>/):
//   1. blueprint.md  "Dominant Music Styles:" / "Genre / Sound" / "Album Type:"
//      — the AUTHORITATIVE album-level style statement (e.g.
//      "Caribbean Praise × Contemporary Gospel"). Weighted heaviest.
//   2. lyrics/*lyrics*.md  "**Fusion:**" header + per-song "Styles:" lines.
// The descriptive prose is normalized to clean genre labels via GENRE_RULES
// (ordered specific -> generic), and the two highest-scoring genres win
// (specific genres outrank generic ones on ties, so the distinctive style
// becomes the primary).
//
//   node scripts/gen-album-genres.mjs [limit|CSVcodes]
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MUSIC_ROOT = (process.env.ARTWORK_BASE || 'J:/music').replace(/\\/g, '/');
const MANIFEST = path.join(ROOT, 'public', 'music', 'catalog-manifest.json');
const OUT = path.join(ROOT, 'public', 'music', 'album-genres.json');
const CONCURRENCY = 8;
const MAX_LEN = 20;

// [clean label (<=20 chars), keyword regex]. Order = specificity (specific
// genres first so they win the primary slot on a tie).
const GENRE_RULES = [
  ['Pentecostal Shout', /pentecostal|cogic|hammond shout|organ shout|holy[ -]ghost shout/i],
  ['Caribbean Praise',  /caribbean|soca|calypso|island shuffle|island praise|diaspora revival|reggae[ -]gospel/i],
  // Multi-cultural / multilingual worship that samples MANY traditions at once
  // (e.g. "Every Tribe Sings"). Must outrank any single cultural lane (Arabic,
  // Latin, etc.) so a genuinely global album isn't mislabeled as one culture.
  ['Global Worship',    /global worship|world worship|every[ -]tribe|many[ -]tongues/i],
  ['Hebraic Worship',         /\bMM\b|messianic|klezmer|cantorial|hazzan|niggun|hebraic|te'amim|davidic|ahava rabbah|phrygian dominant|paleo hebrew|hebrew roots/i],
  ['Honky-Tonk',        /honky[ -]?tonk|barn[ -]?dance|two[ -]step|saloon|western swing/i],
  ['Bluegrass',         /bluegrass|banjo|appalachian|dobro|mandolin/i],
  ['Country',           /\bcountry\b|nashville|pedal[ -]steel|steel[ -]guitar|cowboy|honkytonk/i],
  ['Hawaiian',          /hawaiian|\bmele\b|hula|slack[ -]key|aloha|ukulele|polynesian|pacific[ -]island|mahalo/i],
  ['Tribal',            /tribal|pow[ -]?wow|native|first[ -]nation|indigenous|drum[ -]circle|navajo|lakota|red[ -]road|round[ -]dance|chant[ -]drum/i],
  ['Celtic',            /celtic|\birish\b|gaelic|uilleann|bodhran|tin[ -]whistle/i],
  ['Bollywood',         /bollywood|bhangra|indian[ -]classical|\braga\b|sitar|tabla|qawwali/i],
  ['Arabic Praise',     /arabic|levantine|middle[ -]eastern|\boud\b|qanun|maqam|darbuka|nay\b|ney\b/i],
  ['Afrobeat',          /afrobeat|afro[ -]?pop|highlife|amapiano|afro[ -]?gospel|afro[ -]?fusion/i],
  ['Reggae',            /reggae|dancehall|\bska\b/i],
  ['Latin Bolero',      /bolero/i],
  ['Latin Pop',         /latin[ -]pop|reggaeton|corona[ -]pop/i],
  ['Latin Praise',      /latin[ -]praise|latin[ -]worship|salsa[ -]praise/i],
  ['Latin',             /\blatin\b|salsa|mariachi|cumbia|bachata|merengue|ranchera|flamenco|mambo/i],
  ['Gospel Soul',       /gospel[ -]soul|neo[ -]?soul|\bmotown\b|\bsoul\b|\bR&B\b|rhythm and blues/i],
  ['Gospel',            /\bgospel\b|gospel[ -]rock|gospel[ -]choir|gospel[ -]vamp|black gospel|quartet/i],
  ['Hip-Hop',           /hip[ -]?hop|\brap\b|\btrap\b|boom[ -]bap|\bdrill\b|emcee/i],
  ['Blues',             /\bblues\b|delta blues|12[ -]bar|bluesy/i],
  ['Jazz',              /\bjazz\b|\bswing\b|big[ -]band|bebop|dixieland/i],
  ['Synth-Pop',         /synth[ -]?pop|electro[ -]?pop|electropop/i],
  ['Dance-Pop',         /dance[ -]?pop/i],
  ['Pop',               /\bpop\b|power[ -]?pop|pop[ -]arena|teen[ -]pop/i],
  ['Rock',              /\brock\b|arena[ -]rock|anthem[ -]rock|post[ -]rock|guitar[ -]driven|grunge/i],
  ['Electronic',        /\bEDM\b|electronic|synthwave|\bhouse\b|techno|club[ -]beat/i],
  ['Cinematic',         /cinematic|orchestral|symphonic|film[ -]score|epic[ -]score|trailer/i],
  ['Folk',              /\bfolk\b|americana|singer[ -]songwriter|campfire/i],
  ["Children's",        /lullaby|nursery|children'?s|kid[ -]friendly|sing[ -]along|playground/i],
  ['Contemporary',      /\bCCM\b|contemporary[ -]christian|\bcontemporary\b|modern[ -]worship|pop[ -]worship|power[ -]ballad ccm/i],
  ['Praise & Worship',  /praise[ -]break|praise[ -]?worship|arena[ -]worship|anthemic|stadium[ -]worship|celebration[ -]praise|\bpraise\b|worship[ -]anthem|shout[ -]back/i],
  ['Worship Ballad',    /\bballad\b|piano[ -]ballad|slow[ -]burn|soaking|ambient[ -]worship|intimate[ -]worship|prayer[ -]ballad|devotional|lament/i],
];

// Hand-curated overrides for albums the keyword heuristic mislabels. The text
// scorer counts the loudest single culture, which misrepresents an album that
// deliberately samples MANY cultures at once. Keyed by album code; wins outright.
const OVERRIDES = {
  // "Every Tribe Sings" — Throne-Room Global Worship walking six cultural lanes
  // (African/Latin/Pacific/East-Asian/European/Caribbean/Middle-Eastern). The
  // heuristic over-counted the one Arabic lane + convergence stacks → "Arabic
  // Praise". It is global, not Arabic.
  JEIM1004EN: ['Praise & Worship', 'Global Worship'],
};

// Genres in the same family collapse to one label (the most specific present),
// so a card never shows e.g. "Latin · Latin Pop". Distinct relatives like
// Country/Bluegrass or Pop/Synth-Pop are intentionally NOT familied.
const FAMILY = { 'Latin': 'latin', 'Latin Pop': 'latin', 'Latin Praise': 'latin', 'Latin Bolero': 'latin' };

function normalizeGenres(text) {
  const lc = ' ' + String(text).toLowerCase() + ' ';
  const scored = [];
  for (let i = 0; i < GENRE_RULES.length; i++) {
    const [label, re] = GENRE_RULES[i];
    const g = new RegExp(re.source, 'gi');
    const n = (lc.match(g) || []).length;
    if (n > 0) scored.push({ label, n, order: i });
  }
  // Collapse families to a single representative (most specific = lowest order),
  // summing the family's counts so it ranks by total weight.
  const fam = {};
  const single = [];
  for (const s of scored) {
    const f = FAMILY[s.label];
    if (!f) { single.push({ label: s.label, order: s.order, count: s.n }); continue; }
    if (!fam[f]) fam[f] = { label: s.label, order: s.order, count: 0 };
    if (s.order < fam[f].order) { fam[f].label = s.label; fam[f].order = s.order; }
    fam[f].count += s.n;
  }
  const groups = single.concat(Object.values(fam));
  groups.sort((a, b) => (b.count - a.count) || (a.order - b.order));
  const out = [];
  for (const g of groups) { if (!out.includes(g.label)) out.push(g.label); if (out.length >= 2) break; }
  return out.map((g) => g.slice(0, MAX_LEN));
}

function readFileSafe(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }

// Authoritative blueprint style statement (weighted) + lyrics fallback corpus.
function styleTextFor(albumPath) {
  const base = path.join(MUSIC_ROOT, albumPath);
  let blueprint = '';
  let lyrics = '';
  for (const dir of [path.join(base, 'lyrics'), base]) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch { continue; }
    for (const name of entries) {
      if (!/\.md$/i.test(name)) continue;
      const body = readFileSafe(path.join(dir, name));
      if (!body) continue;
      if (/blueprint/i.test(name)) {
        const lines = body.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (/dominant music styles?:/i.test(l)) blueprint += ' ' + l.replace(/.*styles?:/i, '');
          else if (/album type:/i.test(l)) blueprint += ' ' + l.replace(/.*album type:/i, '');
          else if (/genre\s*\/\s*sound/i.test(l)) blueprint += ' ' + (lines[i + 1] || '') + ' ' + (lines[i + 2] || '');
        }
      } else if (/lyrics/i.test(name)) {
        lyrics += '\n' + body.split('\n').filter((l) => /^\s*styles?:|\bfusion:?/i.test(l)).join('\n');
      }
    }
  }
  // Blueprint style statement is authoritative — weight it heavily.
  if (blueprint.trim()) return (blueprint + ' ') .repeat(3) + lyrics;
  return lyrics;
}

async function main() {
  const arg = process.argv[2];
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  let albums = [];
  for (const c of manifest.categories || [])
    for (const a of c.artists || [])
      for (const al of a.albums || [])
        if (al.path && al.code) albums.push(al);

  if (arg && /[A-Z]/.test(arg) && isNaN(Number(arg))) {
    const set = new Set(arg.split(',').map((s) => s.trim().toUpperCase()));
    albums = albums.filter((a) => set.has(a.code.toUpperCase()));
  } else if (arg && !isNaN(Number(arg))) {
    albums = albums.slice(0, Number(arg));
  }

  console.log(`Deriving genres for ${albums.length} albums from ${MUSIC_ROOT} …`);
  const genres = {};
  let done = 0, withData = 0;
  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = albums.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (al) => {
      const code = al.code.toUpperCase();
      const g = OVERRIDES[code] || (() => { const t = styleTextFor(al.path); return t ? normalizeGenres(t) : []; })();
      if (g.length) { genres[al.code] = g; withData++; }
    }));
    done += batch.length;
    if (done % 40 === 0 || done === albums.length) process.stdout.write(`  ${done}/${albums.length} (${withData} with genres)\r`);
  }
  if (arg) for (const code of Object.keys(genres)) console.log(`  ${code}: ${genres[code].join(' · ')}`);
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), count: Object.keys(genres).length, genres }, null, 0));
  console.log(`\nWrote ${OUT}: ${Object.keys(genres).length} albums with genres.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
