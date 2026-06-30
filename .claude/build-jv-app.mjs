/* Build the Spotify-style three-column "app" section and inject it into
 * jubilee-inspire/executive-summary.html, directly below the <header class="hero">.
 * Data is real: album/track lists come from catalog-manifest.json, per-track
 * composite ratings come from the persona top-20.json. Idempotent: re-running
 * replaces the previously injected block (between the BEGIN/END markers).
 */
import fs from 'fs';

const ROOT = 'w:/jubilujah.com';
const PAGE = ROOT + '/public/music/albums/inspire/jubilee-inspire/executive-summary.html';
const COVER = '/personas/Jubilee.png';

const manifest = JSON.parse(fs.readFileSync(ROOT + '/public/music/catalog-manifest.json', 'utf8'));
const t20 = JSON.parse(fs.readFileSync(ROOT + '/public/music/albums/inspire/jubilee-inspire/top-20.json', 'utf8'));

// rating map: "CODE:trackNum" -> composite
const rmap = {};
for (const tr of t20.tracks) rmap[tr.albumCode + ':' + tr.trackNum] = tr.composite;

const artist = manifest.categories.find(c => c.key === 'inspire').artists.find(a => a.slug === 'jubilee-inspire');
const albums = artist.albums.filter(a => a.playable && (a.tracks || []).length).slice(0, 16).map(a => ({
  code: a.code,
  title: a.title.trim(),
  year: 2026,
  tracks: (a.tracks || []).map(tr => ({ n: tr.n, title: tr.title, comp: (a.code + ':' + tr.n) in rmap ? rmap[a.code + ':' + tr.n] : null }))
}));

const DATA = JSON.stringify({ artist: 'Jubilee Inspire', cover: COVER, albums });

