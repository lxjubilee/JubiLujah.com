#!/usr/bin/env node
// ============================================================================
// Music → Redirector ingestion (software/redirector.md §8, §14).
//
// Walks the catalog manifest and, for every Inspire-persona ALBUM, ensures a
// redirector ASSET + an asset-mode TOKEN (landing_enabled on → a scan opens the
// §11 arrival page → app-or-web). Songs are a later phase (--songs, not yet on).
//
// Taxonomy: one node per persona; each album asset hangs off its persona node
// (so an album's "related" = the persona's other albums, and its breadcrumb is
// the persona name).
//
// IDEMPOTENT (direct DB, SELECT-before-INSERT on slug): safe to re-run — already
// minted albums are skipped, so a --limit staged run then a full run won't
// duplicate. Tokens are PERMANENT/IMMUTABLE (§5); minting only ever ADDS.
//
//   node scripts/redirector-ingest-music.mjs                 # dry run (no writes)
//   node scripts/redirector-ingest-music.mjs --apply         # mint all albums
//   node scripts/redirector-ingest-music.mjs --apply --limit 1          # stage one
//   node scripts/redirector-ingest-music.mjs --apply --persona jubilee-inspire
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') }); // load prod env for DATABASE_URL

const MANIFEST = path.resolve(__dirname, '../../web/public/music/catalog-manifest.json');
const BASE = (process.env.REDIRECTOR_BASE_URL || 'https://www.jubilujah.com').replace(/\/+$/, '');
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? parseInt(argv[i + 1], 10) : Infinity; })();
const ONLY_PERSONA = (() => { const i = argv.indexOf('--persona'); return i >= 0 ? argv[i + 1] : null; })();
const SONGS = argv.includes('--songs'); // also mint a token per song (autoplay deep-link)
const ARTICLES = argv.includes('--articles'); // mint a token per article (web-only, no app-gate)
const doMusic = !ARTICLES; // --articles alone runs articles only

const INSPIRE_ORDER = [
  'jubilee-inspire', 'melody-inspire', 'zariah-inspire', 'elias-inspire',
  'eliana-inspire', 'caleb-inspire', 'imani-inspire', 'zev-inspire',
  'amir-inspire', 'nova-inspire', 'santiago-inspire', 'tahoma-inspire',
];

function loadPersonas() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const bySlug = new Map();
  for (const c of m.categories || []) for (const a of c.artists || []) bySlug.set(a.slug, a);
  let order = INSPIRE_ORDER;
  if (ONLY_PERSONA) order = order.filter((s) => s === ONLY_PERSONA);
  return order.map((slug) => bySlug.get(slug)).filter(Boolean);
}

const albumUrl = (code) => `${BASE}/album?c=${encodeURIComponent(code)}`;
const coverUrl = (code) => `${BASE}/cover/${encodeURIComponent(code)}.png`;
// Song destination: the album page focused on track n, which auto-plays it.
const songUrl = (code, n) => `${BASE}/album?c=${encodeURIComponent(code)}&t=${n}`;
// Articles are WEB-ONLY (not in the mobile app): the QR redirects straight to the
// article page at /backstage/<slug> — no arrival page, no app-gate.
const ARTICLES_FILE = path.resolve(__dirname, '../../web/public/articles/articles.json');
const articleUrl = (slug) => `${BASE}/backstage/${encodeURIComponent(slug)}`;
function loadArticles() {
  try { const a = JSON.parse(fs.readFileSync(ARTICLES_FILE, 'utf8')); return Array.isArray(a) ? a : (a.articles || Object.values(a).find(Array.isArray) || []); }
  catch { return []; }
}

// ---- dry run ---------------------------------------------------------------
function dryRun() {
  if (ARTICLES) { const arts = loadArticles(); console.log(`DRY RUN — would mint ${Math.min(arts.length, LIMIT)} article tokens (web-only → /backstage/<slug>). Re-run with --apply --articles.`); return; }
  const personas = loadPersonas();
  let albums = 0;
  console.log(`DRY RUN — base ${BASE}${ONLY_PERSONA ? ` — persona ${ONLY_PERSONA}` : ''}${LIMIT !== Infinity ? ` — limit ${LIMIT}` : ''}`);
  for (const p of personas) {
    const n = (p.albums || []).length;
    albums += n;
    console.log(`  ${p.name.padEnd(20)} ${n} albums`);
  }
  console.log(`TOTAL albums that would be minted: ${Math.min(albums, LIMIT)} (assets + tokens + QR). Re-run with --apply.`);
}

