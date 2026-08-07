// ============================================================================
// Compile the Backstage content library (core/backstage/**.md) into
// public/backstage/backstage.json — the file lib/backstage.ts reads at request
// time. Re-run whenever a piece is added or edited.
//
//   node scripts/gen-backstage.mjs
//
// Each source file has a fixed shape (see core/backstage/README.md):
//   ``` … ```          leading metadata fence (Song / Album / Artist / …)
//   **Supporting image (§8.1)** + Image Core / Amplifiers lines
//   ```prompt … ```    the ready-to-render image prompt
//   > …                optional representative-account banner (§9.2)
//   # Title            reader-facing headline, then the body
//
// TWO THINGS ARE DELIBERATELY WITHHELD from the generated JSON, because that
// file is served publicly:
//   1. Internal metadata — Mode, Signals, Craft check, Self-rating. §10 is
//      explicit that mode labels never appear in reader-facing text, and the
//      rest is editorial scoring. Dropping them here (rather than in the React
//      component) means they cannot leak through a future template change.
//   2. The image prompt — a production artifact, not reader content.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(WEB_ROOT, '..', '..');
const SRC = path.join(REPO_ROOT, 'core', 'backstage');
const OUT_DIR = path.join(WEB_ROOT, 'public', 'backstage');
const OUT = path.join(OUT_DIR, 'backstage.json');

// Folder → reader-facing format label. Order here is the order the sections
// appear on /backstage.
const SECTIONS = [
  { dir: 'interviews', format: 'Interview' },
  { dir: 'testimonies', format: 'Testimony' },
  { dir: 'stories', format: 'Story' },
];

// A hand-made 16:9 image for a piece, when one has been produced from its
// prompt. Looked up at generate time; null until the images exist, in which
// case the card falls back to the album cover (lib/backstage.ts).
const IMAGE_DIR = path.join(WEB_ROOT, 'public', 'images', 'backstage');
const IMAGE_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

