/* Album-status badge decorator — Ready / Studio
 *
 * Reads /music/catalog-manifest.json (local, fresh) and walks the page for:
 *   1. Any <a href="/web/album.html?code=XXX">…</a> link — decorates with a
 *      Ready badge if the album has playable mp3s, else a Studio badge.
 *   2. Any element with data-album-code="XXX" — same treatment.
 *   3. The album-page hero (#album-status-target) — populated with the same
 *      badge if the page is an album detail view.
 *
 * Use:  <script src="/web/_assets/album-status.js" defer></script>
 *
 * Manifest fetch caches in sessionStorage for 5 minutes (key: jv_manifest_v2),
 * shared with player.js. No external dependencies.
 */
(function () {
  'use strict';

  const MANIFEST_URL = '/music/catalog-manifest.json';
  const CACHE_KEY = 'jv_manifest_v2';
  const CACHE_TTL_MS = 5 * 60 * 1000;

  // --- Inject CSS once ---
  function injectStyles() {
    if (document.getElementById('album-status-styles')) return;
    const css = `
      .jv-status-badge {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 10px;
        line-height: 1.5;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        vertical-align: middle;
        white-space: nowrap;
        text-decoration: none !important;
        border: 1px solid transparent;
      }
      .jv-status-badge.ready {
        background: rgba(95, 179, 113, 0.16);
        color: #5fb371;
        border-color: rgba(95, 179, 113, 0.45);
      }
      .jv-status-badge.studio {
        background: rgba(212, 160, 92, 0.14);
        color: #d4a05c;
        border-color: rgba(212, 160, 92, 0.40);
      }
      .jv-status-badge.unknown {
        background: rgba(110, 103, 96, 0.18);
        color: #b0a89c;
        border-color: rgba(110, 103, 96, 0.40);
      }
      /* When sitting inside a button-like context (e.g. play action), keep size sane */
      .jv-status-badge.large {
        font-size: 12px;
        padding: 4px 12px;
      }

      /* Aggregate Ready/Studio count blocks (populated into elements with
         data-album-status-counts="…"). */
      .jv-count-summary {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: center;
        font-size: 13px;
        line-height: 1.4;
        color: #b0a89c;
      }
      .jv-count-summary .jv-count {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid transparent;
        white-space: nowrap;
      }
      .jv-count-summary .jv-count.ready {
        background: rgba(95, 179, 113, 0.08);
        border-color: rgba(95, 179, 113, 0.32);
        color: #5fb371;
      }
      .jv-count-summary .jv-count.studio {
        background: rgba(212, 160, 92, 0.07);
        border-color: rgba(212, 160, 92, 0.32);
        color: #d4a05c;
      }
      .jv-count-summary .jv-count strong {
        font-family: Georgia, serif;
        font-size: 17px;
        font-weight: 700;
        color: inherit;
      }
      .jv-count-summary .jv-count .jv-sub {
        color: rgba(255,255,255,0.55);
        font-size: 12px;
        font-weight: 400;
      }
      .jv-count-summary .jv-count .jv-label {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        font-weight: 700;
      }

      /* Header-area "X/Y Ready (Z%)" compact pill — sits in .site-tools */
      .jv-ready-counter {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        font-size: 12px;
        line-height: 1.2;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(95, 179, 113, 0.10);
        border: 1px solid rgba(95, 179, 113, 0.32);
        color: #5fb371;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        cursor: default;
      }
      .jv-ready-counter strong {
        font-weight: 700;
        color: #5fb371;
      }
      .jv-ready-counter .jv-ready-pct {
        opacity: 0.8;
        font-size: 11px;
      }
      .jv-ready-counter .jv-ready-label {
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-size: 10px;
        font-weight: 700;
      }
      .jv-ready-counter.empty {
        background: rgba(110, 103, 96, 0.10);
        border-color: rgba(110, 103, 96, 0.32);
        color: #b0a89c;
      }
      .jv-ready-counter.empty strong { color: #b0a89c; }

      /* Floating top-right readiness pill — used on pages without standard
         site-tools (persona executive summaries, dashboards). */
      .jv-ready-floater {
        position: fixed;
        top: 14px;
        right: 18px;
        z-index: 9000;
        background: rgba(10, 14, 20, 0.85);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        padding: 4px;
        border-radius: 999px;
      }
    `;
    const s = document.createElement('style');
    s.id = 'album-status-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --- Manifest fetch with sessionStorage cache ---
  async function loadManifest() {
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj._ts && Date.now() - obj._ts < CACHE_TTL_MS) return obj.data;
      }
    } catch (e) { /* ignore */ }
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
    const data = await res.json();
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ _ts: Date.now(), data }));
    } catch (e) { /* quota */ }
    return data;
  }

  // --- Build album status index ---
  function buildIndex(manifest) {
    const map = {};
    if (!manifest || !manifest.categories) return map;
    for (const cat of manifest.categories) {
      for (const art of (cat.artists || [])) {
        for (const alb of (art.albums || [])) {
          if (alb && alb.code) {
            map[alb.code.toUpperCase()] = {
              playable: alb.playable | 0,
              trackCount: alb.trackCount | 0,
              title: alb.title || ''
            };
          }
        }
      }
    }
    return map;
  }

  function statusFor(rec) {
    if (!rec) return { cls: 'unknown', label: 'Not Listed' };
    if (rec.playable > 0) return { cls: 'ready', label: 'Ready' };
    return { cls: 'studio', label: 'Studio' };
  }

  function makeBadge(rec, large) {
    const s = statusFor(rec);
    const span = document.createElement('span');
    span.className = 'jv-status-badge ' + s.cls + (large ? ' large' : '');
    span.textContent = s.label;
    if (rec) span.title = rec.playable + ' of ' + rec.trackCount + ' tracks have audio';
    else span.title = 'Album not found in catalog manifest';
    return span;
  }

  // --- Extract album code from href like "/web/album.html?code=XXX" ---
  function codeFromHref(href) {
    if (!href) return null;
    const m = href.match(/[?&]code=([A-Z0-9]+EN)/i);
    return m ? m[1].toUpperCase() : null;
  }

  // --- Compute scoped counts ---
  // Supported scopes:
  //   "all"             — everything in the manifest, across every category
  //   "family"          — alias for category "inspire" (the Inspire Family)
  //   "children"        — union of categories "party-giggles" + "tiny-tiggles"
  //   "category:KEY"    — a single named category (e.g. "category:faith-based")
  //   "artist:SLUG"     — a single artist (e.g. "artist:jubilee-inspire")
  function computeCounts(manifest, scope) {
    const tot = { albumsReady: 0, albumsStudio: 0, songsReady: 0, songsStudio: 0 };
    if (!manifest || !manifest.categories) return tot;
    const [kind, key] = (scope || 'family').split(':');
    function catMatches(cat) {
      if (kind === 'all') return true;
      if (kind === 'family') return cat.key === 'inspire';
      if (kind === 'children') return cat.key === 'party-giggles' || cat.key === 'tiny-tiggles';
      if (kind === 'category') return cat.key === key;
      if (kind === 'artist') return true; // artist filter handled below
      return false;
    }
    for (const cat of manifest.categories) {
      if (!catMatches(cat)) continue;
      for (const art of (cat.artists || [])) {
        if (kind === 'artist' && art.slug !== key) continue;
        for (const alb of (art.albums || [])) {
          const playable = alb.playable | 0;
          const total = alb.trackCount | 0;
          if (playable > 0) tot.albumsReady++; else tot.albumsStudio++;
          tot.songsReady += playable;
          tot.songsStudio += Math.max(0, total - playable);
        }
      }
    }
    return tot;
  }

  function renderCountBlock(tot) {
    const wrap = document.createElement('span');
    wrap.className = 'jv-count-summary';
    wrap.innerHTML =
      '<span class="jv-count ready"><span class="jv-label">Ready</span> <strong>' + tot.albumsReady + '</strong> ' +
      (tot.albumsReady === 1 ? 'album' : 'albums') + ' <span class="jv-sub">· ' + tot.songsReady + ' ' +
      (tot.songsReady === 1 ? 'song' : 'songs') + '</span></span>' +
      '<span class="jv-count studio"><span class="jv-label">Studio</span> <strong>' + tot.albumsStudio + '</strong> ' +
      (tot.albumsStudio === 1 ? 'album' : 'albums') + ' <span class="jv-sub">· ' + tot.songsStudio + ' ' +
      (tot.songsStudio === 1 ? 'song' : 'songs') + '</span></span>';
    return wrap;
  }

  function populateCounts(manifest) {
    document.querySelectorAll('[data-album-status-counts]').forEach(el => {
      if (el.querySelector('.jv-count-summary')) return; // already populated
      const scope = el.getAttribute('data-album-status-counts') || 'family';
      const tot = computeCounts(manifest, scope);
      el.appendChild(renderCountBlock(tot));
    });
  }

  // Format an integer with thousand separators (e.g. 10000 -> "10,000")
  function fmtN(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Compact header readiness pill — "X/Y Ready (Z%)" for the page's scope.
  // Populated from elements with [data-album-ready-header="SCOPE"]. Always
  // re-renders (idempotent re-decoration after turbo-nav scope changes).
  function populateHeaderReadiness(manifest) {
    document.querySelectorAll('[data-album-ready-header]').forEach(el => {
      const scope = el.getAttribute('data-album-ready-header') || 'all';
      const tot = computeCounts(manifest, scope);
      const ready = tot.songsReady | 0;
      const total = (tot.songsReady + tot.songsStudio) | 0;
      const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
      // Replace existing content to allow re-decoration on scope change
      el.innerHTML = '';
      const pill = document.createElement('span');
      pill.className = 'jv-ready-counter' + (total === 0 ? ' empty' : '');
      pill.title = ready + ' of ' + total + ' songs in this scope have audio (' + pct + '%)';
      if (total === 0) {
        pill.innerHTML = '<span class="jv-ready-label">No songs scoped</span>';
      } else {
        pill.innerHTML =
          '<strong>' + fmtN(ready) + '/' + fmtN(total) + '</strong>' +
          ' <span class="jv-ready-label">Ready</span>' +
          ' <span class="jv-ready-pct">(' + pct + '%)</span>';
      }
      el.appendChild(pill);
    });
  }

  // Public helper for pages that need to update the header scope dynamically
  // (e.g. album.html, which doesn't know its artist until after the fetch).
  function setHeaderScope(scope) {
    document.querySelectorAll('[data-album-ready-header]').forEach(el => {
      el.setAttribute('data-album-ready-header', scope);
    });
    // Re-decorate immediately if we already have a cached manifest
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj && obj.data) populateHeaderReadiness(obj.data);
      }
    } catch (e) { /* ignore */ }
  }

  // --- Decorate the page ---
  function decorate(index) {
    // 1) Anchors to album.html
    //    Rules per owner feedback:
    //      - ONE badge per row (don't render "READY READY" when both the
    //        album-title cell and code-cell anchors share the same <tr>).
    //      - The badge is NOT a link — it sits next to the anchor in the
    //        parent <td>, not inside the <a>. That way clicking the badge
    //        doesn't navigate, and the badge isn't styled as link text.
    const anchors = document.querySelectorAll('a[href*="album.html?code="]');
    anchors.forEach(a => {
      // Pick the closest meaningful "row" container — used for both dedup
      // and as the idempotency check after a turbo-nav re-decoration.
      const row = a.closest('tr, li, .jv-card-link, .fusion-card, .card') || a;
      if (row.querySelector('.jv-status-badge')) return; // row already badged

      const code = codeFromHref(a.getAttribute('href'));
      if (!code) return;
      const rec = index[code];

      // Detach any peak/intent/guard star markers so we can re-insert them AFTER
      // the Ready/Studio badge — the star reads as a quality call-out on the
      // row's status word, not as a pre-title decoration.
      const marks = Array.from(a.querySelectorAll('.peak-mark, .intent-mark, .guard-mark, .catalog-peak, .star-mark'));
      marks.forEach(m => { if (m.parentNode) m.parentNode.removeChild(m); });

      const badge = makeBadge(rec, false);

      // Placement: in a table cell, place badge as a SIBLING of the <a>
      // (in the same <td>) so it's not part of the link. In card / list
      // contexts the badge belongs inside the link, which is the only
      // visually-sensible place for it.
      const td = a.closest('td');
      let cursor = a;
      const appendAfterCursor = (node) => {
        cursor.parentNode.insertBefore(node, cursor.nextSibling);
        cursor = node;
      };
      if (td) {
        appendAfterCursor(document.createTextNode(' '));
        appendAfterCursor(badge);
        marks.forEach(m => {
          appendAfterCursor(document.createTextNode(' '));
          appendAfterCursor(m);
        });
      } else {
        a.appendChild(document.createTextNode(' '));
        a.appendChild(badge);
        marks.forEach(m => {
          a.appendChild(document.createTextNode(' '));
          a.appendChild(m);
        });
      }
    });

    // 2) Any element marked with data-album-code
    document.querySelectorAll('[data-album-code]').forEach(el => {
      if (el.querySelector('.jv-status-badge')) return;
      const code = (el.getAttribute('data-album-code') || '').toUpperCase();
      if (!code) return;
      const rec = index[code];
      const badge = makeBadge(rec, el.hasAttribute('data-album-status-large'));
      el.appendChild(document.createTextNode(' '));
      el.appendChild(badge);
    });

    // 3) Album detail page hero target (album.html sets this once loaded)
    const heroTarget = document.getElementById('album-status-target');
    if (heroTarget && !heroTarget.querySelector('.jv-status-badge')) {
      const code = (heroTarget.getAttribute('data-album-code') || '').toUpperCase();
      const rec = code ? index[code] : null;
      heroTarget.appendChild(makeBadge(rec, true));
    }
  }

  // Expose a re-run for dynamically-rendered pages (e.g. album.html builds the DOM
  // after fetch — it can call window.jvAlbumStatus.decorate() after rendering).
  window.jvAlbumStatus = {
    decorate: async function () {
      injectStyles();
      try {
        const manifest = await loadManifest();
        const index = buildIndex(manifest);
        decorate(index);
        populateCounts(manifest);
        populateHeaderReadiness(manifest);
        return index;
      } catch (e) {
        console.warn('album-status: manifest load failed', e);
        return {};
      }
    },
    setHeaderScope: setHeaderScope
  };

  // Initial run on DOMContentLoaded; album.html will call it again after its own render
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.jvAlbumStatus.decorate());
  } else {
    window.jvAlbumStatus.decorate();
  }
})();