const STYLE = `
<style id="JV-APP-LAYOUT">
/* Three-column music-app layout, injected below the hero. Scoped under .jv-app. */
.jv-app { background: var(--bg); color: var(--ink); }
.jv-app * { box-sizing: border-box; }
.jv-app-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 320px;
  gap: 16px;
  max-width: 1600px;
  margin: 0 auto;
  padding: 20px 24px 36px;
  align-items: start;
}
.jv-app .jv-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
}
/* ---- Left: library ---- */
.jv-lib { display: flex; flex-direction: column; max-height: calc(100dvh - 120px); }
.jv-lib-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px 10px; flex: 0 0 auto;
}
.jv-lib-head .jv-lib-h { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 15px; color: var(--ink-soft); }
.jv-lib-head .jv-add { background: none; border: none; color: var(--ink-soft); font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; }
.jv-lib-head .jv-add:hover { color: var(--ink); }
.jv-tabs { display: flex; gap: 8px; padding: 0 16px 10px; flex: 0 0 auto; }
.jv-tab {
  border: none; cursor: pointer; font-size: 13px; font-weight: 600;
  padding: 6px 14px; border-radius: 999px; background: var(--surface-2); color: var(--ink-soft);
}
.jv-tab.active { background: var(--accent); color: #0a0e14; }
.jv-lib-recents {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 18px; font-size: 12px; color: var(--ink-muted); flex: 0 0 auto;
}
.jv-lib-list { overflow-y: auto; padding: 4px 8px 12px; flex: 1 1 auto; min-height: 0; }
.jv-lib-row {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: none; border: 1px solid transparent; border-radius: 8px;
  padding: 8px 10px; cursor: pointer; color: var(--ink);
}
.jv-lib-row:hover { background: rgba(200,149,74,0.06); border-color: rgba(200,149,74,0.28); }
.jv-lib-row.active { background: var(--surface-2); }
.jv-lib-row.active .jv-lib-title { color: var(--accent-warm); }
.jv-thumb { width: 46px; height: 46px; border-radius: 6px; object-fit: cover; flex: 0 0 auto; background: var(--surface-2); }
.jv-lib-tx { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.jv-lib-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jv-lib-sub { font-size: 12px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* ---- Center: now-playing album + tracks ---- */
.jv-center { padding: 0; }
.jv-center-head { display: flex; gap: 24px; padding: 24px 28px 8px; align-items: flex-end; }
.jv-cover-wrap { position: relative; flex: 0 0 auto; }
.jv-cover { width: 168px; height: 168px; border-radius: 10px; object-fit: cover; box-shadow: 0 8px 28px rgba(0,0,0,0.45); }
.jv-cover-badge {
  position: absolute; top: 8px; right: 8px; min-width: 26px; height: 26px; padding: 0 7px;
  border-radius: 6px; background: rgba(10,14,20,0.78); color: var(--ink);
  font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center;
}
.jv-center-meta { min-width: 0; padding-bottom: 6px; }
.jv-eyebrow-sm { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-soft); font-weight: 700; }
.jv-center-title { font-family: Georgia, serif; font-size: 44px; line-height: 1.05; font-weight: 700; margin: 8px 0 12px; color: var(--ink); }
.jv-center-sub { font-size: 14px; color: var(--ink-soft); }
.jv-center-sub .dot { color: var(--ink-muted); margin: 0 6px; }
.jv-center-listeners { font-size: 13px; color: var(--ink-muted); margin-top: 4px; }
.jv-center-actions { display: flex; align-items: center; gap: 18px; padding: 14px 28px 18px; }
.jv-bigplay {
  width: 54px; height: 54px; border-radius: 50%; border: none; cursor: pointer;
  background: var(--accent); color: #0a0e14; font-size: 20px;
  display: inline-flex; align-items: center; justify-content: center;
  transition: transform 0.1s ease, background 0.15s ease;
}
.jv-bigplay:hover { background: var(--accent-warm); transform: scale(1.05); }
.jv-follow {
  background: none; border: 1px solid var(--ink-soft); color: var(--ink);
  border-radius: 999px; padding: 8px 22px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.jv-follow:hover { border-color: var(--ink); }
.jv-tracks { padding: 0 18px 22px; }
.jv-track-head {
  display: grid; grid-template-columns: 36px 1fr auto 64px; gap: 14px; align-items: center;
  padding: 6px 12px; border-bottom: 1px solid var(--line);
  font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-muted);
}
.jv-track-head .jv-th-dur { text-align: right; }
.jv-track-row {
  display: grid; grid-template-columns: 36px 1fr auto 64px; gap: 14px; align-items: center;
  padding: 11px 12px; border-radius: 6px; cursor: pointer; border: 1px solid transparent;
}
.jv-track-row:hover { background: rgba(200,149,74,0.06); }
.jv-track-row:hover .jv-tnum { display: none; }
.jv-tnum-wrap { position: relative; width: 16px; text-align: center; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.jv-track-row .jv-tplay { display: none; color: var(--accent-warm); }
.jv-track-row:hover .jv-tplay { display: inline; }
.jv-tname { color: var(--ink); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jv-tdur { text-align: right; color: var(--ink-muted); font-variant-numeric: tabular-nums; font-size: 13px; }
.jv-comp-pill {
  font-family: 'SF Mono', Menlo, monospace; font-size: 12px; padding: 3px 9px; border-radius: 999px;
  background: rgba(95,179,113,0.14); color: var(--ok); border: 1px solid rgba(95,179,113,0.4);
  font-weight: 700; white-space: nowrap;
}
.jv-comp-pill.none { background: rgba(110,103,96,0.10); color: var(--ink-muted); border-color: rgba(110,103,96,0.35); }
/* ---- Right: popular / viral ---- */
.jv-right { display: flex; flex-direction: column; gap: 18px; background: none; border: none; }
.jv-right-sec h3 { font-size: 17px; font-weight: 700; color: var(--ink); margin: 0 0 12px; padding: 0 4px; }
.jv-mini {
  display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  background: none; border: none; border-radius: 8px; padding: 8px 8px; cursor: pointer; color: var(--ink);
}
.jv-mini:hover { background: rgba(200,149,74,0.06); }
.jv-mini .jv-thumb { width: 48px; height: 48px; }
.jv-mini-tx { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.jv-mini-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.jv-mini-sub { font-size: 12px; color: var(--ink-soft); }
.jv-mini-list { font-size: 12px; color: var(--ink-muted); }
@media (max-width: 1200px) {
  .jv-app-grid { grid-template-columns: 260px minmax(0,1fr); }
  .jv-right { display: none; }
}
@media (max-width: 820px) {
  .jv-app-grid { grid-template-columns: 1fr; }
  .jv-lib { max-height: none; }
  .jv-lib-list { max-height: 320px; }
  .jv-center-title { font-size: 32px; }
  .jv-cover { width: 120px; height: 120px; }
}
</style>`;