// ---- apply (direct DB, idempotent) -----------------------------------------
async function apply() {
  const { query } = await import('../src/db.js');
  const { generateUniqueToken } = await import('../src/redirector/tokens.js');

  const tokenExists = async (t) => {
    const r = await query('SELECT 1 FROM redirector.tokens WHERE token=$1 UNION ALL SELECT 1 FROM redirector.aliases WHERE alias=$1', [t]);
    return r.rowCount > 0;
  };
  async function upsertPersonaNode(slug, title, sort) {
    const sel = await query("SELECT node_id FROM redirector.taxonomy_nodes WHERE level_key='persona' AND slug=$1 LIMIT 1", [slug]);
    if (sel.rows[0]) return sel.rows[0].node_id;
    const ins = await query(
      "INSERT INTO redirector.taxonomy_nodes(level_key,title,slug,sort_order,is_active) VALUES('persona',$1,$2,$3,true) RETURNING node_id",
      [title, slug, sort]);
    return ins.rows[0].node_id;
  }
  async function upsertAlbumAsset(al, nodeId, sort) {
    const sel = await query("SELECT asset_id FROM redirector.assets WHERE content_kind='album' AND slug=$1 LIMIT 1", [al.code]);
    if (sel.rows[0]) return { id: sel.rows[0].asset_id, created: false };
    const ins = await query(
      `INSERT INTO redirector.assets(content_kind,title,slug,storage_url,cover_image_url,taxonomy_node_id,sort_order,is_active)
       VALUES('album',$1,$2,$3,$4,$5,$6,true) RETURNING asset_id`,
      [al.title, al.code, albumUrl(al.code), coverUrl(al.code), nodeId, sort]);
    return { id: ins.rows[0].asset_id, created: true };
  }
  async function ensureToken(assetId, kind = 'album', landing = true) {
    const sel = await query("SELECT token FROM redirector.tokens WHERE asset_id=$1 AND resolution_mode='asset' AND state='active' ORDER BY created_at LIMIT 1", [assetId]);
    if (sel.rows[0]) return { token: sel.rows[0].token, created: false };
    const token = await generateUniqueToken(tokenExists);
    await query(
      `INSERT INTO redirector.tokens(token,token_type,resolution_mode,asset_id,content_kind,landing_enabled,state,created_by,created_via,resolve_count)
       VALUES($1,'QR','asset',$2,$3,$4,'active','ingest-script','api',0)`,
      [token, assetId, kind, landing]);
    return { token, created: true };
  }
  async function upsertArticleAsset(art) {
    const sel = await query("SELECT asset_id FROM redirector.assets WHERE content_kind='article' AND slug=$1 LIMIT 1", [art.slug]);
    if (sel.rows[0]) return { id: sel.rows[0].asset_id, created: false };
    const ins = await query(
      `INSERT INTO redirector.assets(content_kind,title,slug,storage_url,taxonomy_node_id,is_active)
       VALUES('article',$1,$2,$3,NULL,true) RETURNING asset_id`,
      [art.title || art.slug, art.slug, articleUrl(art.slug)]);
    return { id: ins.rows[0].asset_id, created: true };
  }
  // Album taxonomy node (parent = persona node). Songs hang off it, so a song's
  // breadcrumb is Persona > Album and its "related" is the album's other songs.
  async function upsertAlbumNode(code, title, parentId, sort) {
    const sel = await query("SELECT node_id FROM redirector.taxonomy_nodes WHERE level_key='album' AND slug=$1 LIMIT 1", [code]);
    if (sel.rows[0]) return sel.rows[0].node_id;
    const ins = await query(
      "INSERT INTO redirector.taxonomy_nodes(parent_node_id,level_key,title,slug,sort_order,is_active) VALUES($1,'album',$2,$3,$4,true) RETURNING node_id",
      [parentId, title, code, sort]);
    return ins.rows[0].node_id;
  }
  async function upsertSongAsset(code, track, nodeId) {
    const slug = `${code}#${track.n}`;
    const sel = await query("SELECT asset_id FROM redirector.assets WHERE content_kind='track' AND slug=$1 LIMIT 1", [slug]);
    if (sel.rows[0]) return { id: sel.rows[0].asset_id, created: false };
    const ins = await query(
      `INSERT INTO redirector.assets(content_kind,title,slug,storage_url,cover_image_url,taxonomy_node_id,sort_order,is_active)
       VALUES('track',$1,$2,$3,$4,$5,$6,true) RETURNING asset_id`,
      [track.title || `Track ${track.n}`, slug, songUrl(code, track.n), coverUrl(code), nodeId, track.n]);
    return { id: ins.rows[0].asset_id, created: true };
  }

  let assetsNew = 0, tokensNew = 0, songsNew = 0, articlesNew = 0, processed = 0;
  const samples = [];
  console.log(`APPLY${doMusic ? (SONGS ? ' music+songs' : ' music') : ''}${ARTICLES ? ' articles' : ''} — base ${BASE}${ONLY_PERSONA ? ` — persona ${ONLY_PERSONA}` : ''}${LIMIT !== Infinity ? ` — limit ${LIMIT}` : ''}`);

  if (doMusic) {
  const personas = loadPersonas();
  outer:
  for (let pi = 0; pi < personas.length; pi++) {
    const p = personas[pi];
    const nodeId = await upsertPersonaNode(p.slug, p.name, pi);
    const albums = p.albums || [];
    for (let ai = 0; ai < albums.length; ai++) {
      if (processed >= LIMIT) break outer;
      const al = albums[ai];
      const asset = await upsertAlbumAsset(al, nodeId, ai);
      if (asset.created) assetsNew++;
      const tok = await ensureToken(asset.id, 'album');
      if (tok.created) tokensNew++;
      if (samples.length < 3) samples.push({ title: al.title, code: al.code, token: tok.token });
      if (SONGS) {
        const albNode = await upsertAlbumNode(al.code, al.title, nodeId, ai);
        for (const tr of (al.tracks || [])) {
          if (!Number.isFinite(tr.n)) continue; // a track number is required for the deep-link
          try {
            const sa = await upsertSongAsset(al.code, tr, albNode);
            if (sa.created) assetsNew++;
            const st = await ensureToken(sa.id, 'track');
            if (st.created) { tokensNew++; songsNew++; }
          } catch (e) { console.error(`  skip song ${al.code}#${tr.n}: ${e.message}`); }
        }
      }
      processed++;
    }
  }
  } // end if (doMusic)

  if (ARTICLES) {
    const arts = loadArticles();
    let done = 0;
    for (const art of arts) {
      if (done >= LIMIT) break;
      if (!art || !art.slug) continue;
      try {
        const aa = await upsertArticleAsset(art);
        if (aa.created) assetsNew++;
        const at = await ensureToken(aa.id, 'article', false); // web-only: no landing page / app-gate
        if (at.created) { tokensNew++; articlesNew++; }
        if (samples.length < 3) samples.push({ title: art.title || art.slug, code: art.slug, token: at.token });
        done++;
      } catch (e) { console.error(`  skip article ${art.slug}: ${e.message}`); }
    }
  }

  console.log(`\nDONE — new assets ${assetsNew} | new tokens ${tokensNew}${SONGS ? ` (songs ${songsNew})` : ''}${ARTICLES ? ` (articles ${articlesNew})` : ''}`);
  for (const s of samples) {
    console.log(`  ${s.title}  [${s.code}]  → ${BASE}/r/${s.token}`);
  }
  process.exit(0);
}

if (APPLY) { apply().catch((e) => { console.error('INGEST ERROR:', e.message); process.exit(1); }); }
else { dryRun(); }
