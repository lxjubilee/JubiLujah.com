/* ============================================================
   Jubilujah Persistent Footer Player (Build Spec §13)
   Vanilla JS - no framework. Zustand-equivalent global store.
   ============================================================ */
(function () {
  'use strict';

  if (window.jvPlayer && window.jvPlayer.__mounted) return;

  // ---------------------------------------------------------
  // Constants
  // ---------------------------------------------------------
  var STORAGE_KEY = 'jvPlayerState';
  var CDN_BASE = (window.JV_CDN_BASE || 'https://cdn.jubileeverse.com').replace(/\/$/, '');
  var LOOP_MODES = ['off', 'one', 'source', 'all'];
  var LOOP_GLYPH = { off: '', one: '1', source: 'S', all: '∞' };

  // ---------------------------------------------------------
  // Inline SVG icons (all original)
  // ---------------------------------------------------------
  var ICONS = {
    play:   '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z"/></svg>',
    pause:  '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    prev:   '<svg viewBox="0 0 24 24"><path d="M6 5h2v14H6zm12.5 0L9 12l9.5 7z"/></svg>',
    next:   '<svg viewBox="0 0 24 24"><path d="M16 5h2v14h-2zM5.5 5L15 12l-9.5 7z"/></svg>',
    loop:   '<svg viewBox="0 0 24 24"><path d="M17 17H7v-3l-4 4 4 4v-3h12v-6h-2v4zM7 7h10v3l4-4-4-4v3H5v6h2V7z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z"/></svg>',
    mute:   '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0014 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zM19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.96 8.96 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25a7.06 7.06 0 01-2.25 1.21v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    expand: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    close:  '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    note:   '<svg viewBox="0 0 24 24" class="placeholder-glyph"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z"/></svg>'
  };

  // ---------------------------------------------------------
  // Pub/sub store
  // ---------------------------------------------------------
  var subscribers = [];
  function notify() {
    for (var i = 0; i < subscribers.length; i++) {
      try { subscribers[i](store); } catch (e) { /* noop */ }
    }
  }
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);
    return function () {
      var idx = subscribers.indexOf(fn);
      if (idx > -1) subscribers.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  var store = {
    nowPlaying: null,
    isPlaying: false,
    positionSec: 0,
    durationSec: 0,
    volume: 0.8,
    upNext: [],
    history: [],
    source: null,
    loopMode: 'off',
    muted: false,
    expanded: false,
    mini: false
  };

  function persist() {
    try {
      var snap = {
        nowPlaying: store.nowPlaying,
        positionSec: store.positionSec,
        durationSec: store.durationSec,
        volume: store.volume,
        upNext: store.upNext,
        history: store.history,
        source: store.source,
        loopMode: store.loopMode,
        muted: store.muted,
        mini: store.mini
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
    } catch (e) { /* sessionStorage may be unavailable */ }
  }

  function restore() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var snap = JSON.parse(raw);
      if (!snap) return;
      if (snap.nowPlaying)   store.nowPlaying = snap.nowPlaying;
      if (typeof snap.positionSec === 'number') store.positionSec = snap.positionSec;
      if (typeof snap.durationSec === 'number') store.durationSec = snap.durationSec;
      if (typeof snap.volume === 'number')      store.volume = snap.volume;
      if (Array.isArray(snap.upNext))           store.upNext = snap.upNext;
      if (Array.isArray(snap.history))          store.history = snap.history;
      if (snap.source)                          store.source = snap.source;
      if (LOOP_MODES.indexOf(snap.loopMode) > -1) store.loopMode = snap.loopMode;
      if (typeof snap.muted === 'boolean')      store.muted = snap.muted;
      if (typeof snap.mini === 'boolean')       store.mini = snap.mini;
    } catch (e) { /* corrupted snapshot - ignore */ }
  }

  // ---------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------
  function fmtTime(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function songAudioUrl(song) {
    if (!song) return '';
    if (song.audioUrl) return song.audioUrl;
    if (song.url) return song.url;
    if (song.src) return song.src;
    if (song.id) return CDN_BASE + '/audio/' + encodeURIComponent(song.id) + '.mp3';
    return '';
  }

  function songCoverUrl(song) {
    if (!song) return '';
    if (song.coverUrl) return song.coverUrl;
    if (song.cover)    return song.cover;
    if (song.albumId)  return CDN_BASE + '/art/albums/' + encodeURIComponent(song.albumId) + '/cover-300.webp';
    return '';
  }

  function fetchJson(url) {
    return fetch(url, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  // ---------------------------------------------------------
  // DOM (lazily built on mount)
  // ---------------------------------------------------------
  var els = {};

  function buildDom() {
    var bar = document.createElement('div');
    bar.className = 'jv-player';
    bar.innerHTML = [
      '<div class="now">',
        '<div class="cover" data-action="expand" title="Open now-playing">', ICONS.note, '</div>',
        '<div class="meta">',
          '<div class="title"></div>',
          '<div class="sub"></div>',
        '</div>',
      '</div>',
      '<div class="ctrls">',
        '<div class="buttons">',
          '<button class="prev" data-action="prev" title="Previous (P)" aria-label="Previous">', ICONS.prev, '</button>',
          '<button class="play" data-action="toggle" title="Play/Pause (Space)" aria-label="Play">', ICONS.play, '</button>',
          '<button class="next" data-action="next" title="Next (N)" aria-label="Next">', ICONS.next, '</button>',
        '</div>',
        '<div class="progress-row">',
          '<div class="times"><span class="cur">0:00</span> / <span class="dur">0:00</span></div>',
          '<div class="progress" data-action="seek" role="slider" aria-label="Seek">',
            '<div class="fill"></div>',
            '<div class="scrub-thumb"></div>',
          '</div>',
        '</div>',
      '</div>',
      '<div class="right">',
        '<button class="loop" data-action="loop" title="Loop mode (L)" aria-label="Loop mode">', ICONS.loop, '<span class="loop-badge" hidden></span></button>',
        '<div class="volume" title="Volume (↑/↓, M to mute)">',
          '<button class="mute-btn" data-action="mute" aria-label="Mute">', ICONS.volume, '</button>',
          '<input type="range" min="0" max="1" step="0.01" value="0.8" aria-label="Volume" />',
        '</div>',
        '<button class="expand" data-action="expand" title="Expand" aria-label="Expand">', ICONS.expand, '</button>',
      '</div>'
    ].join('');

    var overlay = document.createElement('div');
    overlay.className = 'jv-player-overlay';
    overlay.innerHTML = [
      '<button class="close" data-action="collapse" aria-label="Close">', ICONS.close, '</button>',
      '<div class="ov-main">',
        '<div class="ov-cover">', ICONS.note, '</div>',
        '<div class="ov-info">',
          '<div class="ov-title">—</div>',
          '<div class="ov-artist"></div>',
          '<div class="ov-album"></div>',
          '<div class="ov-section">',
            '<h3>Lyrics</h3>',
            '<div class="ov-lyrics"><span class="empty">Lyrics will appear here when available.</span></div>',
          '</div>',
          '<div class="ov-section">',
            '<h3>Ratings</h3>',
            '<div class="ov-ratings" data-ratings-target=""></div>',
          '</div>',
          '<div class="ov-section">',
            '<h3>Nominations</h3>',
            '<div class="ov-nominations" data-nominations-target=""></div>',
          '</div>',
          '<div class="ov-section">',
            '<a class="ov-comments-link" data-comments-link href="#">View comments →</a>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    var audio = document.createElement('audio');
    audio.id = 'jv-audio';
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';

    document.body.appendChild(audio);
    document.body.appendChild(bar);
    document.body.appendChild(overlay);

    els.bar       = bar;
    els.overlay   = overlay;
    els.audio     = audio;
    els.cover     = bar.querySelector('.now .cover');
    els.title     = bar.querySelector('.now .title');
    els.sub       = bar.querySelector('.now .sub');
    els.playBtn   = bar.querySelector('.play');
    els.prevBtn   = bar.querySelector('.prev');
    els.nextBtn   = bar.querySelector('.next');
    els.progress  = bar.querySelector('.progress');
    els.fill      = bar.querySelector('.fill');
    els.thumb     = bar.querySelector('.scrub-thumb');
    els.timeCur   = bar.querySelector('.times .cur');
    els.timeDur   = bar.querySelector('.times .dur');
    els.loopBtn   = bar.querySelector('.loop');
    els.loopBadge = bar.querySelector('.loop-badge');
    els.muteBtn   = bar.querySelector('.mute-btn');
    els.volRange  = bar.querySelector('input[type="range"]');
    els.expandBtn = bar.querySelector('.expand');
    els.ovCover   = overlay.querySelector('.ov-cover');
    els.ovTitle   = overlay.querySelector('.ov-title');
    els.ovArtist  = overlay.querySelector('.ov-artist');
    els.ovAlbum   = overlay.querySelector('.ov-album');
    els.ovLyrics  = overlay.querySelector('.ov-lyrics');
    els.ovRatings = overlay.querySelector('.ov-ratings');
    els.ovNoms    = overlay.querySelector('.ov-nominations');
    els.ovComments= overlay.querySelector('[data-comments-link]');
    els.ovClose   = overlay.querySelector('.close');
  }

  // ---------------------------------------------------------
  // Renderers
  // ---------------------------------------------------------
  function renderBar() {
    if (!els.bar) return;
    var song = store.nowPlaying;
    if (song) {
      els.bar.classList.add('active');
      els.bar.style.display = '';
    } else {
      els.bar.classList.remove('active');
      els.bar.style.display = 'none';
    }
    els.bar.classList.toggle('mini', !!store.mini);

    var title  = song ? (song.title || song.name || 'Untitled') : '';
    var artist = song ? (song.artist || song.artistName || '') : '';
    var album  = song ? (song.album || song.albumTitle || '') : '';
    var sub    = [artist, album].filter(Boolean).join(' — ');
    els.title.textContent = title;
    els.sub.textContent   = sub;

    // cover art
    var cu = songCoverUrl(song);
    if (cu) {
      els.cover.innerHTML = '<img src="' + cu + '" alt="" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'), {innerHTML: \'' + ICONS.note.replace(/'/g, "\\'") + '\'}))">';
    } else {
      els.cover.innerHTML = ICONS.note;
    }

    // play/pause icon
    els.playBtn.innerHTML = store.isPlaying ? ICONS.pause : ICONS.play;
    els.playBtn.setAttribute('aria-label', store.isPlaying ? 'Pause' : 'Play');

    // progress
    var pct = (store.durationSec > 0) ? (store.positionSec / store.durationSec) * 100 : 0;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
    els.fill.style.width = pct + '%';
    els.thumb.style.left = pct + '%';
    els.timeCur.textContent = fmtTime(store.positionSec);
    els.timeDur.textContent = fmtTime(store.durationSec);

    // loop indicator
    els.loopBtn.classList.toggle('active', store.loopMode !== 'off');
    var badge = LOOP_GLYPH[store.loopMode] || '';
    if (badge) {
      els.loopBadge.textContent = badge;
      els.loopBadge.hidden = false;
    } else {
      els.loopBadge.hidden = true;
    }
    els.loopBtn.title = 'Loop: ' + store.loopMode + ' (L to cycle)';

    // volume / mute
    els.muteBtn.innerHTML = (store.muted || store.volume === 0) ? ICONS.mute : ICONS.volume;
    els.volRange.value = String(store.volume);
  }

  function renderOverlay() {
    if (!els.overlay) return;
    var song = store.nowPlaying;
    els.overlay.classList.toggle('open', !!store.expanded);
    if (!song) return;
    var title  = song.title || song.name || 'Untitled';
    var artist = song.artist || song.artistName || '';
    var album  = song.album || song.albumTitle || '';
    els.ovTitle.textContent  = title;
    els.ovArtist.textContent = artist;
    els.ovAlbum.textContent  = album;
    var cu = songCoverUrl(song);
    if (cu) {
      els.ovCover.innerHTML = '<img src="' + cu + '" alt="">';
    } else {
      els.ovCover.innerHTML = ICONS.note;
    }
    if (song.lyrics) {
      els.ovLyrics.textContent = song.lyrics;
    } else {
      els.ovLyrics.innerHTML = '<span class="empty">Lyrics will appear here when available.</span>';
    }
    var sid = song.id || '';
    els.ovRatings.setAttribute('data-ratings-target', 'song:' + sid);
    els.ovNoms.setAttribute('data-nominations-target', 'song:' + sid);
    els.ovComments.setAttribute('href', '/songs/' + encodeURIComponent(sid) + '#comments');
  }

  function render() {
    renderBar();
    renderOverlay();
    notify();
    persist();
  }

  // ---------------------------------------------------------
  // Audio binding
  // ---------------------------------------------------------
  function loadSongIntoAudio(song, autoplay) {
    if (!song) return;
    var url = songAudioUrl(song);
    if (!url) return;
    if (els.audio.src !== url) {
      els.audio.src = url;
    }
    els.audio.volume = store.muted ? 0 : store.volume;
    if (autoplay) {
      var p = els.audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(function () { /* autoplay blocked */ store.isPlaying = false; render(); });
      }
    }
    setMediaSessionMetadata(song);
  }

  function bindAudioEvents() {
    els.audio.addEventListener('play',   function () { store.isPlaying = true;  updatePositionState(); render(); });
    els.audio.addEventListener('pause',  function () { store.isPlaying = false; updatePositionState(); render(); });
    els.audio.addEventListener('ended',  function () { onTrackEnd(); });
    els.audio.addEventListener('timeupdate', function () {
      store.positionSec = els.audio.currentTime || 0;
      // Lightweight render (just progress)
      var pct = (store.durationSec > 0) ? (store.positionSec / store.durationSec) * 100 : 0;
      if (pct < 0) pct = 0; if (pct > 100) pct = 100;
      els.fill.style.width = pct + '%';
      els.thumb.style.left = pct + '%';
      els.timeCur.textContent = fmtTime(store.positionSec);
      // Persist occasionally
      if (Math.floor(store.positionSec) % 5 === 0) persist();
    });
    els.audio.addEventListener('loadedmetadata', function () {
      store.durationSec = els.audio.duration || 0;
      render();
    });
    els.audio.addEventListener('volumechange', function () {
      store.volume = els.audio.volume;
      render();
    });
    els.audio.addEventListener('error', function () { /* swallow - keep UI alive */ });
  }

  function onTrackEnd() {
    if (store.loopMode === 'one') {
      els.audio.currentTime = 0;
      els.audio.play();
      return;
    }
    api.skipNext();
  }

  // ---------------------------------------------------------
  // Media Session
  // ---------------------------------------------------------
  function setMediaSessionMetadata(song) {
    if (!('mediaSession' in navigator) || !song) return;
    try {
      var artworkUrl = songCoverUrl(song);
      var artwork = artworkUrl ? [{ src: artworkUrl, sizes: '300x300', type: 'image/webp' }] : [];
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title:  song.title  || song.name || 'Untitled',
        artist: song.artist || song.artistName || '',
        album:  song.album  || song.albumTitle || '',
        artwork: artwork
      });
    } catch (e) { /* noop */ }
  }

  function updatePositionState() {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: store.durationSec || 0,
        position: store.positionSec || 0,
        playbackRate: els.audio.playbackRate || 1
      });
    } catch (e) { /* noop */ }
  }

  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    var ms = navigator.mediaSession;
    var handlers = {
      play:          function () { api.resume(); },
      pause:         function () { api.pause(); },
      previoustrack: function () { api.skipPrev(); },
      nexttrack:     function () { api.skipNext(); },
      seekto:        function (d) { if (d && typeof d.seekTime === 'number') api.seekTo(d.seekTime); },
      seekforward:   function (d) { api.seekTo(store.positionSec + ((d && d.seekOffset) || 10)); },
      seekbackward:  function (d) { api.seekTo(store.positionSec - ((d && d.seekOffset) || 10)); }
    };
    for (var name in handlers) {
      try { ms.setActionHandler(name, handlers[name]); } catch (e) { /* unsupported */ }
    }
  }

  // ---------------------------------------------------------
  // Source resolution (spec §13)
  // ---------------------------------------------------------
  function loadAlbumManifest(id) {
    return fetchJson(CDN_BASE + '/catalog/albums/' + encodeURIComponent(id) + '.json');
  }
  function loadPlaylistManifest(id) {
    return fetchJson(CDN_BASE + '/catalog/playlists/' + encodeURIComponent(id) + '.json');
  }
  function loadArtistManifest(id) {
    return fetchJson(CDN_BASE + '/catalog/artists/' + encodeURIComponent(id) + '.json');
  }

  function expandManifestToSongs(manifest) {
    if (!manifest) return [];
    if (Array.isArray(manifest.songs))   return manifest.songs.slice();
    if (Array.isArray(manifest.tracks))  return manifest.tracks.slice();
    if (Array.isArray(manifest.items))   return manifest.items.slice();
    return [];
  }

  function autoLoadNextFromSource() {
    var src = store.source;
    if (!src) {
      if (store.loopMode === 'all' && store.history.length) {
        // restart from history
        var first = store.history[0];
        var rest = store.history.slice(1).concat(store.nowPlaying ? [store.nowPlaying] : []);
        store.upNext = rest;
        store.history = [];
        api.play(first, store.source);
      }
      return;
    }
    var nextIdAttr = (src.type === 'album') ? 'nextAlbumId'
                   : (src.type === 'playlist') ? 'nextPlaylistId'
                   : (src.type === 'artist')   ? 'nextSongId'
                   : null;
    var loader   = (src.type === 'album') ? loadAlbumManifest
                 : (src.type === 'playlist') ? loadPlaylistManifest
                 : (src.type === 'artist')   ? loadArtistManifest
                 : null;
    if (!loader) return;

    // Re-fetch current source manifest to read pointer to "next"
    loader(src.id).then(function (m) {
      if (store.loopMode === 'source') {
        var songs = expandManifestToSongs(m);
        if (!songs.length) return;
        var first = songs[0];
        store.upNext = songs.slice(1);
        store.history = [];
        api.play(first, src);
        return;
      }
      var nextId = m && nextIdAttr ? m[nextIdAttr] : null;
      if (!nextId) {
        if (store.loopMode === 'all') {
          var s2 = expandManifestToSongs(m);
          if (s2.length) {
            var f2 = s2[0];
            store.upNext = s2.slice(1);
            api.play(f2, src);
          }
        }
        return;
      }
      var nextSrc = { type: src.type, id: nextId };
      loader(nextId).then(function (m2) {
        var songs2 = expandManifestToSongs(m2);
        if (!songs2.length) return;
        store.source = nextSrc;
        store.upNext = songs2.slice(1);
        api.play(songs2[0], nextSrc);
      }).catch(function () {});
    }).catch(function () {});
  }

  // ---------------------------------------------------------
  // Public API
  // ---------------------------------------------------------
  var api = {
    __mounted: false,

    play: function (song, source) {
      if (!song) return;
      if (store.nowPlaying && store.nowPlaying.id !== song.id) {
        store.history.push(store.nowPlaying);
        if (store.history.length > 200) store.history.shift();
      }
      store.nowPlaying = song;
      if (source) store.source = source;
      store.positionSec = 0;
      loadSongIntoAudio(song, true);
      render();
    },

    pause: function () {
      els.audio.pause();
      store.isPlaying = false;
      render();
    },

    resume: function () {
      if (!store.nowPlaying) return;
      if (!els.audio.src) loadSongIntoAudio(store.nowPlaying, false);
      var p = els.audio.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    },

    togglePlay: function () {
      if (!store.nowPlaying) return;
      if (els.audio.paused) api.resume(); else api.pause();
    },

    skipNext: function () {
      if (store.nowPlaying) {
        store.history.push(store.nowPlaying);
        if (store.history.length > 200) store.history.shift();
      }
      if (store.upNext.length) {
        var next = store.upNext.shift();
        store.nowPlaying = next;
        store.positionSec = 0;
        loadSongIntoAudio(next, true);
        render();
        return;
      }
      // upNext empty: consult source / loop mode
      if (store.loopMode === 'all' && store.history.length) {
        // Wrap to beginning of history
        var rebuilt = store.history.slice();
        var first = rebuilt.shift();
        store.upNext = rebuilt;
        store.history = [];
        store.nowPlaying = first;
        store.positionSec = 0;
        loadSongIntoAudio(first, true);
        render();
        return;
      }
      autoLoadNextFromSource();
      render();
    },

    skipPrev: function () {
      if (els.audio.currentTime > 3) {
        api.seekTo(0);
        return;
      }
      if (!store.history.length) {
        api.seekTo(0);
        return;
      }
      var prev = store.history.pop();
      if (store.nowPlaying) store.upNext.unshift(store.nowPlaying);
      store.nowPlaying = prev;
      store.positionSec = 0;
      loadSongIntoAudio(prev, true);
      render();
    },

    seekTo: function (seconds) {
      if (!isFinite(seconds)) return;
      var d = store.durationSec || els.audio.duration || 0;
      if (seconds < 0) seconds = 0;
      if (d && seconds > d) seconds = d;
      try { els.audio.currentTime = seconds; } catch (e) {}
      store.positionSec = seconds;
      render();
    },

    setVolume: function (vol) {
      if (typeof vol !== 'number' || !isFinite(vol)) return;
      if (vol < 0) vol = 0;
      if (vol > 1) vol = 1;
      store.volume = vol;
      store.muted = (vol === 0);
      els.audio.volume = vol;
      render();
    },

    toggleMute: function () {
      store.muted = !store.muted;
      els.audio.volume = store.muted ? 0 : store.volume;
      render();
    },

    setLoopMode: function (mode) {
      if (LOOP_MODES.indexOf(mode) < 0) return;
      store.loopMode = mode;
      try { els.audio.loop = (mode === 'one'); } catch (e) {}
      render();
    },

    cycleLoopMode: function () {
      var i = LOOP_MODES.indexOf(store.loopMode);
      api.setLoopMode(LOOP_MODES[(i + 1) % LOOP_MODES.length]);
    },

    playSource: function (source) {
      if (!source || !source.type || !source.id) return Promise.reject(new Error('bad source'));
      var loader = (source.type === 'album')    ? loadAlbumManifest
                 : (source.type === 'playlist') ? loadPlaylistManifest
                 : (source.type === 'artist')   ? loadArtistManifest
                 : null;
      if (!loader) {
        // ad-hoc: caller must supply `songs`
        if (Array.isArray(source.songs) && source.songs.length) {
          store.source = source;
          store.upNext = source.songs.slice(1);
          store.history = [];
          api.play(source.songs[0], source);
          return Promise.resolve();
        }
        return Promise.reject(new Error('Unknown source type'));
      }
      return loader(source.id).then(function (m) {
        var songs = expandManifestToSongs(m);
        if (!songs.length) throw new Error('Empty source manifest');
        store.source = { type: source.type, id: source.id, manifest: m };
        store.upNext = songs.slice(1);
        store.history = [];
        api.play(songs[0], store.source);
      });
    },

    playAlbum:    function (albumId)    { return api.playSource({ type: 'album',    id: albumId }); },
    playPlaylist: function (playlistId) { return api.playSource({ type: 'playlist', id: playlistId }); },
    playArtist:   function (artistId)   { return api.playSource({ type: 'artist',   id: artistId }); },

    expand:   function () { store.expanded = true;  render(); },
    collapse: function () { store.expanded = false; render(); },
    toggleExpand: function () { store.expanded = !store.expanded; render(); },

    setMini: function (b) { store.mini = !!b; render(); },
    toggleMini: function () { store.mini = !store.mini; render(); },

    getState: function () { return store; },
    subscribe: subscribe
  };

  // ---------------------------------------------------------
  // Event bindings
  // ---------------------------------------------------------
  function bindUiEvents() {
    els.bar.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-action]');
      if (!t) return;
      var act = t.getAttribute('data-action');
      if (act === 'toggle')   api.togglePlay();
      else if (act === 'prev') api.skipPrev();
      else if (act === 'next') api.skipNext();
      else if (act === 'loop') api.cycleLoopMode();
      else if (act === 'mute') api.toggleMute();
      else if (act === 'expand') api.expand();
    });

    // Progress bar scrubbing
    var scrubbing = false;
    function seekFromEvent(ev) {
      var rect = els.progress.getBoundingClientRect();
      var clientX = (ev.touches && ev.touches[0]) ? ev.touches[0].clientX : ev.clientX;
      var pct = (clientX - rect.left) / rect.width;
      if (pct < 0) pct = 0; if (pct > 1) pct = 1;
      var d = store.durationSec || 0;
      api.seekTo(pct * d);
    }
    els.progress.addEventListener('mousedown', function (ev) {
      scrubbing = true;
      seekFromEvent(ev);
      ev.preventDefault();
    });
    document.addEventListener('mousemove', function (ev) {
      if (scrubbing) seekFromEvent(ev);
    });
    document.addEventListener('mouseup', function () {
      scrubbing = false;
    });
    els.progress.addEventListener('touchstart', function (ev) { seekFromEvent(ev); }, { passive: true });
    els.progress.addEventListener('touchmove',  function (ev) { seekFromEvent(ev); }, { passive: true });

    // Volume slider
    els.volRange.addEventListener('input', function () {
      var v = parseFloat(els.volRange.value);
      api.setVolume(v);
    });

    // Overlay close + cover click to expand
    els.ovClose.addEventListener('click', function () { api.collapse(); });
    els.overlay.addEventListener('click', function (ev) {
      if (ev.target === els.overlay) api.collapse();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (ev) {
      var ae = document.activeElement;
      if (ae) {
        var tag = (ae.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (ae.isContentEditable) return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      switch (ev.key) {
        case ' ':
        case 'Spacebar':
          ev.preventDefault();
          api.togglePlay();
          break;
        case 'ArrowLeft':
          ev.preventDefault();
          api.seekTo((store.positionSec || 0) - 10);
          break;
        case 'ArrowRight':
          ev.preventDefault();
          api.seekTo((store.positionSec || 0) + 10);
          break;
        case 'ArrowUp':
          ev.preventDefault();
          api.setVolume((store.volume || 0) + 0.05);
          break;
        case 'ArrowDown':
          ev.preventDefault();
          api.setVolume((store.volume || 0) - 0.05);
          break;
        case 'n': case 'N':
          api.skipNext();
          break;
        case 'p': case 'P':
          api.skipPrev();
          break;
        case 'm': case 'M':
          api.toggleMute();
          break;
        case 'l': case 'L':
          api.cycleLoopMode();
          break;
        case 'Escape':
          if (store.expanded) api.collapse();
          break;
      }
    });
  }

  // ---------------------------------------------------------
  // Mount
  // ---------------------------------------------------------
  function mount() {
    if (api.__mounted) return;
    restore();
    buildDom();
    bindAudioEvents();
    bindUiEvents();
    bindMediaSession();

    // Apply restored state to audio element
    els.audio.volume = store.muted ? 0 : store.volume;
    els.audio.loop   = (store.loopMode === 'one');
    if (store.nowPlaying) {
      loadSongIntoAudio(store.nowPlaying, false);
      // Restore scrub position once metadata loads
      els.audio.addEventListener('loadedmetadata', function once() {
        els.audio.removeEventListener('loadedmetadata', once);
        try { els.audio.currentTime = store.positionSec || 0; } catch (e) {}
      });
    }

    api.__mounted = true;
    // Expose state fields on the api object for convenient inspection
    // (without losing reactivity — read store directly when needed)
    Object.defineProperty(api, 'nowPlaying',  { get: function () { return store.nowPlaying; } });
    Object.defineProperty(api, 'isPlaying',   { get: function () { return store.isPlaying; } });
    Object.defineProperty(api, 'positionSec', { get: function () { return store.positionSec; } });
    Object.defineProperty(api, 'durationSec', { get: function () { return store.durationSec; } });
    Object.defineProperty(api, 'volume',      { get: function () { return store.volume; } });
    Object.defineProperty(api, 'upNext',      { get: function () { return store.upNext; } });
    Object.defineProperty(api, 'history',     { get: function () { return store.history; } });
    Object.defineProperty(api, 'source',      { get: function () { return store.source; } });
    Object.defineProperty(api, 'loopMode',    { get: function () { return store.loopMode; } });

    render();
  }

  window.jvPlayer = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
