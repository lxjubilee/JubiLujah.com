#!/usr/bin/env node
// Write the flat-file failover snapshot now (software/redirector.md §9.6 / deploy
// checklist §19.3 "Failover snapshot generated and load-tested"). Requires DB.
import { healthCheck } from '../src/db.js';
import { writeSnapshot, snapshotExists, loadSnapshot } from '../src/redirector/failover/snapshot.js';

const reachable = await Promise.race([healthCheck(), new Promise((r) => setTimeout(() => r(false), 2500))]);
if (!reachable) { console.log('SKIP: database not reachable.'); process.exit(0); }

try {
  const manifest = await writeSnapshot();
  // Load-test it, per the deploy checklist.
  if (!snapshotExists()) throw new Error('snapshot files missing after write');
  const snap = await loadSnapshot();
  console.log('Snapshot written and load-tested:');
  console.log('  tokens :', manifest.counts.tokens);
  console.log('  aliases:', manifest.counts.aliases);
  console.log('  loaded :', Object.keys(snap.tokens).length, 'tokens,', Object.keys(snap.aliases).length, 'aliases');
  process.exit(0);
} catch (err) {
  console.error('snapshot failed:', err.message);
  process.exit(1);
}