function findImage(slug) {
  for (const ext of IMAGE_EXT) {
    if (fs.existsSync(path.join(IMAGE_DIR, slug + ext))) return `/images/backstage/${slug}${ext}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Key: value lines inside the leading fence, with wrapped continuations joined. */
function parseMeta(lines) {
  const meta = {};
  let last = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z][A-Za-z ]*?):\s*(.*)$/);
    if (m) {
      last = m[1].trim().toLowerCase();
      meta[last] = m[2].trim();
    } else if (last) {
      meta[last] += ' ' + line; // e.g. the multi-line `Note:` field
    }
  }
  return meta;
}

/** Body lines → a flat block list the React renderer walks. */
function parseBlocks(lines) {
  const out = [];
  let para = [];
  let quote = [];

  const flushPara = () => {
    const text = para.join(' ').trim();
    para = [];
    if (text) out.push({ type: 'p', text });
  };
  const flushQuote = () => {
    const text = quote.join(' ').trim();
    quote = [];
    if (text) out.push({ type: 'quote', text });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushQuote(); continue; }
    if (line === '---' || line === '***') { flushPara(); flushQuote(); out.push({ type: 'hr' }); continue; }
    if (line.startsWith('>')) { flushPara(); quote.push(line.replace(/^>\s?/, '')); continue; }
    const h = line.match(/^(#+)\s*(.*)$/);
    if (h) { flushPara(); flushQuote(); out.push({ type: h[1].length <= 2 ? 'h2' : 'h3', text: h[2] }); continue; }
    flushQuote();
    para.push(line);
  }
  flushPara();
  flushQuote();

  // A leading/trailing rule is a source-file separator, not content.
  while (out.length && out[0].type === 'hr') out.shift();
  while (out.length && out[out.length - 1].type === 'hr') out.pop();
  return out;
}

/** Strip inline emphasis for plain-text uses (card excerpt, meta description). */
const plain = (s) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();

/** Reader-facing URL slug, built from the article TITLE so the URL carries the
 *  headline (e.g. "everybody-hears-this-song-wrong-the-first-time-including-me").
 *  Quotes and apostrophes are dropped outright (so "don't" → "dont"); every other
 *  run of non-alphanumerics collapses to a single hyphen. Uniqueness across the
 *  library is enforced by the caller. */
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/['‘’"“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function parsePiece(raw, file, section) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  // 1. Leading metadata fence.
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (lines[i]?.trim() !== '```') throw new Error(`${file}: expected the metadata fence on the first line`);
  const metaStart = ++i;
  while (i < lines.length && lines[i].trim() !== '```') i++;
  const meta = parseMeta(lines.slice(metaStart, i));
  i++;

  // 2. Capture the supporting-image prompt (used by Image Studio to generate the
  //    card art — a production artifact, never rendered as reader content), then
  //    skip past its fence.
  let imagePrompt = '';
  const promptStart = lines.findIndex((l, n) => n >= i && l.trim() === '```prompt');
  if (promptStart !== -1) {
    const promptEnd = lines.findIndex((l, n) => n > promptStart && l.trim() === '```');
    if (promptEnd === -1) throw new Error(`${file}: unterminated \`\`\`prompt fence`);
    imagePrompt = lines.slice(promptStart + 1, promptEnd).join('\n').trim();
    i = promptEnd + 1;
  }
  const rest = lines.slice(i);

  // 3. Optional representative-account banner, then the `# Title`.
  const bannerLines = [];
  let j = 0;
  for (; j < rest.length; j++) {
    const line = rest[j].trim();
    if (!line || line === '---') continue;
    if (line.startsWith('>')) { bannerLines.push(line.replace(/^>\s?/, '')); continue; }
    break;
  }
  if (!rest[j] || !rest[j].trim().startsWith('#')) throw new Error(`${file}: no "# Title" heading found`);
  const title = rest[j].trim().replace(/^#+\s*/, '').trim();

  const body = parseBlocks(rest.slice(j + 1));

  // `Album: JEIM1056EN — Whole Again` (em dash).
  const album = (meta.album || '').match(/^([A-Z0-9]+)\s*[—–-]\s*(.*)$/);
  // URL slug is derived from the reader-facing title (not the source filename),
  // so /backstage/<slug> carries the headline. Deduped after the full build.
  const slug = slugify(title) || path.basename(file, '.md');
  const firstPara = body.find((b) => b.type === 'p');
  const excerpt = firstPara ? plain(firstPara.text).slice(0, 200) : '';

  // A piece links to its song only when the catalog can supply one (§8.2);
  // "BLOCKED — <reason>" means no row exists to read a link from.
  const audio = meta['cdn audio'] || '';

  return {
    slug,
    format: section.format,
    title,
    song: meta.song || '',
    albumCode: album ? album[1] : '',
    albumTitle: album ? album[2] : '',
    artist: meta.artist || '',
    principle: meta['biblical principle'] || '',
    // §9.2 — a representative account must always carry its framing banner.
    representative: /REPRESENTATIVE ACCOUNT/i.test(meta.source || ''),
    banner: bannerLines.length ? bannerLines.join(' ') : null,
    hasAudio: !!audio && !/^BLOCKED/i.test(audio),
    image: findImage(slug),
    imagePrompt,
    excerpt,
    body,
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

// The song-based Interview/Testimony/Story pieces were removed from the site.
// Their source files remain under core/backstage/ (nothing deleted), but they
// are no longer compiled into backstage.json, so they no longer appear anywhere.
// Flip this back to true to restore them.
const INCLUDE_SONG_PIECES = false;

const pieces = [];
if (INCLUDE_SONG_PIECES) {
  for (const section of SECTIONS) {
    const dir = path.join(SRC, section.dir);
    if (!fs.existsSync(dir)) {
      console.warn(`! missing folder: ${path.relative(REPO_ROOT, dir)}`);
      continue;
    }
    for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const file = path.join(dir, name);
      try {
        pieces.push(parsePiece(fs.readFileSync(file, 'utf8'), name, section));
      } catch (err) {
        console.error(`x ${section.dir}/${name}: ${err.message}`);
        process.exitCode = 1;
      }
    }
  }
}

// Title-derived slugs can, in principle, collide (two pieces with the same
// headline). Keep the first, suffix the rest (-2, -3, …) so every URL is unique.
const slugSeen = new Map();
for (const p of pieces) {
  const base = p.slug;
  const count = slugSeen.get(base) || 0;
  slugSeen.set(base, count + 1);
  if (count > 0) {
    p.slug = `${base}-${count + 1}`;
    p.image = findImage(p.slug); // re-resolve the (slug-named) dedicated image
  }
}

// ---------------------------------------------------------------------------
// Fold in the standalone articles (core/articles → public/articles/articles.json)
// so they display in the Backstage "Articles" section. Each already carries its
// own generated 16:9 image (a rooted /articles/images/<name>.webp path), which
// we use directly as the card cover — these pieces have no album or song, so the
// decorate() step in lib/backstage.ts skips the album-cover lookup for them.
// Article body blocks share the exact {type,text} shape Backstage uses.
// ---------------------------------------------------------------------------
const ARTICLES_JSON = path.join(WEB_ROOT, 'public', 'articles', 'articles.json');
let articleCount = 0;
if (fs.existsSync(ARTICLES_JSON)) {
  try {
    const data = JSON.parse(fs.readFileSync(ARTICLES_JSON, 'utf8'));
    const list = Array.isArray(data.articles) ? data.articles : [];
    for (const a of list) {
      if (!a.slug) continue;
      // An article may anchor to a real album via `album: CODE — Title` so its
      // card shows that album's cover and the page links out to listen. Same
      // "CODE — Title" shape the song-piece branch parses above.
      const aAlbum = (a.album || '').match(/^([A-Z0-9]+)\s*[—–-]\s*(.*)$/);
      pieces.push({
        slug: a.slug,
        format: 'Article',
        title: a.title || '',
        song: a.song || '',
        albumCode: aAlbum ? aAlbum[1] : '',
        albumTitle: aAlbum ? aAlbum[2] : '',
        artist: a.author || '',
        principle: '',
        representative: false,
        banner: null,
        hasAudio: false,
        // A regenerated slug-named image (Image Studio saves to
        // /images/backstage/<slug>.webp) takes precedence over the article's
        // original /articles/images/<name> art, so re-generation actually shows.
        image: findImage(a.slug) || a.image || null,
        imagePrompt: a.imagePrompt || '',
        excerpt: a.excerpt || '',
        body: Array.isArray(a.body) ? a.body : [],
      });
      articleCount++;
    }
  } catch (err) {
    console.error(`x articles.json: ${err.message}`);
    process.exitCode = 1;
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), pieces }, null, 2));

const byFormat = SECTIONS.map((s) => `${pieces.filter((p) => p.format === s.format).length} ${s.format.toLowerCase()}`);
byFormat.push(`${articleCount} article`);
console.log(`Wrote ${path.relative(REPO_ROOT, OUT)} — ${pieces.length} pieces (${byFormat.join(' · ')})`);
console.log(`Images: ${pieces.filter((p) => p.image).length} dedicated, ${pieces.filter((p) => !p.image).length} falling back to album cover`);
