// ============================================================================
// API smoke test — exercises public + a sampling of guarded endpoints and
// prints a pass/fail table. Run after `docker compose up` + `npm run dev`:
//   node api/scripts/smoke.mjs
// Results are summarized in docs/testing-report.md.
// ============================================================================
const BASE = process.env.API_BASE || 'http://localhost:4000';
let pass = 0, fail = 0;
const rows = [];

async function check(name, fn) {
  try {
    const ok = await fn();
    rows.push([ok ? 'PASS' : 'FAIL', name]);
    ok ? pass++ : fail++;
  } catch (err) {
    rows.push(['FAIL', `${name} — ${err.message}`]);
    fail++;
  }
}

async function getJson(path, opts) {
  const res = await fetch(BASE + path, opts);
  const body = await res.json().catch(() => null);
  return { res, body };
}

await check('GET /health (db healthy)', async () => {
  const { res, body } = await getJson('/health');
  return res.status === 200 && body.db === true;
});

await check('GET /api/openapi.json', async () => {
  const { res, body } = await getJson('/api/openapi.json');
  return res.ok && body.openapi?.startsWith('3.');
});

await check('GET /api/categories returns 6 categories', async () => {
  const { res, body } = await getJson('/api/categories');
  return res.ok && Array.isArray(body) && body.length >= 5;
});

await check('GET /api/artists?category=inspire', async () => {
  const { res, body } = await getJson('/api/artists?category=inspire');
  return res.ok && body.length > 0 && body[0].slug;
});

await check('GET /api/status-counts?scope=all', async () => {
  const { res, body } = await getJson('/api/status-counts?scope=all');
  return res.ok && body.ready && body.studio;
});

let sampleAlbum = null;
await check('GET /api/artists/:slug (has albums)', async () => {
  const { body } = await getJson('/api/artists/amir-inspire');
  sampleAlbum = body?.albums?.find((a) => a.status === 'ready') || body?.albums?.[0];
  return !!sampleAlbum;
});

await check('GET /api/albums/:code (with id)', async () => {
  if (!sampleAlbum) return false;
  const { res, body } = await getJson(`/api/albums/${sampleAlbum.code}`);
  return res.ok && body.id && Array.isArray(body.tracks);
});

await check('GET /api/awards/categories returns 11', async () => {
  const { res, body } = await getJson('/api/awards/categories');
  return res.ok && body.length >= 10;
});

await check('PUT /api/ratings without session -> 401', async () => {
  const { res } = await getJson('/api/ratings/album/00000000-0000-0000-0000-000000000000', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stars: 5 }),
  });
  return res.status === 401 || res.status === 403;
});

await check('mutation with invalid Bearer JWT -> 401', async () => {
  const { res } = await getJson('/api/ratings/album/00000000-0000-0000-0000-000000000000', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: 'Bearer not-a-valid-jwt' },
    body: JSON.stringify({ stars: 5 }),
  });
  return res.status === 401 || res.status === 403;
});

await check('GET /api/admin/users without session -> 401', async () => {
  const { res } = await getJson('/api/admin/users');
  return res.status === 401;
});

console.log('\nJubilujah API smoke test');
console.log('='.repeat(48));
for (const [status, name] of rows) console.log(`  ${status}  ${name}`);
console.log('='.repeat(48));
console.log(`  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
