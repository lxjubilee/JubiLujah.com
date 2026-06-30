/* Top 20 Songs — per-persona section renderer.
 *
 * Looks for elements with `data-top-20="<persona-slug>"`, fetches the
 * matching `/music/albums/inspire/<slug>/top-20.json`, and renders a
 * section with:
 *   - "Play All 20" button → calls window.jvPlayer.playSet([...])
 *   - 20 numbered rows, each clickable to play just that song
 *   - per-song composite rating shown as a colored pill
 *
 * Use:  <script src="/web/_assets/top-20.js" defer></script>
 */
(function () {
  'use strict';

  if (window.__jvTop20Init) return;
  window.__jvTop20Init = true;

  function injectStyles() {
    if (document.getElementById('jv-top20-styles')) return;
    const css = `
      .jv-top20 {
        background: rgba(20, 25, 33, 0.85);
        border: 1px solid #2a313c;
        border-radius: 14px;
        padding: 28px;
        margin: 32px auto;
        max-width: 1180px;
      }
      .jv-top20 h2 {
        font-family: Georgia, "Iowan Old Style", serif;
        font-size: 26px;
        font-weight: 700;
        color: #f0ebe3;
        margin: 0 0 4px;
      }
      .jv-top20 .jv-top20-eyebrow {
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #c8954a;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .jv-top20 .jv-top20-sub {
        color: #b0a89c;
        font-size: 14px;
        margin-bottom: 18px;
      }
      .jv-top20 .jv-top20-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .jv-top20 .jv-play-all {
        background: #c8954a;
        color: #0a0e14;
        border: none;
        padding: 10px 22px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.04em;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .jv-top20 .jv-play-all:hover { background: #e8b870; transform: translateY(-1px); }
      .jv-top20 .jv-play-all:disabled { background: #6e6760; cursor: not-allowed; }
      .jv-top20 .jv-top20-meta {
        font-size: 12px;
        color: #6e6760;
        align-self: center;
      }
      .jv-top20 ol {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .jv-top20 li {
        display: grid;
        grid-template-columns: 36px 36px 1fr auto auto;
        gap: 14px;
        align-items: center;
        padding: 10px 14px;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .jv-top20 li:hover {
        background: rgba(200, 149, 74, 0.06);
        border-color: rgba(200, 149, 74, 0.32);
      }
      .jv-top20 .jv-rank {
        font-family: Georgia, serif;
        color: #6e6760;
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        text-align: center;
      }
      .jv-top20 .jv-play-btn {
        width: 32px; height: 32px;
        border-radius: 50%;
        border: 1px solid rgba(200, 149, 74, 0.5);
        background: rgba(200, 149, 74, 0.08);
        color: #e8b870;
        font-size: 13px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: background 0.12s ease;
      }
      .jv-top20 .jv-play-btn:hover { background: rgba(200, 149, 74, 0.22); }
      .jv-top20 .jv-track-info {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .jv-top20 .jv-track-title {
        color: #f0ebe3;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jv-top20 .jv-track-album {
        color: #b0a89c;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .jv-top20 .jv-track-album a {
        color: #b0a89c;
        text-decoration: none;
      }
      .jv-top20 .jv-track-album a:hover { color: #e8b870; }
      .jv-top20 .jv-comp-pill {
        font-family: 'SF Mono', Menlo, monospace;
        font-size: 12px;
        padding: 3px 9px;
        border-radius: 999px;
        background: rgba(95, 179, 113, 0.14);
        color: #5fb371;
        border: 1px solid rgba(95, 179, 113, 0.4);
        font-weight: 700;
        white-space: nowrap;
      }
      .jv-top20 .jv-empty {
        padding: 24px;
        text-align: center;
        color: #b0a89c;
        font-size: 14px;
        background: rgba(110, 103, 96, 0.08);
        border: 1px dashed rgba(110, 103, 96, 0.4);
        border-radius: 8px;
      }
      @media (max-width: 640px) {
        .jv-top20 { padding: 18px; }
        .jv-top20 li { grid-template-columns: 28px 28px 1fr auto; }
        .jv-top20 .jv-track-album { display: none; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'jv-top20-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function makePill(comp) {
    return '<span class="jv-comp-pill">' + (comp != null ? comp.toFixed(1) + '%' : '—') + '</span>';
  }

  function render(el, data) {
    const tracks = (data && data.tracks) || [];
    const personaLabel = (data.persona || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const playSetItems = tracks.map(t => ({ albumCode: t.albumCode, trackNum: t.trackNum }));

    const root = document.createElement('section');
    root.className = 'jv-top20';
    root.innerHTML =
      '<div class="jv-top20-eyebrow">Top 20 Songs</div>' +
      '<h2>The highest-rated playable songs from this persona</h2>' +
      '<div class="jv-top20-sub">Blueprint composite of Faith-Focus + Praise-vs-Worship + Earworm + Bestseller, filtered to songs with audio uploaded. Click any row to play that song; click <strong>Play All 20</strong> to queue the whole set in the sticky footer player.</div>' +
      '<div class="jv-top20-actions">' +
      '  <button type="button" class="jv-play-all" ' + (tracks.length === 0 ? 'disabled' : '') + '>▶ Play All ' + tracks.length + '</button>' +
      '  <span class="jv-top20-meta">' + tracks.length + ' of ' + tracks.length + ' ready · sorted by composite descending</span>' +
      '</div>' +
      (tracks.length === 0
        ? '<div class="jv-empty">No songs with audio yet for ' + esc(personaLabel) + '. Albums are being recorded in the Studio.</div>'
        : '<ol>' + tracks.map((t, i) =>
            '<li data-jv-album="' + esc(t.albumCode) + '" data-jv-track="' + t.trackNum + '">' +
              '<div class="jv-rank">' + (i + 1) + '</div>' +
              '<button type="button" class="jv-play-btn" title="Play just this song">▶</button>' +
              '<div class="jv-track-info">' +
                '<div class="jv-track-title">' + esc(t.trackTitle) + '</div>' +
                '<div class="jv-track-album"><a href="/web/album.html?code=' + esc(t.albumCode) + '">' + esc(t.albumTitle) + '</a> · Track ' + t.trackNum + '</div>' +
              '</div>' +
              makePill(t.composite) +
            '</li>'
          ).join('') + '</ol>');

    // Replace el content (idempotent)
    el.innerHTML = '';
    el.appendChild(root);

    // Wire up actions
    const playAllBtn = root.querySelector('.jv-play-all');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', function () {
        if (window.jvPlayer && typeof window.jvPlayer.playSet === 'function') {
          window.jvPlayer.playSet(playSetItems);
        }
      });
    }
    root.querySelectorAll('li').forEach(li => {
      function play(ev) {
        ev.stopPropagation();
        const code = li.getAttribute('data-jv-album');
        const num = parseInt(li.getAttribute('data-jv-track'), 10) || 1;
        if (window.jvPlayer && typeof window.jvPlayer.play === 'function') {
          window.jvPlayer.play(code, num);
        }
      }
      li.addEventListener('click', play);
      const b = li.querySelector('.jv-play-btn');
      if (b) b.addEventListener('click', play);
    });
  }

  async function populate() {
    injectStyles();
    const targets = document.querySelectorAll('[data-top-20]');
    for (const el of targets) {
      const slug = el.getAttribute('data-top-20');
      if (!slug) continue;
      const url = '/music/albums/inspire/' + slug + '/top-20.json';
      try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) {
          el.innerHTML = '<section class="jv-top20"><div class="jv-top20-eyebrow">Top 20 Songs</div><div class="jv-empty">Top-20 not generated for this persona yet.</div></section>';
          continue;
        }
        const data = await res.json();
        render(el, data);
      } catch (e) {
        console.warn('top-20: load failed for', slug, e);
      }
    }
  }

  window.jvTop20 = { populate: populate };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populate);
  } else {
    populate();
  }
})();
