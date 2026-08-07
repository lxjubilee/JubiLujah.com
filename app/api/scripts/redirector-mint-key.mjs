#!/usr/bin/env node
// ============================================================================
// Mint a redirector automation API key — software/redirector.md §14 / §18.3.
//
// Usage:
//   node scripts/redirector-mint-key.mjs <consumer> [label] [scope1,scope2,...]
//   node scripts/redirector-mint-key.mjs pipeline "IPX pipeline" tokens:write,assets:write,lookup
//
// consumer ∈ pipeline | persona | admin_tooling. Requires DB access. The raw key
// is printed ONCE — store it in the caller's secret manager; only its hash is kept.
// ============================================================================
import { mintKey } from '../src/redirector/keys.js';

const [, , consumer, label, scopeArg] = process.argv;
if (!consumer) {
  console.error('usage: redirector-mint-key.mjs <consumer> [label] [comma,scopes]');
  process.exit(2);
}
const scopes = scopeArg ? scopeArg.split(',').map((s) => s.trim()).filter(Boolean) : [];

try {
  const k = await mintKey({ consumer, label: label || null, scopes });
  console.log('Minted redirector API key (store the raw key now — it is not recoverable):\n');
  console.log('  consumer :', k.consumer);
  console.log('  label    :', k.label || '(none)');
  console.log('  scopes   :', k.scopes.length ? k.scopes.join(', ') : '(none)');
  console.log('  prefix   :', k.keyPrefix);
  console.log('  key_id   :', k.keyId);
  console.log('\n  X-Redirector-Key:', k.rawKey, '\n');
  process.exit(0);
} catch (err) {
  console.error('mint failed:', err.message);
  process.exit(1);
}