const HTML = `
<!-- BEGIN JV-APP (injected three-column layout) -->
<section class="jv-app" id="jv-app">
  <div class="jv-app-grid">
    <aside class="jv-panel jv-lib">
      <div class="jv-lib-head">
        <span class="jv-lib-h">&#x1F4DA; Your Library</span>
        <button class="jv-add" type="button" title="Add" aria-label="Add">+</button>
      </div>
      <div class="jv-tabs">
        <button class="jv-tab active" type="button">Albums</button>
        <button class="jv-tab" type="button">Playlists</button>
      </div>
      <div class="jv-lib-recents"><span>Recents</span><span>Recents &#x25BE;</span></div>
      <div class="jv-lib-list" data-jv-lib></div>
    </aside>
    <main class="jv-panel jv-center" data-jv-center></main>
    <aside class="jv-right" data-jv-right></aside>
  </div>
  <script type="application/json" id="jv-app-data">${DATA}</script>
  <script>
  (function(){
    var mount = document.getElementById('jv-app');
    if (!mount) return;
    var dataEl = document.getElementById('jv-app-data');
    var DATA; try { DATA = JSON.parse(dataEl.textContent); } catch(e){ return; }
    var albums = DATA.albums || [], cover = DATA.cover, artist = DATA.artist;
    if (!albums.length) return;
    var sel = 0;
    var libEl = mount.querySelector('[data-jv-lib]');
    var centerEl = mount.querySelector('[data-jv-center]');
    var rightEl = mount.querySelector('[data-jv-right]');
    function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
    function pill(c){ return c != null ? '<span class="jv-comp-pill">' + Number(c).toFixed(1) + '%</span>' : '<span class="jv-comp-pill none">\\u2014</span>'; }
    function play(code, n){ if (window.jvPlayer && window.jvPlayer.play) window.jvPlayer.play(code, n || 1); }
    function playAlbum(a){
      if (window.jvPlayer && window.jvPlayer.playSet) window.jvPlayer.playSet(a.tracks.map(function(t){ return { albumCode: a.code, trackNum: t.n }; }));
      else play(a.code, 1);
    }
    function libHTML(){
      return albums.map(function(a, i){
        return '<button class="jv-lib-row' + (i===sel?' active':'') + '" data-i="' + i + '" type="button">' +
          '<img class="jv-thumb" src="' + cover + '" alt="" loading="lazy">' +
          '<span class="jv-lib-tx"><span class="jv-lib-title">' + esc(a.title) + '</span>' +
          '<span class="jv-lib-sub">Album \\u00b7 ' + esc(artist) + '</span></span></button>';
      }).join('');
    }
    function centerHTML(){
      var a = albums[sel];
      var rows = a.tracks.map(function(t){
        return '<div class="jv-track-row" data-code="' + esc(a.code) + '" data-n="' + t.n + '">' +
          '<span class="jv-tnum-wrap"><span class="jv-tnum">' + t.n + '</span><span class="jv-tplay">&#x25B6;</span></span>' +
          '<span class="jv-tname">' + esc(t.title) + '</span>' +
          pill(t.comp) +
          '<span class="jv-tdur">--:--</span>' +
        '</div>';
      }).join('');
      return '<div class="jv-center-head">' +
          '<div class="jv-cover-wrap"><img class="jv-cover" src="' + cover + '" alt="' + esc(a.title) + ' cover"><span class="jv-cover-badge">' + (sel+1) + '</span></div>' +
          '<div class="jv-center-meta">' +
            '<div class="jv-eyebrow-sm">Album</div>' +
            '<div class="jv-center-title">' + esc(a.title) + '</div>' +
            '<div class="jv-center-sub">' + esc(artist) + '<span class="dot">\\u00b7</span>' + a.year + '<span class="dot">\\u00b7</span>' + a.tracks.length + ' songs</div>' +
            '<div class="jv-center-listeners">\\u2014 monthly listeners</div>' +
          '</div>' +
        '</div>' +
        '<div class="jv-center-actions">' +
          '<button class="jv-bigplay" type="button" data-play-album title="Play album">&#x25B6;</button>' +
          '<button class="jv-follow" type="button">Follow</button>' +
        '</div>' +
        '<div class="jv-tracks">' +
          '<div class="jv-track-head"><span>#</span><span>Title</span><span>Rating</span><span class="jv-th-dur">&#x1F551;</span></div>' +
          rows +
        '</div>';
    }
    function rightHTML(){
      function mini(a){
        return '<button class="jv-mini" type="button" data-code="' + esc(a.code) + '">' +
          '<img class="jv-thumb" src="' + cover + '" alt="" loading="lazy">' +
          '<span class="jv-mini-tx"><span class="jv-mini-title">' + esc(a.title) + '</span>' +
          '<span class="jv-mini-sub">' + esc(artist) + '</span>' +
          '<span class="jv-mini-list">\\u2014 monthly listeners</span></span></button>';
      }
      var pop = albums.slice(0, 5).map(mini).join('');
      var viral = albums.slice(5, 10).map(mini).join('');
      return '<div class="jv-right-sec"><h3>Popular Albums</h3>' + pop + '</div>' +
             '<div class="jv-right-sec"><h3>Viral Worship</h3>' + viral + '</div>';
    }
    function selectByCode(code){
      for (var i=0;i<albums.length;i++){ if (albums[i].code===code){ sel=i; renderAll(); return true; } }
      return false;
    }
    function renderAll(){
      libEl.innerHTML = libHTML();
      centerEl.innerHTML = centerHTML();
      rightEl.innerHTML = rightHTML();
      wire();
    }
    function wire(){
      libEl.querySelectorAll('.jv-lib-row').forEach(function(b){
        b.addEventListener('click', function(){ sel = parseInt(b.getAttribute('data-i'),10) || 0; renderAll(); });
      });
      var bp = centerEl.querySelector('[data-play-album]');
      if (bp) bp.addEventListener('click', function(){ playAlbum(albums[sel]); });
      centerEl.querySelectorAll('.jv-track-row').forEach(function(r){
        r.addEventListener('click', function(){ play(r.getAttribute('data-code'), parseInt(r.getAttribute('data-n'),10)); });
      });
      rightEl.querySelectorAll('.jv-mini').forEach(function(b){
        b.addEventListener('click', function(){ var code=b.getAttribute('data-code'); if(!selectByCode(code)) play(code,1); });
      });
    }
    renderAll();
  })();
  </script>
</section>
<!-- END JV-APP -->`;

const BLOCK = STYLE + '\n' + HTML;

let page = fs.readFileSync(PAGE, 'utf8');

// Idempotent: replace existing injected block if present.
const beginStyle = '<style id="JV-APP-LAYOUT">';
if (page.includes('<!-- BEGIN JV-APP')) {
  page = page.replace(/<style id="JV-APP-LAYOUT">[\s\S]*?<!-- END JV-APP -->/, BLOCK);
  console.log('replaced existing JV-APP block');
} else {
  // Insert right after the hero </header>, before the existing <div class="container">.
  const anchor = '</header>\n\n<div class="container">';
  if (!page.includes(anchor)) { console.error('ANCHOR NOT FOUND'); process.exit(1); }
  page = page.replace(anchor, '</header>\n' + BLOCK + '\n\n<div class="container">');
  console.log('inserted JV-APP block after hero');
}

fs.writeFileSync(PAGE, page);
console.log('albums:', albums.length, '| total tracks:', albums.reduce((s,a)=>s+a.tracks.length,0));
