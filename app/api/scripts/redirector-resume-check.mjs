#!/usr/bin/env node
// ============================================================================
// Resume tokens — offline check (no DB). software/redirector.md §6.6 / §20.6.
//
// Drives the pure engine (mergeEffective, nextUnconsumed, resolveResume,
// advanceResume) with injected progress deps: fresh reader -> chapter one, a
// returning one -> the next chapter, cookie/account merge to the further position
// (never backward), clamp at the end, start-over reset, and unreadable-progress
// safety. Run: npm run redirector:resume
// ============================================================================
import assert from 'node:assert/strict';
import { mergeEffective, nextUnconsumed, resolveResume, advanceResume } from '../src/redirector/resume.js';

let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };
const kids = [
  { asset_id: 'c1', title: 'Chapter 1', sort_order: 1 },
  { asset_id: 'c2', title: 'Chapter 2', sort_order: 2 },
  { asset_id: 'c3', title: 'Chapter 3', sort_order: 3 },
];
console.log('Resume tokens (offline)\n');

// mergeEffective — further position, never backward
assert.equal(mergeEffective(null, null), null);
assert.equal(mergeEffective(1, null), 1);
assert.equal(mergeEffective(null, 2), 2);
assert.equal(mergeEffective(1, 2), 2);
assert.equal(mergeEffective(3, 1), 3);
ok('mergeEffective: further position, never backward (§6.6)');

// nextUnconsumed
assert.equal(nextUnconsumed(kids, null).asset_id, 'c1');
assert.equal(nextUnconsumed(kids, 1).asset_id, 'c2');
assert.equal(nextUnconsumed(kids, 3).asset_id, 'c3'); // clamp, never dead-end
assert.equal(nextUnconsumed([], null), null);
ok('nextUnconsumed: first / next / clamp at end');

// §20.6 — fresh browser -> chapter one
{
  const r = await resolveResume(kids, { cookiePos: null, accountId: null });
  assert.equal(r.child.asset_id, 'c1'); assert.equal(r.index, 0); assert.equal(r.count, 3);
  ok('fresh scanner resolves to chapter one (§20.6)');
}
// §20.6 — returning reader -> the correct later chapter
{
  const r = await resolveResume(kids, { cookiePos: 1, accountId: null });
  assert.equal(r.child.asset_id, 'c2');
  const r2 = await resolveResume(kids, { cookiePos: 2, accountId: null });
  assert.equal(r2.child.asset_id, 'c3');
  ok('returning scanner resolves to the next chapter (§20.6)');
}
// §20.6 — SSO account follows across devices (account position wins on a fresh device)
{
  const deps = { readAccount: async () => 2 };
  const r = await resolveResume(kids, { cookiePos: null, accountId: 'u1' }, deps); // new device, no cookie
  assert.equal(r.child.asset_id, 'c3', 'account progress carries to a device with no cookie');
  const merged = await resolveResume(kids, { cookiePos: 1, accountId: 'u1' }, deps); // cookie behind account
  assert.equal(merged.child.asset_id, 'c3', 'further of cookie/account wins');
  ok('SSO account progress follows across devices; merges forward (§6.6/§20.6)');
}
// reset (start over) -> chapter one
{
  const r = await resolveResume(kids, { cookiePos: 2, accountId: null, reset: true });
  assert.equal(r.child.asset_id, 'c1');
  ok('start over resets to chapter one');
}
// unreadable progress -> first child, never error (§9.4)
{
  const deps = { readAccount: async () => { throw new Error('db down'); } };
  const r = await resolveResume(kids, { cookiePos: null, accountId: 'u1' }, deps);
  assert.equal(r.child.asset_id, 'c1');
  ok('unreadable account progress falls back to first child (§9.4)');
}
// advanceResume — forward-only cookie merge + account write
{
  const writes = [];
  const deps = { writeAccount: async (accountId, assetId, pos) => writes.push([accountId, assetId, pos]) };
  const newPos = await advanceResume({ cookiePos: 1, accountId: 'u1' }, kids[1], deps); // consume c2 (sort 2)
  assert.equal(newPos, 2, 'cookie advances to consumed position');
  assert.deepEqual(writes, [['u1', 'c2', 2]], 'account write recorded');
  const noBack = await advanceResume({ cookiePos: 5, accountId: null }, kids[0], {}); // consume c1 while ahead
  assert.equal(noBack, 5, 'never moves the cookie backward');
  ok('advanceResume: forward-only cookie + account write');
}

console.log(`\nAll ${n} resume checks passed.`);
