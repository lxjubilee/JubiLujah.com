#!/usr/bin/env node
// ============================================================================
// DQR rules engine — offline check (no DB). software/redirector.md §7 / §20.4.
//
// Exercises all eight strategies deterministically, the timezone handling, the
// no-repeat property of random_pool, param validation, and the acceptance case
// §20.4: a DQR returns different content on two dates and different content for
// two countries. latest_in_collection's DB lookup is injected. Run: npm run redirector:rules
// ============================================================================
import assert from 'node:assert/strict';
import { evaluateRule, validateRuleParams, zonedParts } from '../src/redirector/rules/engine.js';

let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };
const dayNoonUTC = (iso) => new Date(`${iso}T12:00:00Z`);

console.log('DQR rules engine (offline)\n');

// calendar_map — different content on two dates (§20.4)
{
  const rule = { strategy: 'calendar_map', timezone: 'UTC', parameters_json: { map: { '2026-08-02': 'A', '2026-08-03': 'B' } } };
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-08-02') }), 'A');
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-08-03') }), 'B');
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-08-04') }), null); // unmapped -> fallback
  ok('calendar_map: date-keyed, different content across dates (§20.4)');
}

// sequence_daily — cycles one per day, wraps
{
  const rule = { strategy: 'sequence_daily', timezone: 'UTC', pool_json: ['A', 'B', 'C'] };
  const d0 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-02') });
  const d1 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-03') });
  const d3 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-05') }); // +3 days -> wraps to d0
  assert.notEqual(d0, d1);
  assert.equal(d0, d3, 'wraps after pool length');
  ok('sequence_daily: one per day, wraps at pool length');
}

// sequence_weekly — advances weekly
{
  const rule = { strategy: 'sequence_weekly', timezone: 'UTC', pool_json: ['A', 'B'] };
  const w0 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-02') });
  const wSame = await evaluateRule(rule, { now: dayNoonUTC('2026-08-05') }); // same week bucket
  const wNext = await evaluateRule(rule, { now: dayNoonUTC('2026-08-12') }); // +10 days -> next bucket
  assert.equal(w0, wSame, 'stable within a week');
  assert.notEqual(w0, wNext, 'advances the next week');
  ok('sequence_weekly: stable within week, advances weekly');
}

// date_range — first match wins
{
  const rule = { strategy: 'date_range', timezone: 'UTC', parameters_json: { ranges: [
    { from: '2026-12-01', to: '2026-12-26', asset_id: 'ADVENT' },
    { from: '2026-12-27', to: '2026-12-31', asset_id: 'YEAREND' },
  ] } };
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-12-10') }), 'ADVENT');
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-12-28') }), 'YEAREND');
  assert.equal(await evaluateRule(rule, { now: dayNoonUTC('2026-11-01') }), null); // outside -> fallback
  ok('date_range: first matching window wins, else fallback');
}

// random_pool — deterministic per day; no repeat within a full cycle
{
  const pool = ['A', 'B', 'C', 'D'];
  const rule = { rule_id: 'r1', strategy: 'random_pool', timezone: 'UTC', pool_json: pool };
  // determinism: same day, same answer
  const a1 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-02') });
  const a2 = await evaluateRule(rule, { now: dayNoonUTC('2026-08-02') });
  assert.equal(a1, a2, 'deterministic per day');
  // no-repeat across an aligned cycle: pick a base epochDay that is a multiple of pool length
  const baseEpoch = Math.floor(zonedParts(dayNoonUTC('2026-08-02'), 'UTC').epochDay / pool.length) * pool.length;
  const picks = [];
  for (let i = 0; i < pool.length; i++) {
    const now = new Date((baseEpoch + i) * 86_400_000 + 43_200_000);
    picks.push(await evaluateRule(rule, { now }));
  }
  assert.equal(new Set(picks).size, pool.length, 'every pool item once per cycle (no repeat)');
  ok('random_pool: deterministic + no-repeat over a full cycle (§21)');
}

// latest_in_collection — injected DB lookup
{
  const rule = { strategy: 'latest_in_collection', parameters_json: { collection_node_id: 'node-1' } };
  const got = await evaluateRule(rule, {}, { latestInCollection: async (id) => (id === 'node-1' ? 'NEWEST' : null) });
  assert.equal(got, 'NEWEST');
  ok('latest_in_collection: resolves newest via injected lookup');
}

// geo_route — by country, default on miss (§20.4 countries)
{
  const rule = { strategy: 'geo_route', default_region: 'US', parameters_json: { regions: { RO: 'RO_ED', US: 'US_ED' } } };
  assert.equal(await evaluateRule(rule, { country: 'RO' }), 'RO_ED');
  assert.equal(await evaluateRule(rule, { country: 'US' }), 'US_ED');
  assert.equal(await evaluateRule(rule, { country: 'FR' }), 'US_ED', 'unknown country -> default region');
  assert.equal(await evaluateRule(rule, {}), 'US_ED', 'no country -> default region');
  ok('geo_route: RO vs US differ, unknown/absent -> default (§20.4)');
}

// time_of_day — by hour in the rule timezone
{
  const rule = { strategy: 'time_of_day', timezone: 'UTC', parameters_json: { periods: [
    { from_hour: 0, to_hour: 12, asset_id: 'MORNING' },
    { from_hour: 12, to_hour: 24, asset_id: 'EVENING' },
  ] } };
  assert.equal(await evaluateRule(rule, { now: new Date('2026-08-02T09:00:00Z') }), 'MORNING');
  assert.equal(await evaluateRule(rule, { now: new Date('2026-08-02T18:00:00Z') }), 'EVENING');
  ok('time_of_day: morning vs evening by zoned hour');
}

// timezone correctness — same instant, different zone -> different calendar day
{
  const rule = { strategy: 'calendar_map', parameters_json: { map: { '2026-08-02': 'LA_DAY', '2026-08-03': 'TOKYO_DAY' } } };
  const instant = new Date('2026-08-02T20:00:00Z'); // 13:00 LA (Aug 2) vs 05:00 Tokyo (Aug 3)
  assert.equal(await evaluateRule({ ...rule, timezone: 'America/Los_Angeles' }, { now: instant }), 'LA_DAY');
  assert.equal(await evaluateRule({ ...rule, timezone: 'Asia/Tokyo' }, { now: instant }), 'TOKYO_DAY');
  ok('timezone: same instant resolves per the rule IANA zone (§7.2)');
}

// validation — bad params rejected at save time (§7.3)
{
  assert.throws(() => validateRuleParams({ strategy: 'geo_route', parameters_json: { regions: { RO: 'x' } } }), /default_region/);
  assert.throws(() => validateRuleParams({ strategy: 'sequence_daily', pool_json: [] }), /non-empty pool/);
  assert.throws(() => validateRuleParams({ strategy: 'calendar_map', parameters_json: {} }), /map/);
  validateRuleParams({ strategy: 'geo_route', default_region: 'US', parameters_json: { regions: { US: 'x' } } }); // ok
  ok('validateRuleParams: rejects structurally invalid rules');
}

console.log(`\nAll ${n} rules-engine checks passed.`);
