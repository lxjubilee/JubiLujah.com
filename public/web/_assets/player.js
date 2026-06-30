/* Inspire Family sticky music player — shared component
 * Self-initializing. Include on any page:
 *   <link rel="stylesheet" href="/web/_assets/player.css">
 *   <script src="/web/_assets/player.js" defer></script>
 *
 * - Loads catalog-manifest.json once, caches in sessionStorage
 * - Renders sticky footer with prev / play / next / continue-across-albums toggle
 * - Persists state in localStorage (current track, position, volume, continue mode)
 * - Survives page navigation: same track resumes on new page
 * - Auto-wraps album titles in tables (td.album-title + td.code-cell pattern) with album.html links
 * - Exposes window.jvPlayer.play(albumCode, trackNum?) for external callers
 */
(function () {
  'use strict';

  // Per Build Spec §15: HTML + manifest served locally from the workshop server
  // (W:\...\public\), .mp3 audio assets served from cdn.jubileeverse.com (R2).
  // The manifest stays local so playable-state edits are reflected immediately
  // without waiting for R2 sync or Cloudflare cache purges. Audio URLs in the
  // manifest are relative paths joined with MUSIC_BASE → CDN.
  const MANIFEST_URL = '/music/catalog-manifest.json';
  const MUSIC_BASE = 'https://cdn.jubileeverse.com/music/';
  const ALBUM_PAGE = '/web/album.html';
  const STATE_KEY = 'jv_player_state_v1';
  // Bumped from v1 -> v2 on 2026-06-03 to invalidate stale-manifest sessionStorage
  // (the v1 cached the pre-rebuild manifest where every track had audio=false).
  const MANIFEST_CACHE_KEY = 'jv_manifest_v2';
  const MANIFEST_TTL_MS = 5 * 60 * 1000;

  // --- State ---
  let manifest = null;
  let playableQueue = []; // flat ordered list of every playable track across catalog
  let queueIndex = -1;
  let audio = null;
  let state = loadState();
  let dom = null;

  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return {
        albumCode: s.albumCode || null,
        trackNum: typeof s.trackNum === 'number' ? s.trackNum : null,
        position: typeof s.position === 'number' ? s.position : 0,
        volume: typeof s.volume === 'number' ? s.volume : 0.8,
        continueMode: s.continueMode !== false,
        playing: false
      };
    } catch (e) {
      return { albumCode: null, trackNum: null, position: 0, volume: 0.8, continueMode: true, playing: false };
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        albumCode: state.albumCode,
        trackNum: state.trackNum,
        position: audio ? audio.currentTime : state.position,
        volume: state.volume,
        continueMode: state.continueMode
      }));
    } catch (e) { /* quota or private mode — non-fatal */ }
  }

  // --- Manifest ---
  async function loadManifest() {
    try {
      const cached = sessionStorage.getItem(MANIFEST_CACHE_KEY);
      if (cached) {
        const obj = JSON.parse(cached);
        if (obj._ts && Date.now() - obj._ts < MANIFEST_TTL_MS) {
          manifest = obj.data;
          buildQueue();
          return;
        }
      }
    } catch (e) { /* ignore */ }
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error('manifest fetch failed: ' + res.status);
    manifest = await res.json();
    try {
      sessionStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ _ts: Date.now(), data: manifest }));
    } catch (e) { /* ignore quota */ }
    buildQueue();
  }

  function buildQueue() {
    playableQueue = [];
    if (!manifest || !manifest.categories) return;
    for (const cat of manifest.categories) {
      for (const art of (cat.artists || [])) {
        for (const alb of (art.albums || [])) {
          if (!alb.playable || alb.playable === 0) continue;
          for (const tr of (alb.tracks || [])) {
            if (!tr.audio || !tr.url) continue;
            playableQueue.push({
              categoryKey: cat.key,
              categoryLabel: cat.label,
              artistSlug: art.slug,
              artistName: art.name,
              albumCode: alb.code,
              albumTitle: alb.title,
              albumPath: alb.path,
              trackNum: tr.n,
              trackTitle: tr.title,
              trackUrl: tr.url
            });
          }
        }
      }
    }
  }

  function findQueueIndex(albumCode, trackNum) {
    for (let i = 0; i < playableQueue.length; i++) {
      if (playableQueue[i].albumCode === albumCode &&
          (trackNum == null || playableQueue[i].trackNum === trackNum)) {
        return i;
      }
    }
    return -1;
  }

  // --- DOM rendering ---
  function buildPlayerDOM() {
    const root = document.createElement('div');
    root.id = 'jv-player';
    root.className = 'hidden';
    root.innerHTML = `
      <div class="jv-now">
        <div class="jv-artwork" data-art></div>
        <div class="jv-track-info">
          <div class="jv-track-title" data-title>—</div>
          <div class="jv-track-meta" data-meta>Select a track to play</div>
        </div>
      </div>
      <div class="jv-center">
        <div class="jv-transport">
          <button class="jv-btn jv-shuffle" data-shuffle title="Shuffle" aria-label="Shuffle">&#x1F500;</button>
          <button class="jv-btn" data-prev title="Previous (Shift+P)" aria-label="Previous track">&#x23EE;</button>
          <button class="jv-btn jv-play" data-play title="Play / Pause (Space)" aria-label="Play or pause">&#x25B6;</button>
          <button class="jv-btn" data-next title="Next (Shift+N)" aria-label="Next track">&#x23ED;</button>
          <button class="jv-btn jv-repeat" data-repeat title="Repeat" aria-label="Repeat">&#x1F501;</button>
        </div>
        <div class="jv-progress">
          <span class="jv-time" data-cur>0:00</span>
          <div class="jv-bar" data-bar><div class="jv-bar-fill" data-fill></div></div>
          <span class="jv-time" data-dur>0:00</span>
        </div>
      </div>
      <div class="jv-right">
        <div class="jv-vol">
          <span style="font-size:14px;">&#x1F50A;</span>
          <div class="jv-vol-bar" data-volbar><div class="jv-vol-fill" data-volfill></div></div>
        </div>
        <button class="jv-btn jv-continue" data-continue title="Continue playing across albums and personas">Continue: On</button>
      </div>
    `;
    document.body.appendChild(root);
    document.body.classList.add('jv-player-active');
    return {
      root,
      art: root.querySelector('[data-art]'),
      title: root.querySelector('[data-title]'),
      meta: root.querySelector('[data-meta]'),
      prev: root.querySelector('[data-prev]'),
      play: root.querySelector('[data-play]'),
      next: root.querySelector('[data-next]'),
      shuffle: root.querySelector('[data-shuffle]'),
      repeat: root.querySelector('[data-repeat]'),
      bar: root.querySelector('[data-bar]'),
      fill: root.querySelector('[data-fill]'),
      cur: root.querySelector('[data-cur]'),
      dur: root.querySelector('[data-dur]'),
      volbar: root.querySelector('[data-volbar]'),
      volfill: root.querySelector('[data-volfill]'),
      cont: root.querySelector('[data-continue]')
    };
  }

  function fmtTime(s) {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' + sec : sec);
  }

  function updateUI() {
    if (!dom) return;
    const cur = queueIndex >= 0 ? playableQueue[queueIndex] : null;
    if (cur) {
      dom.root.classList.remove('hidden');
      dom.title.textContent = cur.trackTitle;
      const albLink = `<a href="${ALBUM_PAGE}?code=${encodeURIComponent(cur.albumCode)}">${escapeHtml(cur.albumTitle)}</a>`;
      dom.meta.innerHTML = `${albLink} · ${escapeHtml(cur.artistName)} · Track ${cur.trackNum}`;
      // try artwork
      tryLoadArtwork(cur, dom.art);
    } else {
      dom.title.textContent = '—';
      dom.meta.textContent = 'No track loaded';
    }
    dom.play.innerHTML = (audio && !audio.paused) ? '&#x23F8;' : '&#x25B6;';
    dom.cont.textContent = 'Continue: ' + (state.continueMode ? 'On' : 'Off');
    dom.cont.classList.toggle('active', state.continueMode);
    dom.prev.disabled = queueIndex <= 0;
    dom.next.disabled = queueIndex < 0 || queueIndex >= playableQueue.length - 1;
    dom.volfill.style.width = Math.round(state.volume * 100) + '%';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const artworkCache = {};
  function tryLoadArtwork(track, el) {
    const key = track.albumCode;
    if (artworkCache[key] !== undefined) {
      applyArtwork(el, artworkCache[key], track);
      return;
    }
    const candidates = ['cover.jpg', 'cover.png', 'cover.webp', 'cover-source.jpg', 'cover-source.png'];
    const base = MUSIC_BASE + track.albumPath + '/artwork/';
    (async () => {
      for (const name of candidates) {
        const url = base + name;
        try {
          const r = await fetch(url, { method: 'HEAD' });
          if (r.ok) {
            artworkCache[key] = url;
            applyArtwork(el, url, track);
            return;
          }
        } catch (e) { /* ignore */ }
      }
      artworkCache[key] = null;
      applyArtwork(el, null, track);
    })();
  }

  function applyArtwork(el, url, track) {
    if (url) {
      el.style.backgroundImage = `url("${url}")`;
      el.textContent = '';
    } else {
      el.style.backgroundImage = '';
      el.textContent = track ? track.albumCode.replace(/EN$/, '').slice(-4, -1) : '';
    }
  }

  // --- Playback ---
  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.volume = state.volume;
    audio.addEventListener('timeupdate', () => {
      if (!dom) return;
      const cur = audio.currentTime, dur = audio.duration || 0;
      dom.cur.textContent = fmtTime(cur);
      dom.dur.textContent = fmtTime(dur);
      dom.fill.style.width = (dur > 0 ? (cur / dur * 100) : 0) + '%';
      // persist position every ~5s
      if (Math.floor(cur) % 5 === 0) saveState();
    });
    audio.addEventListener('play', () => { state.playing = true; updateUI(); });
    audio.addEventListener('pause', () => { state.playing = false; updateUI(); saveState(); });
    audio.addEventListener('ended', () => {
      if (state.repeat) { playIndex(queueIndex, { position: 0 }); return; }
      const ni = pickNextIndex();
      if (state.continueMode && ni >= 0 && ni < playableQueue.length) {
        playIndex(ni);
      } else {
        state.playing = false;
        updateUI();
        saveState();
      }
    });
    audio.addEventListener('error', () => {
      console.warn('jv-player: audio error', audio.error);
      if (state.continueMode && queueIndex < playableQueue.length - 1) {
        playIndex(queueIndex + 1);
      }
    });
    return audio;
  }

  // Next-track selection — random when shuffle is on, otherwise sequential.
  function pickNextIndex() {
    if (state.shuffle && playableQueue.length > 1) {
      let r;
      do { r = Math.floor(Math.random() * playableQueue.length); } while (r === queueIndex);
      return r;
    }
    return queueIndex + 1;
  }

  function playIndex(i, opts) {
    if (i < 0 || i >= playableQueue.length) return;
    queueIndex = i;
    const tr = playableQueue[i];
    state.albumCode = tr.albumCode;
    state.trackNum = tr.trackNum;
    const a = ensureAudio();
    a.src = MUSIC_BASE + tr.trackUrl;
    a.currentTime = (opts && opts.position) || 0;
    a.play().catch(err => {
      console.warn('jv-player: play failed', err);
    });
    saveState();
    updateUI();
  }

  function togglePlay() {
    if (queueIndex < 0) {
      if (playableQueue.length > 0) playIndex(0);
      return;
    }
    const a = ensureAudio();
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  // --- Public API ---
  window.jvPlayer = {
    play(albumCode, trackNum) {
      const ready = manifest ? Promise.resolve() : loadManifest();
      ready.then(() => {
        const i = findQueueIndex(albumCode, trackNum || 1);
        if (i >= 0) playIndex(i);
        else console.warn('jv-player: album/track not in playable queue', albumCode, trackNum);
      });
    },
    // Override the playable queue with a custom set of {albumCode, trackNum}
    // items and start playing from item 0. Used by the Top-20-Songs feature
    // so "Play All 20" walks just those songs (and continues into the rest of
    // the global queue once finished, if continueMode is on).
    playSet(items) {
      const ready = manifest ? Promise.resolve() : loadManifest();
      ready.then(() => {
        if (!Array.isArray(items) || items.length === 0) return;
        // Build a custom queue by resolving each item against the global manifest.
        const customQueue = [];
        for (const item of items) {
          if (!item || !item.albumCode) continue;
          const idx = findQueueIndex(item.albumCode, item.trackNum || 1);
          if (idx >= 0) customQueue.push(playableQueue[idx]);
        }
        if (customQueue.length === 0) return;
        // Splice the custom queue to the front of the playable queue so the
        // player walks our set first, then continues with whatever follows.
        // Insert just after the current position to avoid overwriting history.
        playableQueue = customQueue.concat(playableQueue.filter(t =>
          !customQueue.some(c => c.albumCode === t.albumCode && c.trackNum === t.trackNum)
        ));
        queueIndex = -1;
        playIndex(0);
      });
    },
    isPlaying() { return audio && !audio.paused; },
    getCurrent() { return queueIndex >= 0 ? playableQueue[queueIndex] : null; },
    setContinue(on) { state.continueMode = !!on; saveState(); updateUI(); }
  };

  // --- Auto-link album titles in exec-summary tables ---
  function autoLinkAlbumTitles() {
    // Match the pattern used by all 8 exec-summary tables:
    //   <td>NN</td><td class="album-title">Title</td><td class="code-cell">XXIM1001</td>...
    document.querySelectorAll('td.album-title').forEach(td => {
      // already linked?
      if (td.querySelector('a.jv-album-link')) return;
      const row = td.closest('tr');
      if (!row) return;
      const codeCell = row.querySelector('td.code-cell');
      if (!codeCell) return;
      const rawCode = (codeCell.textContent || '').trim();
      if (!rawCode) return;
      const fullCode = /EN$/.test(rawCode) ? rawCode : rawCode + 'EN';
      // wrap inner content in a link (preserve any star/peak marks)
      const a = document.createElement('a');
      a.className = 'jv-album-link';
      a.href = ALBUM_PAGE + '?code=' + encodeURIComponent(fullCode);
      a.title = 'Open album page';
      while (td.firstChild) a.appendChild(td.firstChild);
      td.appendChild(a);
    });
  }

  // --- Wiring ---
  function wireEvents() {
    if (!dom) return;
    dom.play.addEventListener('click', togglePlay);
    dom.prev.addEventListener('click', () => { if (queueIndex > 0) playIndex(queueIndex - 1); });
    dom.next.addEventListener('click', () => { const ni = pickNextIndex(); if (ni >= 0 && ni < playableQueue.length) playIndex(ni); });
    if (dom.shuffle) dom.shuffle.addEventListener('click', () => { state.shuffle = !state.shuffle; dom.shuffle.classList.toggle('active', state.shuffle); });
    if (dom.repeat) dom.repeat.addEventListener('click', () => { state.repeat = !state.repeat; dom.repeat.classList.toggle('active', state.repeat); });
    dom.cont.addEventListener('click', () => {
      state.continueMode = !state.continueMode;
      saveState();
      updateUI();
    });
    dom.bar.addEventListener('click', (e) => {
      if (!audio || !audio.duration) return;
      const rect = dom.bar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });
    dom.volbar.addEventListener('click', (e) => {
      const rect = dom.volbar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      state.volume = pct;
      if (audio) audio.volume = pct;
      saveState();
      updateUI();
    });
    document.addEventListener('keydown', (e) => {
      const ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.shiftKey && e.code === 'KeyN') { if (queueIndex < playableQueue.length - 1) playIndex(queueIndex + 1); }
      if (e.shiftKey && e.code === 'KeyP') { if (queueIndex > 0) playIndex(queueIndex - 1); }
    });
  }

  // --- Init ---
  async function init() {
    // Idempotency guard: if the sticky footer player already exists in the DOM
    // (i.e. turbo-nav preserved it across a soft navigation), do not double-init.
    // We just re-run the auto-link-album-titles pass on the new content below.
    if (document.getElementById('jv-player')) {
      try { autoLinkAlbumTitles(); } catch (e) { /* ignore */ }
      return;
    }
    try {
      await loadManifest();
    } catch (e) {
      console.warn('jv-player: manifest load failed; player will still render but queue is empty', e);
    }
    dom = buildPlayerDOM();
    wireEvents();
    autoLinkAlbumTitles();
    // restore state if a track was previously playing/loaded
    if (state.albumCode && state.trackNum && playableQueue.length > 0) {
      const i = findQueueIndex(state.albumCode, state.trackNum);
      if (i >= 0) {
        queueIndex = i;
        const tr = playableQueue[i];
        const a = ensureAudio();
        a.src = MUSIC_BASE + tr.trackUrl;
        a.currentTime = state.position || 0;
        // do NOT auto-play on page load — wait for user gesture
        updateUI();
      }
    } else {
      updateUI();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
