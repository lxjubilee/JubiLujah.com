#!/usr/bin/env node
// ============================================================================
// Landing payload — offline check (no DB). software/redirector.md §11.
// Verifies the pure shaping: verb-by-kind and the payload block structure.
// Run: npm run redirector:landing
// ============================================================================
import assert from 'node:assert/strict';
import { verbForKind, shapeLanding } from '../src/redirector/landing.js';

let n = 0;
const ok = (name) => { n++; console.log(`  [PASS] ${name}`); };
console.log('Landing payload (offline)\n');

assert.equal(verbForKind('track'), 'Play');
assert.equal(verbForKind('album'), 'Play');
assert.equal(verbForKind('book'), 'Read');
assert.equal(verbForKind('article'), 'Read');
assert.equal(verbForKind('pdf'), 'Download');
assert.equal(verbForKind('app'), 'Open');
ok('verbForKind maps content kind -> the obvious next tap (§11.1)');

const asset = { asset_id: 'a1', title: 'Song of Restoration', content_kind: 'track', summary: 'A test track.', cover_image_url: 'https://cdn/x.jpg', taxonomy_node_id: 'n1' };
const related = [
  { asset_id: 'a2', title: 'Sibling One', content_kind: 'track', cover_image_url: null, token: 'K7M9P2XR4TWB' },
  { asset_id: 'a3', title: 'Sibling Two', content_kind: 'track', cover_image_url: 'https://cdn/2.jpg', token: 'H3NQ8FVJ5CDY' },
];
const p = shapeLanding(asset, 'Melody > Album > Song', related, 'https://jubileepraise.com');
assert.equal(p.hero.title, 'Song of Restoration');
assert.equal(p.hero.content_kind, 'track');
assert.equal(p.hero.summary, 'A test track.');
assert.equal(p.primary.verb, 'Play');
assert.equal(p.context_path, 'Melody > Album > Song');
assert.equal(p.related.length, 2);
assert.equal(p.related[0].short_url, 'https://jubileepraise.com/r/K7M9P2XR4TWB');
assert.equal(p.persona, null);
assert.equal(p.resume, null);
ok('shapeLanding builds hero / primary / context / related blocks (§11.1)');

// related is capped at 4 (§11.1 "two to four")
const many = Array.from({ length: 8 }, (_, i) => ({ asset_id: `x${i}`, title: `S${i}`, content_kind: 'track', cover_image_url: null, token: 'K7M9P2XR4TWB' }));
assert.equal(shapeLanding(asset, null, many, 'https://j').related.length, 4);
ok('related items capped at 4');

console.log(`\nAll ${n} landing payload checks passed.`);
