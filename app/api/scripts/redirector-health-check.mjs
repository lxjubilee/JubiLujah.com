#!/usr/bin/env node
// ============================================================================
// Health watcher — offline check (no DB). software/redirector.md §16 / §20.11.
//
// Stands up a local HTTP server serving a good URL, a redirect, a broken URL, a
// known-good file, and a tampered file, then drives the watcher's check
// functions against them. Proves the watcher detects a deliberately broken
// asset URL and a deliberately altered file within one cycle (acceptance §20.11),
// and that the per-host throttle spaces requests (§16.3). Run: npm run redirector:health-check
// ============================================================================
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { checkUrl, verifyChecksum, checkAsset, HostThrottle } from '../src/redirector/health/watcher.js';

const GOOD = 'HELLO-WORLD';
const shaGood = crypto.createHash('sha256').update(GOOD).digest('hex');

const server = http.createServer((req, res) => {
  const url = req.url;
  if (url === '/good') { res.writeHead(200); return res.end(req.method === 'HEAD' ? undefined : 'ok'); }
  if (url === '/moved') { res.writeHead(302, { Location: '/good' }); return res.end(); }
  if (url === '/broken') { res.writeHead(404); return res.end(); }
  if (url === '/file') { res.writeHead(200, { 'content-length': Buffer.byteLength(GOOD) }); return res.end(req.method === 'HEAD' ? undefined : GOOD); }
  if (url === '/tampered') { const b = 'TAMPERED-BYTES'; res.writeHead(200, { 'content-length': Buffer.byteLength(b) }); return res.end(req.method === 'HEAD' ? undefined : b); }
  res.writeHead(500); res.end();
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };

console.log('Redirector health watcher (offline)\n');

try {
  assert.equal((await checkUrl(`${base}/good`)).status, 'ok');
  assert.equal((await checkUrl(`${base}/moved`)).status, 'ok', 'redirect followed');
  assert.equal((await checkUrl(`${base}/broken`)).status, 'unreachable');
  assert.equal((await checkUrl('http://127.0.0.1:1/nope', { timeoutMs: 1500 })).status, 'unreachable', 'connection refused');
  ok('HEAD reachability: good/redirect ok, broken/refused unreachable');

  assert.equal((await verifyChecksum(`${base}/file`, shaGood)).status, 'ok');
  assert.equal((await verifyChecksum(`${base}/tampered`, shaGood)).status, 'checksum_mismatch');
  ok('checksum: matching file ok, altered file mismatch');

  // §20.11 — a deliberately broken URL is detected as a bad transition + alert.
  const broken = await checkAsset({ storage_url: `${base}/broken`, health_status: 'ok' });
  assert.equal(broken.next, 'unreachable'); assert.equal(broken.alert, true);
  ok('broken asset URL detected (transition + alert)');

  // §20.11 — a deliberately altered file is detected as checksum_mismatch + alert.
  const tampered = await checkAsset({ storage_url: `${base}/tampered`, checksum_sha256: shaGood, health_status: 'ok', checksum_checked_at: null });
  assert.equal(tampered.next, 'checksum_mismatch'); assert.equal(tampered.alert, true);
  assert.equal(tampered.checksumChecked, true);
  ok('altered file detected (checksum_mismatch + alert)');

  // Healthy file with a good checksum: ok, no alert.
  const healthy = await checkAsset({ storage_url: `${base}/file`, checksum_sha256: shaGood, health_status: 'ok', checksum_checked_at: null });
  assert.equal(healthy.next, 'ok'); assert.equal(healthy.alert, false);
  ok('healthy asset stays ok, no alert');

  // No re-alert when already in the bad state (transition-only alerting).
  const stillBroken = await checkAsset({ storage_url: `${base}/broken`, health_status: 'unreachable' });
  assert.equal(stillBroken.alert, false, 'no repeat alert while already unreachable');
  ok('alerts fire on transition only, not every cycle');

  // §16.3 — per-host throttle spaces requests (20 rps -> ~50ms gap).
  const throttle = new HostThrottle(20);
  const t0 = Date.now();
  await throttle.wait('h'); await throttle.wait('h'); await throttle.wait('h');
  assert.ok(Date.now() - t0 >= 90, 'three same-host waits spaced by ~50ms each');
  ok('per-host throttle spacing (§16.3)');

  console.log(`\nAll ${n} health-watcher checks passed.`);
  process.exit(0);
} catch (err) {
  console.error('\nHEALTH CHECK FAILED:', err.message);
  process.exit(1);
} finally {
  server.close();
}
