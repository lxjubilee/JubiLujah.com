#!/usr/bin/env node
// ============================================================================
// Reports — offline check (no DB). software/redirector.md §17.
// Verifies the pure helpers (range defaulting + referrer bucketing). The SQL
// aggregates are exercised by the DB-gated smoke. Run: npm run redirector:reports
// ============================================================================
import assert from 'node:assert/strict';
import { parseRange, referrerBucket } from '../src/redirector/reports.js';

let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };
console.log('Reports helpers (offline)\n');

{
  const { start, end } = parseRange();
  const days = (end.getTime() - start.getTime()) / 86_400_000;
  assert.ok(Math.abs(days - 90) < 0.01, 'default range is 90 days');
  const custom = parseRange('2026-01-01', '2026-01-31');
  assert.equal(custom.start.toISOString().slice(0, 10), '2026-01-01');
  assert.equal(custom.end.toISOString().slice(0, 10), '2026-01-31');
  ok('parseRange: default 90d, honors explicit from/to');
}

{
  assert.equal(referrerBucket(null), 'direct / QR scan');
  assert.equal(referrerBucket(''), 'direct / QR scan');
  assert.equal(referrerBucket('https://jubileepraise.com/album/x'), 'jubileepraise.com');
  assert.equal(referrerBucket('http://t.co/abc'), 't.co');
  ok('referrerBucket: empty -> direct/QR, else host (§17.1)');
}

console.log(`\nAll ${n} reports helper checks passed.`);
