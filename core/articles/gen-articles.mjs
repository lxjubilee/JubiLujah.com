// Compile core/articles/*.md into app/web/public/articles/articles.json.
//
// Each source file carries simple `key: value` frontmatter between two `---`
// fences, then a markdown body. Body parsing is deliberately small — the only
// structures the articles use are paragraphs, `## ` subheads, `> ` pull-quotes
// and `---` rules. Inline **bold** is left intact for the renderer.
//
// Run:  node core/articles/gen-articles.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../../app/web/public/articles/articles.json');

function parseFrontmatter(raw) {
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(raw);
  if (!m) throw new Error('missing frontmatter');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const idx = t.indexOf(':');
    if (idx === -1) continue;
    meta[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
  }
  return { meta, body: m[2].trim() };
}

function toBlocks(body) {
  return body
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((chunk) => {
      if (/^-{3,}$/.test(chunk)) return { type: 'hr' };
      if (chunk.startsWith('## ')) return { type: 'h2', text: chunk.slice(3).trim() };
      if (chunk.startsWith('### ')) return { type: 'h3', text: chunk.slice(4).trim() };
      if (chunk.startsWith('> '))
        return { type: 'quote', text: chunk.replace(/^>\s?/gm, '').replace(/\n/g, ' ').trim() };
      return { type: 'p', text: chunk.replace(/\n/g, ' ').trim() };
    });
}

const files = fs
  .readdirSync(HERE)
  .filter((f) => f.endsWith('.md'))
  .sort();

const articles = files
  .map((f) => {
    const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(HERE, f), 'utf8'));
    const slug = meta.slug || f.replace(/\.md$/, '');
    // Image resolution order: an explicit `image:` in frontmatter wins. The image
    // generator writes a bare filename there (e.g. `dw3gE54WGld4j.webp`), which
    // resolves to /articles/images/<filename>; an already-rooted path or URL is
    // used as-is. Otherwise fall back to a slug-named file under /images/articles.
    // Otherwise null (renders the titled fallback panel).
    // Slug-named images may live under /images/articles/ or /images/backstage/
    // (Image Studio's Backstage mode writes slug-named files to the latter).
    const localImg = ['images/articles', 'images/backstage']
      .flatMap((dir) => ['png', 'jpg', 'jpeg', 'webp'].map((ext) => `${dir}/${slug}.${ext}`))
      .find((rel) => fs.existsSync(path.resolve(HERE, '../../app/web/public', rel)));
    let image = null;
    if (meta.image) {
      // Bare filenames live under /images/articles/ (NOT /articles/images/ — the
      // /articles/* path is shadowed by the removed route on prod and 404s; the
      // /images/* prefix is served as static). Rooted paths / URLs pass through.
      image = /^(https?:)?\//i.test(meta.image) ? meta.image : `/images/articles/${meta.image}`;
    } else if (localImg) {
      image = `/${localImg}`;
    }
    return {
      order: Number(meta.order || 999),
      slug,
      title: meta.title || slug,
      author: meta.author || '',
      office: meta.office || '',
      personaSlug: meta.personaSlug || '',
      imagePrompt: meta.imagePrompt || '',
      image,
      excerpt: meta.excerpt || '',
      // Optional album anchor: articles that reflect on a specific catalog album
      // carry `album: CODE — Title` (+ a `song:` track) so Backstage can show the
      // album cover and a "Listen" link. Absent on most pieces → empty → ignored.
      album: meta.album || '',
      song: meta.song || '',
      body: toBlocks(body),
    };
  })
  .sort((a, b) => a.order - b.order)
  .map(({ order, ...rest }) => rest);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: null, count: articles.length, articles }, null, 2));
console.log(`Wrote ${articles.length} articles -> ${path.relative(process.cwd(), OUT)}`);
