#!/usr/bin/env node
// ============================================================================
// Redirector automation API — end-to-end smoke (requires a live DB).
//
// Mounts ONLY the redirector router on a throwaway Express app (so it needs no
// Stripe/SSO env), mints a scoped API key, then drives the whole §14 flow over
// HTTP: register asset -> taxonomy -> token -> QR image -> idempotent replay +
// 409 -> bulk -> campaign-set -> alias request/approve + resolve gating -> rule
// -> lookup -> retire -> health. Asserts each step.
//
// Requires migrations 0021 + 0030 applied. Skips (exit 0) if the DB is
// unreachable so it is safe to run in a DB-less environment.
//   Run: npm run redirector:smoke
// ============================================================================
import http from 'node:http';
import assert from 'node:assert/strict';
import express from 'express';
import { config } from '../src/config.js';
import { healthCheck, query } from '../src/db.js';
import { mintKey } from '../src/redirector/keys.js';
import redirectorRouter from '../src/routes/redirector.js';

const reachable = await Promise.race([healthCheck(), new Promise((r) => setTimeout(() => r(false), 2500))]);
if (!reachable) {
  console.log('SKIP: database not reachable — start Postgres and apply migrations, then re-run.');
  process.exit(0);
}
if (!(await query("SELECT to_regclass('redirector.tokens') AS t")).rows[0].t) {
  console.error('FAIL: redirector schema missing. Apply migrations 0021_redirector.sql and 0030_redirector_automation.sql.');
  process.exit(1);
}

