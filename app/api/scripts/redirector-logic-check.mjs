#!/usr/bin/env node
// ============================================================================
// Redirector automation — pure-logic checks (no DB required).
//
// Exercises the deterministic pieces of Phase 5: API-key hashing/format, the
// SSO role mapping, the rate-limit key derivation, and the token/alias
// validators. Endpoint behavior that touches the database is covered by
// scripts/redirector-api-smoke.mjs (run against a live stack). Exits non-zero
// on any failure.  Run: npm run redirector:check
// ============================================================================
import assert from 'node:assert/strict';
import { hashKey, generateRawKey } from '../src/redirector/keys.js';
import { roleFor, redirectorRateKey } from '../src/middleware/redirectorAuth.js';
import { isValidTokenShape, isValidAliasShape, isBlocked, normalize } from '../src/redirector/tokens.js';

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log(`  [PASS] ${name}`); };

console.log('Redirector logic checks\n');

ok('hashKey is deterministic 64-hex', () => {
  const h1 = hashKey('rdk_p_abc');
  const h2 = hashKey('rdk_p_abc');
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(hashKey('rdk_p_abc'), hashKey('rdk_p_abd'));
});

ok('generateRawKey format rdk_<initial>_<48hex>', () => {
  const k = generateRawKey('pipeline');
  assert.match(k, /^rdk_p_[0-9a-f]{48}$/);
  assert.notEqual(generateRawKey('persona'), generateRawKey('persona')); // random
});

ok('roleFor maps redirector roles -> app RBAC ladder', () => {
  assert.equal(roleFor('viewer'), 'viewer');
  assert.equal(roleFor('editor'), 'content_editor');
  assert.equal(roleFor('manager'), 'executive');
  assert.equal(roleFor('owner'), 'admin');
});

ok('redirectorRateKey buckets by API key, then SSO, then IP', () => {
  const withKey = { get: (h) => (h === 'x-redirector-key' ? 'rdk_p_deadbeef00112233' : null), auth: null, ip: '1.2.3.4' };
  assert.ok(redirectorRateKey(withKey).startsWith('rdk:'));
  const withSso = { get: () => null, auth: { userId: 'u123' }, ip: '1.2.3.4' };
  assert.equal(redirectorRateKey(withSso), 'rdr-sso:u123');
  const anon = { get: () => null, auth: null, ip: '9.9.9.9' };
  assert.equal(redirectorRateKey(anon), '9.9.9.9');
});

ok('token shape validator (§3.2 alphabet, excludes I L O U 0 1)', () => {
  assert.ok(isValidTokenShape('K7M9P2XR4TWB'));
  assert.ok(!isValidTokenShape('K7M9P2XR4TW')); // 11 chars
  assert.ok(!isValidTokenShape('K7M9P2XR4TW0')); // contains 0
  assert.ok(!isValidTokenShape('K7M9P2XR4TWI')); // contains I
});

ok('alias shape validator (§3.5: 4-20, A-Z0-9 + hyphen, no edge hyphen)', () => {
  assert.ok(isValidAliasShape('DANIEL7'));
  assert.ok(isValidAliasShape('SUMMER-2026'));
  assert.ok(!isValidAliasShape('-LEAD'));   // leading hyphen
  assert.ok(!isValidAliasShape('LEAD-'));   // trailing hyphen
  assert.ok(!isValidAliasShape('AB'));      // too short
});

ok('blocklist screens reserved words + profanity (§3.4)', () => {
  assert.ok(isBlocked('ADMIN'));
  assert.ok(isBlocked('login-page'.toUpperCase()));
  assert.ok(!isBlocked('DANIEL7'));
});

ok('normalize trims + uppercases (§9.1)', () => {
  assert.equal(normalize('  k7m9p2xr4twb '), 'K7M9P2XR4TWB');
});

console.log(`\nAll ${n} logic checks passed.`);
