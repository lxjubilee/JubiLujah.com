#!/usr/bin/env node
// ============================================================================
//  check-tenants — do tenants/*.json and app/web/lib/tenants.ts still agree?
// ============================================================================
//
// TWO FILES DESCRIBE THE SAME THREE SITES, AND THEY MUST NOT DRIFT.
//
//   app/web/lib/tenants.ts   what the RUNNING SITE serves. Imported by the
//                            layout, the header and lib/manifest's scope check,
//                            so it is authoritative for anything a visitor sees.
//
//   tenants/<host>.json      what the TOOLING reads — the WPF studio's website
//                            picker, and any script that needs a tenant's disk
//                            folder or CDN prefix. It also carries operational
//                            facts the TypeScript has no business holding.
//
// The overlap between them (key, hosts, brand, nav, catalogue scope) is copied,
// and copied data rots. This is the gate that stops it: it fails loudly the
// first time someone edits one and forgets the other, which is the only moment
// the mismatch is cheap to fix.
//
//   node tools/check-tenants.mjs            structure + drift
//   node tools/check-tenants.mjs --drive    also verify the J: folders exist
//
// Exit 0 = they agree. Exit 1 = they do not, and the differences are listed.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const TS = join(REPO, 'app', 'web', 'lib', 'tenants.ts');
const DIR = join(REPO, 'tenants');
const CHECK_DRIVE = process.argv.includes('--drive');

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// ---- the TypeScript side -------------------------------------------------
//
// The array literal is plain JavaScript once the `: Tenant[]` annotation is
// gone, so it is evaluated rather than pattern-matched. A regex over this would
// be a third description of the same data and would rot alongside the other two.
function readTs() {
  const src = readFileSync(TS, 'utf8');
  const at = src.indexOf('export const TENANTS');
  if (at < 0) throw new Error('no `export const TENANTS` in ' + TS);
  // AFTER THE `=`, not after `TENANTS`. The declaration reads
  //     export const TENANTS: Tenant[] = [
  // so the first bracket following the name is the one in `Tenant[]`, and
  // scanning from there matches an empty array and finds no tenants at all.
  const eq = src.indexOf('=', at);
  const open = src.indexOf('[', eq);

  let depth = 0, quote = null, end = -1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c.charCodeAt(0) === 92) { i++; continue; }   // a backslash escapes the next char
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']' && --depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error('unterminated TENANTS array in ' + TS);

  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(open, end + 1) + ')');
}

