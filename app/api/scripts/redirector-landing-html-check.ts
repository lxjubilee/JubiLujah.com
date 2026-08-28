// ============================================================================
// Landing page HTML — structural check. software/redirector.md §11.1 / §11.2.
// Runs the real web renderer (app/web/lib/landing.ts) and asserts the required
// blocks, a no-JS primary action, noindex, and HTML-escaping. Node executes this
// .ts directly (type stripping). Run: npm run redirector:landing-html
// ============================================================================
import assert from 'node:assert/strict';
import { renderLanding, type LandingData } from '../../web/lib/landing.ts';

const data: LandingData = {
  token: 'K7M9P2XR4TWB',
  hero: { title: 'Song <b>of</b> Restoration', content_kind: 'track', summary: 'A test track.', cover_image_url: 'https://cdn/x.jpg' },
  primary: { verb: 'Play' },
  context_path: 'Melody > Album > Song',
  related: [{ title: 'Sibling', kind: 'track', cover_image_url: null, short_url: 'https://jubileepraise.com/r/H3NQ8FVJ5CDY' }],
  persona: null,
  resume: null,
};

const html = renderLanding(data);
let n = 0;
const ok = (name: string) => { n++; console.log(`  [PASS] ${name}`); };
console.log('Landing HTML (real web renderer)\n');

assert.ok(html.startsWith('<!doctype html'), 'is an HTML document');
assert.match(html, /<meta name="robots" content="noindex/, 'noindex (§11.2)');
ok('renders an HTML document with noindex');

// §11.2 — primary action is a plain <a> to the tracked go route, no JS required.
assert.match(html, /<a class="primary" href="\/r\/K7M9P2XR4TWB\/go\?a=primary">Play<\/a>/, 'plain-link primary action');
ok('primary action is a no-JS link to /r/<token>/go');

// §11.1 blocks: hero title, content kind, summary, context strip, related card.
assert.ok(html.includes('Song &lt;b&gt;of&lt;/b&gt; Restoration'), 'hero title present + escaped');
assert.ok(!html.includes('<b>of</b>'), 'title HTML is escaped, not injected');
assert.ok(html.includes('Melody &gt; Album &gt; Song'), 'context strip present + escaped');
assert.ok(html.includes('A test track.'), 'summary present');
assert.ok(html.includes('href="https://jubileepraise.com/r/H3NQ8FVJ5CDY"'), 'related card links to sibling short_url');
ok('hero / context strip / summary / related blocks present (§11.1)');

// The real destination must never appear (it is not even passed to the renderer).
assert.ok(!html.includes('cdn.example.com'), 'no leaked destination');
ok('no storage destination in the HTML (§9.4)');

// §6.7 — a persona-framed ephemeral token: persona note + /rp/ action links.
const personaHtml = renderLanding({
  ...data,
  pathPrefix: 'rp',
  persona: { name: 'Melody Inspire', reason: 'This one fits the restoration theme you mentioned.' },
  resume: { position: 3, label: 'Chapter 3' },
});
assert.ok(personaHtml.includes('Melody Inspire'), 'persona name shown');
assert.ok(personaHtml.includes('This one fits the restoration theme you mentioned.'), 'persona reason shown');
assert.match(personaHtml, /<a class="primary" href="\/rp\/K7M9P2XR4TWB\/go\?a=primary">/, 'primary targets /rp/ go route');
assert.ok(personaHtml.includes('/rp/K7M9P2XR4TWB/go?a=start_over'), 'resume start-over targets /rp/');
ok('persona note + resume block render with /rp/ action links (§6.7 / §6.6)');

console.log(`\nAll ${n} landing HTML checks passed.`);
