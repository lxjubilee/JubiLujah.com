#!/usr/bin/env node
// Run one asset-health cycle now (software/redirector.md §16). Requires DB.
import { healthCheck } from '../src/db.js';
import { runHealthCycle } from '../src/redirector/health/watcher.js';

const reachable = await Promise.race([healthCheck(), new Promise((r) => setTimeout(() => r(false), 2500))]);
if (!reachable) { console.log('SKIP: database not reachable.'); process.exit(0); }

try {
  const summary = await runHealthCycle();
  console.log('Health cycle complete:', JSON.stringify(summary));
  process.exit(0);
} catch (err) {
  console.error('health cycle failed:', err.message);
  process.exit(1);
}
