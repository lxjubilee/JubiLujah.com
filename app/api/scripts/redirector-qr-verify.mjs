#!/usr/bin/env node
// ============================================================================
// QR scan-verification harness — software/redirector.md §10.5 / acceptance §20.9.
//
// For every brand style in qr.style.json, render every variant at minimum print
// size, decode it programmatically, and assert the decoded payload matches the
// canonical URL and that contrast/quiet-zone floors hold. Exits non-zero on any
// failure so this can gate a deploy (§19.3 "qr.style.json ... passing scan
// verification") or a style save.
//
// Run: npm run qr:verify   (from app/api)
// ============================================================================
import { loadProfile } from '../src/redirector/qr/style.js';
import { verifyStyle } from '../src/redirector/qr/verify.js';

const profile = loadProfile();
const variants = ['standard', 'print', 'logo', 'inverted', 'branded'];

let failures = 0;
console.log(`QR scan verification — ${profile.domain} (${profile.styles.length} styles)\n`);

for (const style of profile.styles) {
  console.log(`style: ${style.key}`);
  const results = verifyStyle(style.key, variants);
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    if (!r.ok) failures++;
    const detail = `contrast ${r.moduleContrast}:1 / eye ${r.eyeContrast}:1` + (r.knockout ? ' [logo knockout]' : '');
    console.log(`  [${status}] ${r.variant.padEnd(9)} ${detail}`);
    if (!r.ok) {
      console.log(`         payload : ${r.payload}`);
      console.log(`         decoded : ${r.decoded === null ? '<decode failed>' : r.decoded}`);
    }
  }
  console.log('');
}

if (failures) {
  console.error(`FAILED: ${failures} variant(s) did not verify.`);
  process.exit(1);
}
console.log('All styles and variants verified.');