// ---- throwaway server (redirector router only) ----------------------------
const app = express();
app.use(express.json());
app.use('/api/redirector', redirectorRouter);
const server = await new Promise((resolve) => {
  const s = http.createServer(app).listen(0, () => resolve(s));
});
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}/api/redirector`;

// ---- helpers ---------------------------------------------------------------
const key = (await mintKey({ consumer: 'admin_tooling', label: 'smoke', scopes: ['*'] })).rawKey;
let pass = 0;
async function call(method, path, { body, headers } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-redirector-key': key, ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON (e.g. an image) */ }
  return { status: res.status, json, text, headers: res.headers };
}
const step = (name) => { pass++; console.log(`  [PASS] ${name}`); };

try {
  // 1. taxonomy: persona -> album
  const persona = await call('POST', '/taxonomy/nodes', { body: { level_key: 'persona', title: 'SMOKE Persona' } });
  assert.equal(persona.status, 201, 'create persona node');
  const album = await call('POST', '/taxonomy/nodes', { body: { level_key: 'album', title: 'SMOKE Album', parent_node_id: persona.json.node_id } });
  assert.equal(album.status, 201);
  step('taxonomy nodes create (persona > album)');

  // 2. asset
  const asset = await call('POST', '/assets', { body: {
    content_kind: 'track', title: 'SMOKE Song of Restoration', storage_url: 'https://cdn.example.com/smoke.mp3',
    keywords: 'restoration, healing, psalms', summary: 'A test track for the smoke run.', taxonomy_node_id: album.json.node_id,
  } });
  assert.equal(asset.status, 201, 'register asset');
  const assetId = asset.json.asset_id;
  step('asset register');

  // 3. PATCH asset (mutable storage_url)
  const patched = await call('PATCH', `/assets/${assetId}`, { body: { storage_url: 'https://cdn2.example.com/smoke-v2.mp3' } });
  assert.equal(patched.status, 200, 'patch asset');
  step('asset patch (moved storage_url, token unaffected — §4)');

  // 4. token
  const idem = 'smoke-token-' + Date.now();
  const tok = await call('POST', '/tokens', { headers: { 'idempotency-key': idem }, body: { resolution_mode: 'asset', asset_id: assetId, landing_enabled: false } });
  assert.equal(tok.status, 201, 'issue token');
  const token = tok.json.token;
  assert.match(token, /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{12}$/, 'token shape (Base58, mixed case)');
  step(`token issue (${token})`);

  // 5. QR image (public)
  const svg = await call('GET', `/qr/${token}.svg`);
  assert.equal(svg.status, 200, 'qr svg 200');
  assert.ok(svg.text.startsWith('<svg'), 'qr is svg');
  step('QR svg served');

  // 6. idempotency: replay + mismatch
  const replay = await call('POST', '/tokens', { headers: { 'idempotency-key': idem }, body: { resolution_mode: 'asset', asset_id: assetId, landing_enabled: false } });
  assert.equal(replay.json.token, token, 'idempotent replay returns same token');
  assert.equal(replay.headers.get('idempotency-replayed'), 'true', 'replay header');
  const mism = await call('POST', '/tokens', { headers: { 'idempotency-key': idem }, body: { resolution_mode: 'asset', asset_id: assetId, landing_enabled: true } });
  assert.equal(mism.status, 409, 'idempotency-key reuse with different body -> 409');
  step('idempotency replay + 409 on body mismatch (§14.2)');

  // 7. bulk
  const bulk = await call('POST', '/tokens/bulk', { body: { items: [
    { resolution_mode: 'asset', asset_id: assetId }, { resolution_mode: 'asset', asset_id: assetId },
  ] } });
  assert.equal(bulk.status, 201); assert.equal(bulk.json.count, 2);
  step('tokens/bulk (2 issued)');

  // 8. campaign-set
  const camp = await call('POST', '/tokens/campaign-set', { body: { asset_id: assetId, campaign: 'SMOKE', placements: ['book_insert', 'album_sleeve', 'banner'] } });
  assert.equal(camp.status, 201); assert.equal(camp.json.count, 3);
  assert.equal(new Set(camp.json.tokens.map((t) => t.token)).size, 3, 'distinct placement tokens');
  step('campaign-set (3 distinct placement tokens, one asset — §17.2)');

  // 9. alias request -> resolve gated -> approve -> resolve
  const aliasName = 'SMOKE-' + Math.floor(port); // deterministic-ish, unique per run port
  const areq = await call('POST', '/aliases', { body: { token, alias: aliasName } });
  assert.equal(areq.status, 201); assert.equal(areq.json.status, 'pending');
  const beforeApprove = await call('GET', `/resolve/${aliasName}`, { headers: { 'x-redirector-internal': config.redirector.internalKey } });
  assert.equal(beforeApprove.json.outcome, 'notfound', 'pending alias must NOT resolve');
  const approve = await call('POST', `/aliases/${aliasName}/approve`);
  assert.equal(approve.status, 200, 'approve alias');
  const afterApprove = await call('GET', `/resolve/${aliasName}`, { headers: { 'x-redirector-internal': config.redirector.internalKey } });
  assert.equal(afterApprove.json.outcome, 'redirect', 'approved alias resolves');
  assert.equal(afterApprove.json.viaAlias, aliasName, 'resolved via alias');
  step('alias request pending -> gated -> approve -> resolves (§3.5)');

  // 10. rule (geo_route requires default_region)
  const badRule = await call('POST', '/rules', { body: { name: 'SMOKE geo', strategy: 'geo_route', fallback_asset_id: assetId } });
  assert.equal(badRule.status, 400, 'geo_route without default_region -> 400 (§7.2)');
  const rule = await call('POST', '/rules', { body: { name: 'SMOKE geo', strategy: 'geo_route', default_region: 'RO', fallback_asset_id: assetId } });
  assert.equal(rule.status, 201, 'create rule');
  step('rule create + geo_route default_region enforced (§7.2)');

  // 11. lookup
  const look = await call('GET', '/lookup?kind=track&q=restoration&limit=3');
  assert.equal(look.status, 200);
  assert.ok(look.json.results.some((r) => r.token === token), 'lookup finds the token');
  assert.ok(look.json.results[0].path && look.json.results[0].path.includes('SMOKE Album'), 'lookup builds taxonomy path');
  step('lookup by keyword returns token + path (§15.1)');

  // 12. retire
  const retire = await call('POST', `/tokens/${token}/retire`);
  assert.equal(retire.status, 200); assert.equal(retire.json.state, 'retired');
  const afterRetire = await call('GET', `/resolve/${token}`, { headers: { 'x-redirector-internal': config.redirector.internalKey } });
  assert.equal(afterRetire.json.outcome, 'retired', 'retired token serves retired outcome (§5.2)');
  step('retire -> resolves as retired, not 404 (§5.2)');

  // 13. health
  const health = await call('GET', '/health/assets?all=1');
  assert.equal(health.status, 200);
  step('health/assets read');

  // 14. reports (§17)
  const ov = await call('GET', '/reports/overview');
  assert.equal(ov.status, 200); assert.ok('resolutions' in (ov.json || {}), 'overview shape');
  const top = await call('GET', '/reports/top-tokens');
  assert.equal(top.status, 200); assert.ok(Array.isArray(top.json.tokens), 'top-tokens shape');
  const bd = await call('GET', '/reports/breakdown?dimension=device');
  assert.equal(bd.status, 200); assert.ok(Array.isArray(bd.json.rows), 'breakdown shape');
  const campRpt = await call('GET', `/reports/campaign/${assetId}`);
  assert.equal(campRpt.status, 200); assert.ok(Array.isArray(campRpt.json.placements), 'campaign shape');
  const pr = await call('GET', '/reports/probes');
  assert.equal(pr.status, 200); assert.ok('total' in (pr.json || {}), 'probes shape');
  step('reports: overview / top-tokens / breakdown / campaign / probes (§17)');

  console.log(`\nAll ${pass} smoke steps passed.`);
  process.exit(0);
} catch (err) {
  console.error('\nSMOKE FAILED:', err.message);
  process.exit(1);
} finally {
  server.close();
}
