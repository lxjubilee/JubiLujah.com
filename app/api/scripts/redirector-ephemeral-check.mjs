#!/usr/bin/env node
// ============================================================================
// Ephemeral persona tokens — offline check (no DB). software/redirector.md §6.7.
//
// Verifies the /rp/ QR payload actually decodes to an /RP/ URL, and the 30-day
// hard-expiry decision. Mint + resolve are DB-backed (covered by the smoke run).
// Run: npm run redirector:ephemeral
// ============================================================================
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { tokenPayload } from '../src/redirector/qr/payload.js';
import { buildMatrix } from '../src/redirector/qr/render.js';
import { matrixToRgba } from '../src/redirector/qr/verify.js';
import { isEphemeralExpired } from '../src/redirector/ephemeral.js';

let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };
console.log('Ephemeral persona tokens (offline)\n');

// payload prefix
assert.ok(tokenPayload('K7M9P2XR4TWB', 'RP').includes('/RP/K7M9P2XR4TWB'), 'RP payload');
assert.ok(tokenPayload('K7M9P2XR4TWB', 'R').includes('/R/K7M9P2XR4TWB'), 'R payload');
ok('tokenPayload builds /RP/ vs /R/ URLs (§6.7)');

// the rendered /rp/ QR really decodes to an /RP/ URL
{
  const m = buildMatrix('K7M9P2XR4TWB', 'standard', undefined, 'RP');
  const img = matrixToRgba(m, 8);
  const decoded = jsQR(img.data, img.width, img.height);
  assert.ok(decoded, 'decodes');
  assert.ok(decoded.data.includes('/RP/K7M9P2XR4TWB'), `decoded payload is an /RP/ URL: ${decoded.data}`);
  ok('rendered persona QR decodes to the /rp/ URL');
}

// hard expiry (30 days) decision
{
  const now = new Date('2026-08-02T00:00:00Z');
  assert.equal(isEphemeralExpired(new Date('2026-07-01T00:00:00Z'), now), true, 'past -> expired');
  assert.equal(isEphemeralExpired(new Date('2026-09-01T00:00:00Z'), now), false, 'future -> live');
  assert.equal(isEphemeralExpired(null, now), false, 'no expiry -> not expired');
  ok('isEphemeralExpired: past expired, future live (§6.7)');
}

console.log(`\nAll ${n} ephemeral checks passed.`);