// ---- the JSON side -------------------------------------------------------
function readJson() {
  if (!existsSync(DIR)) throw new Error('no tenants/ folder at ' + DIR);
  const files = readdirSync(DIR).filter((f) => f.endsWith('.json')).sort();
  return files.map((file) => {
    let data;
    try { data = JSON.parse(readFileSync(join(DIR, file), 'utf8')); }
    catch (e) { fail(`${file}: not valid JSON — ${e.message}`); return null; }

    if (data.schema !== 'jl.tenant/2') fail(`${file}: schema is ${JSON.stringify(data.schema)}, expected "jl.tenant/2"`);
    // The filename IS the primary host. A file that disagrees with its own name
    // is the kind of thing nobody notices until a lookup silently misses.
    if (data.tenant !== file.replace(/\.json$/, '')) fail(`${file}: "tenant" is ${JSON.stringify(data.tenant)} but the filename says ${JSON.stringify(file.replace(/\.json$/, ''))}`);
    if (data.hosts?.[0] !== data.tenant) fail(`${file}: hosts[0] must be the primary host ${JSON.stringify(data.tenant)}, got ${JSON.stringify(data.hosts?.[0])}`);
    return { file, data };
  }).filter(Boolean);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- compare -------------------------------------------------------------
let ts, js;
try { ts = readTs(); js = readJson(); }
catch (e) { console.error('check-tenants: ' + e.message); process.exit(1); }

const byKey = new Map(js.map((j) => [j.data.key, j]));

for (const t of ts) {
  const hit = byKey.get(t.key);
  if (!hit) { fail(`lib/tenants.ts has "${t.key}" (${t.name}) with no tenants/*.json file`); continue; }
  byKey.delete(t.key);

  const { file, data } = hit;
  const cmp = [
    ['name / site', t.name, data.site],
    ['hosts', t.hosts, data.hosts],
    ['brandLead', t.brandLead, data.brand?.lead],
    ['brandTail', t.brandTail, data.brand?.tail],
    ['accent', t.accent, data.brand?.accent],
    ['logo', t.logo, data.brand?.logo],
    ['tagline', t.tagline, data.tagline],
    ['description', t.description, data.description],
    // `?? undefined` would be wrong here: it folds null into undefined, and
    // null is a MEANINGFUL value in this field — the whole catalogue.
    ['categories', t.categories, data.catalogue && 'categories' in data.catalogue ? data.catalogue.categories : undefined],
    ['nav', t.nav, data.nav],
  ];
  for (const [field, a, b] of cmp)
    if (!same(a, b)) fail(`${file} ↔ lib/tenants.ts disagree on ${field}:\n      ts   ${JSON.stringify(a)}\n      json ${JSON.stringify(b)}`);

  // Only JubileePraise may carry the whole catalogue, and only it may be the default.
  const isDefault = ts[0].key === t.key;
  if (!!data.isDefault !== isDefault) fail(`${file}: isDefault is ${!!data.isDefault} but lib/tenants.ts makes ${isDefault ? '' : 'another tenant '}the DEFAULT_TENANT`);
  if (t.categories === null && !isDefault) fail(`${file}: only the default tenant may carry the whole catalogue`);

  // generateMetadata() builds these from name + tagline. A tenant file that
  // states a title layout would never emit is documentation that lies, which is
  // worse than none — so the stated strings are derived and compared, not trusted.
  if (data.seo) {
    const wantDefault = `${t.name} — ${t.tagline}`;
    const wantTemplate = `%s — ${t.name}`;
    if (data.seo.titleDefault !== wantDefault) fail(`${file}: seo.titleDefault is ${JSON.stringify(data.seo.titleDefault)}, but layout.tsx builds ${JSON.stringify(wantDefault)}`);
    if (data.seo.titleTemplate !== wantTemplate) fail(`${file}: seo.titleTemplate is ${JSON.stringify(data.seo.titleTemplate)}, but layout.tsx builds ${JSON.stringify(wantTemplate)}`);
    if (data.seo.openGraph?.siteName !== t.name) fail(`${file}: seo.openGraph.siteName must be ${JSON.stringify(t.name)}`);
    if (data.seo.openGraph?.description !== t.tagline) fail(`${file}: seo.openGraph.description is the TAGLINE in layout.tsx, expected ${JSON.stringify(t.tagline)}`);
    // Only JubileePraise reads NEXT_PUBLIC_SITE_URL; the others derive from hosts[0].
    const wantCanonical = isDefault ? '$NEXT_PUBLIC_SITE_URL' : `https://${t.hosts[0]}`;
    if (data.seo.canonical !== wantCanonical) fail(`${file}: seo.canonical is ${JSON.stringify(data.seo.canonical)}, expected ${JSON.stringify(wantCanonical)}`);
  }

  // One process, one port, one runbook. A tenant file claiming otherwise would
  // send someone to restart something that does not exist.
  if (data.production) {
    if (data.production.pm2 !== 'jubileepraise-web') fail(`${file}: production.pm2 is ${JSON.stringify(data.production.pm2)}; all three sites are served by "jubileepraise-web"`);
    if (data.production.port !== 3030) fail(`${file}: production.port is ${JSON.stringify(data.production.port)}; all three sites are served on 3030`);
  }
  if (data.deploy && data.deploy.scoped !== false) fail(`${file}: deploy.scoped must be false — one process serves all three hosts, so a deploy ships them together`);

  // The scope the studio uses must be reachable FROM the declared studio root,
  // or the picker silently falls back to deriving it from the manifest.
  const md = data.catalogue?.musicDrive, sr = data.catalogue?.studioMusicRoot;
  // The PARENT must be the studio root, not merely an ancestor: the studio
  // enumerates exactly one level down, so a grandparent would list the wrong
  // folders as voices.
  if (md && sr && t.categories && md.split('/').slice(0, -1).join('/') !== sr)
    fail(`${file}: catalogue.musicDrive must sit directly under studioMusicRoot — the studio lists one level down as voices
      musicDrive      ${md}
      studioMusicRoot ${sr}`);

  if (CHECK_DRIVE) {
    for (const key of ['musicDrive', 'studioMusicRoot']) {
      const p = data.catalogue?.[key];
      if (p && !existsSync(p)) warn(`${file}: ${key} not on this machine — ${p}`);
    }
  }
}

for (const leftover of byKey.values())
  fail(`tenants/${leftover.file} declares key "${leftover.data.key}" which lib/tenants.ts does not serve`);

// ---- report --------------------------------------------------------------
for (const w of warnings) console.log('  ⚠ ' + w);

if (problems.length === 0) {
  console.log(`✓ ${ts.length} tenant(s) — tenants/*.json and app/web/lib/tenants.ts agree.`);
  process.exit(0);
}
console.error(`\n✗ ${problems.length} problem(s):\n`);
for (const p of problems) console.error('  • ' + p);
console.error('\nOne of the two was edited without the other. app/web/lib/tenants.ts is what the site serves;');
console.error('tenants/*.json is what the tooling reads. Make them match before shipping.\n');
process.exit(1);
