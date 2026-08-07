#!/usr/bin/env node
// ============================================================================
// Flat-file failover — offline check (no DB). software/redirector.md §9.6.
//
// Serializes a snapshot, persists it to a temp dir, loads it back, and resolves
// asset / alias / device-routed / rule-fallback / resume-first-child / unknown
// exactly as the resolver would in DB-down mode. Also checks the scan-buffer
// NDJSON round-trip. Exits non-zero on any failure.  Run: npm run redirector:failover
// ============================================================================
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { serializeSnapshot, persistSnapshot, loadSnapshot, resolveFromSnapshot } from '../src/redirector/failover/snapshot.js';
import { parseBuffer } from '../src/redirector/failover/scanBuffer.js';

const dir = path.join(os.tmpdir(), 'rdr-failover-' + process.pid);
let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };

console.log('Redirector failover (offline)\n');

const tokenRows = [
  { token: 'K7M9P2XR4TWB', state: 'active', resolution_mode: 'asset', asset_url: 'https://cdn.example.com/song.mp3', device_routes_json: null },
  { token: 'H3NQ8FVJ5CDY', state: 'active', resolution_mode: 'asset', asset_url: 'https://web.example.com/album',
    device_routes_json: { ios: 'https://apps.apple.com/app', android: 'https://play.google.com/app', default: 'https://web.example.com/album' } },
  { token: 'RVLE9FVJ5CDK', state: 'active', resolution_mode: 'rule', rule_fallback_url: 'https://cdn.example.com/daily-fallback.mp3' },
  { token: 'RESVME3CDK92', state: 'active', resolution_mode: 'resume', first_child_url: 'https://cdn.example.com/chapter-1.mp3' },
  { token: 'NODESTXXXXXX', state: 'active', resolution_mode: 'asset', asset_url: null }, // no dest -> excluded
];
const aliasRows = [{ alias: 'DANIEL7', token: 'K7M9P2XR4TWB' }];

const payload = serializeSnapshot(tokenRows, aliasRows);
assert.equal(payload.manifest.counts.tokens, 4, 'destination-less token excluded');
assert.equal(payload.manifest.counts.aliases, 1);
ok('serialize excludes destination-less tokens; counts correct');

await persistSnapshot(payload, dir);
const snap = await loadSnapshot(dir);
assert.ok(snap && snap.tokens['K7M9P2XR4TWB'], 'snapshot loads from disk');
ok('persist + load round-trip');

const a = await resolveFromSnapshot('K7M9P2XR4TWB', { deviceClass: 'desktop' }, dir);
assert.equal(a.destination, 'https://cdn.example.com/song.mp3');
assert.equal(a.outcome, 'redirect'); assert.equal(a.status, 302); assert.equal(a.degraded, true);
ok('asset token resolves (302, degraded)');

const al = await resolveFromSnapshot('DANIEL7', { deviceClass: 'desktop' }, dir);
assert.equal(al.token, 'K7M9P2XR4TWB'); assert.equal(al.viaAlias, 'DANIEL7');
ok('approved alias resolves to its token');

const ios = await resolveFromSnapshot('H3NQ8FVJ5CDY', { deviceClass: 'mobile', userAgent: 'iPhone iOS' }, dir);
assert.equal(ios.destination, 'https://apps.apple.com/app', 'iOS route');
const andr = await resolveFromSnapshot('H3NQ8FVJ5CDY', { deviceClass: 'mobile', userAgent: 'Android Mobile' }, dir);
assert.equal(andr.destination, 'https://play.google.com/app', 'Android route');
const desk = await resolveFromSnapshot('H3NQ8FVJ5CDY', { deviceClass: 'desktop' }, dir);
assert.equal(desk.destination, 'https://web.example.com/album', 'desktop -> default route');
ok('device routing applies in failover (§6.4)');

const rule = await resolveFromSnapshot('RVLE9FVJ5CDK', { deviceClass: 'desktop' }, dir);
assert.equal(rule.destination, 'https://cdn.example.com/daily-fallback.mp3', 'rule -> fallback');
const resume = await resolveFromSnapshot('RESVME3CDK92', { deviceClass: 'desktop' }, dir);
assert.equal(resume.destination, 'https://cdn.example.com/chapter-1.mp3', 'resume -> first child');
ok('rule -> fallback, resume -> first child (§9.6)');

const miss = await resolveFromSnapshot('ZZZZZZZZZZZZ', { deviceClass: 'desktop' }, dir);
assert.equal(miss, null, 'unknown -> null (caller serves notfound)');
ok('unknown token returns null');

const buf = parseBuffer('["K7M9P2XR4TWB",null,"aid",null,null,"iphash","ua","mobile",null,"US",false,false]\n\n["H3NQ8FVJ5CDY"]\n');
assert.equal(buf.length, 2, 'scan buffer parses NDJSON lines, skips blanks');
ok('scan-buffer NDJSON round-trip');

await fs.rm(dir, { recursive: true, force: true });
console.log(`\nAll ${n} failover checks passed.`);
