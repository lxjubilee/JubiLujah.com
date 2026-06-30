/* Jubilujah.com — Polymorphic Ratings Widget
 * Build Spec §9. Vanilla JS, no dependencies.
 *
 * Usage: drop <div data-ratings-target="TYPE:ID"></div> into the page,
 * where TYPE in {song, album, artist, playlist, program} and ID is a UUID.
 * Include ratings.css + ratings.js. Auto-mounts on DOMContentLoaded and
 * also exposes window.JVRatings.mount(el) for dynamically added nodes.
 */
(function () {
  'use strict';

  var API_BASE = '/api/ratings';
  var LS_PREFIX = 'jv.rating.';
  var STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 2.5l2.9 6.05 6.6.78-4.85 4.55 1.27 6.52L12 17.27 6.08 20.4l1.27-6.52L2.5 9.33l6.6-.78L12 2.5z"/>' +
    '</svg>';
  var CHEV_SVG =
    '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
    '<path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  // ---------- utilities ----------------------------------------------------

  function lsGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { window.localStorage.setItem(key, val); } catch (e) { /* quota */ }
  }

  function fmtAvg(avg, count) {
    if (!count) return '—';
    var n = Number(avg);
    if (!isFinite(n)) return '—';
    return n.toFixed(1);
  }

  function pluralize(n, one, many) {
    return n === 1 ? one : many;
  }

  function safeJSON(res) {
    return res.text().then(function (t) {
      if (!t) return {};
      try { return JSON.parse(t); } catch (e) { return {}; }
    });
  }

  function parseTarget(raw) {
    if (!raw) return null;
    var idx = raw.indexOf(':');
    if (idx <= 0 || idx === raw.length - 1) return null;
    var type = raw.slice(0, idx).trim().toLowerCase();
    var id = raw.slice(idx + 1).trim();
    if (!type || !id) return null;
    return { type: type, id: id };
  }

  // ---------- widget instance ----------------------------------------------

  function Widget(root, target) {
    this.root = root;
    this.type = target.type;
    this.id = target.id;
    this.lsKey = LS_PREFIX + this.type + '.' + this.id;
    this.state = {
      avg: 0,
      count: 0,
      distribution: [0, 0, 0, 0, 0], // index 0 = 1-star
      mine: null,                    // 1..5 or null
      expanded: false,
      hover: 0,                      // 0..5
      busy: false,
      error: null
    };

    // optimistic local seed
    var cached = lsGet(this.lsKey);
    if (cached) {
      var n = parseInt(cached, 10);
      if (n >= 1 && n <= 5) this.state.mine = n;
    }

    this.build();
    this.render();
    this.fetchAggregate();
  }

  Widget.prototype.build = function () {
    var root = this.root;
    root.classList.add('jv-ratings');
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'Rate this ' + this.type);
    root.innerHTML = '';

    var row = document.createElement('div');
    row.className = 'jv-ratings__row';
    this.starsWrap = document.createElement('div');
    this.starsWrap.className = 'jv-ratings__stars';
    this.starsWrap.style.display = 'inline-flex';
    this.starEls = [];

    var self = this;
    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var btn = document.createElement('span');
        btn.className = 'star';
        btn.setAttribute('role', 'button');
        btn.setAttribute('tabindex', '0');
        btn.setAttribute('aria-label', n + ' ' + pluralize(n, 'star', 'stars'));
        btn.dataset.value = String(n);
        btn.innerHTML = STAR_SVG;
        btn.addEventListener('mouseenter', function () { self.onHover(n); });
        btn.addEventListener('mouseleave', function () { self.onHover(0); });
        btn.addEventListener('focus', function () { self.onHover(n); });
        btn.addEventListener('blur', function () { self.onHover(0); });
        btn.addEventListener('click', function () { self.onPick(n); });
        btn.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            self.onPick(n);
          }
        });
        self.starsWrap.appendChild(btn);
        self.starEls.push(btn);
      })(i);
    }
    row.appendChild(this.starsWrap);

    this.aggBtn = document.createElement('button');
    this.aggBtn.type = 'button';
    this.aggBtn.className = 'agg';
    this.aggBtn.setAttribute('aria-expanded', 'false');
    this.aggBtn.addEventListener('click', function () { self.toggleDist(); });
    row.appendChild(this.aggBtn);

    root.appendChild(row);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'empty';
    root.appendChild(this.statusEl);

    this.distEl = document.createElement('div');
    this.distEl.className = 'jv-ratings-dist';
    this.distEl.setAttribute('aria-hidden', 'true');
    root.appendChild(this.distEl);
  };

  Widget.prototype.render = function () {
    var s = this.state;
    var preview = s.hover > 0 ? s.hover : (s.mine || 0);

    for (var i = 0; i < 5; i++) {
      var el = this.starEls[i];
      el.classList.toggle('filled', (i + 1) <= preview);
      el.classList.toggle('preview', s.hover > 0 && (i + 1) <= s.hover);
      el.setAttribute('aria-pressed', s.mine === (i + 1) ? 'true' : 'false');
    }

    // aggregate label
    var aggText;
    if (s.count > 0) {
      aggText = '★ ' + fmtAvg(s.avg, s.count) +
        ' (' + s.count + ' ' + pluralize(s.count, 'rating', 'ratings') + ')';
    } else {
      aggText = '★ — (0 ratings)';
    }
    this.aggBtn.innerHTML =
      '<strong>' + escapeHtml(aggText) + '</strong>' +
      '<span class="chev">' + CHEV_SVG + '</span>';
    this.aggBtn.classList.toggle('open', s.expanded);
    this.aggBtn.setAttribute('aria-expanded', s.expanded ? 'true' : 'false');

    // status row
    if (s.error) {
      this.statusEl.className = 'empty';
      this.statusEl.textContent = s.error;
    } else if (s.mine) {
      this.statusEl.className = 'you';
      this.statusEl.innerHTML =
        'Your rating: <strong>' + s.mine + '</strong> — click again to update';
    } else if (s.count === 0) {
      this.statusEl.className = 'empty';
      this.statusEl.textContent = 'Be the first to rate';
    } else {
      this.statusEl.className = 'empty';
      this.statusEl.textContent = '';
    }

    // distribution
    this.distEl.classList.toggle('open', s.expanded);
    this.distEl.setAttribute('aria-hidden', s.expanded ? 'false' : 'true');
    if (s.expanded) this.renderDist();

    this.root.classList.toggle('is-loading', s.busy);
    this.root.classList.toggle('is-error', !!s.error);
  };

  Widget.prototype.renderDist = function () {
    var s = this.state;
    var max = 0;
    for (var i = 0; i < 5; i++) if (s.distribution[i] > max) max = s.distribution[i];
    if (max === 0) max = 1;

    var html = '';
    for (var stars = 5; stars >= 1; stars--) {
      var c = s.distribution[stars - 1] || 0;
      var pct = Math.round((c / max) * 100);
      var label = '';
      for (var j = 0; j < stars; j++) label += '★';
      html +=
        '<div class="row">' +
          '<span class="label">' + label + '</span>' +
          '<span class="track"><span class="bar" style="width:' + pct + '%"></span></span>' +
          '<span class="count">' + c + '</span>' +
        '</div>';
    }
    this.distEl.innerHTML = html;
  };

  // ---------- interaction --------------------------------------------------

  Widget.prototype.onHover = function (n) {
    this.state.hover = n;
    this.render();
  };

  Widget.prototype.toggleDist = function () {
    this.state.expanded = !this.state.expanded;
    this.render();
  };

  Widget.prototype.onPick = function (n) {
    if (this.state.busy) return;
    var prev = this.state.mine;
    // optimistic
    this.state.mine = n;
    this.state.busy = true;
    this.state.error = null;
    lsSet(this.lsKey, String(n));
    this.render();
    this.submit(n, prev);
  };

  // ---------- network ------------------------------------------------------

  Widget.prototype.endpoint = function () {
    return API_BASE + '/' + encodeURIComponent(this.type) + '/' + encodeURIComponent(this.id);
  };

  Widget.prototype.fetchAggregate = function () {
    var self = this;
    if (typeof fetch !== 'function') return;
    fetch(this.endpoint(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' }
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return safeJSON(res);
    }).then(function (data) {
      self.applyAggregate(data);
    }).catch(function () {
      // silent — render keeps cached state
    });
  };

  Widget.prototype.submit = function (n, prev) {
    var self = this;
    if (typeof fetch !== 'function') {
      self.state.busy = false;
      self.state.error = 'Offline';
      self.render();
      return;
    }
    fetch(this.endpoint(), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ stars: n })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return safeJSON(res);
    }).then(function (data) {
      self.state.busy = false;
      self.applyAggregate(data);
    }).catch(function (err) {
      self.state.busy = false;
      self.state.mine = prev;
      if (prev) lsSet(self.lsKey, String(prev));
      self.state.error = 'Could not save rating';
      self.render();
    });
  };

  Widget.prototype.applyAggregate = function (data) {
    if (!data) return;
    var s = this.state;
    if (typeof data.avg_rating !== 'undefined') s.avg = Number(data.avg_rating) || 0;
    else if (typeof data.avg !== 'undefined') s.avg = Number(data.avg) || 0;
    if (typeof data.rating_count !== 'undefined') s.count = parseInt(data.rating_count, 10) || 0;
    else if (typeof data.count !== 'undefined') s.count = parseInt(data.count, 10) || 0;

    var dist = data.distribution || data.histogram;
    if (dist && typeof dist === 'object') {
      var arr = [0, 0, 0, 0, 0];
      if (Array.isArray(dist) && dist.length === 5) {
        for (var i = 0; i < 5; i++) arr[i] = parseInt(dist[i], 10) || 0;
      } else {
        for (var k = 1; k <= 5; k++) {
          var v = dist[k] != null ? dist[k] : dist[String(k)];
          arr[k - 1] = parseInt(v, 10) || 0;
        }
      }
      s.distribution = arr;
    }

    if (typeof data.my_rating !== 'undefined' && data.my_rating !== null) {
      var mine = parseInt(data.my_rating, 10);
      if (mine >= 1 && mine <= 5) {
        s.mine = mine;
        lsSet(this.lsKey, String(mine));
      }
    } else if (data.my_rating === null && s.mine && !lsGet(this.lsKey)) {
      s.mine = null;
    }

    this.render();
  };

  // ---------- helpers ------------------------------------------------------

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- public API ---------------------------------------------------

  function mount(el) {
    if (!el || el.dataset.jvRatingsMounted === '1') return null;
    var target = parseTarget(el.getAttribute('data-ratings-target'));
    if (!target) return null;
    el.dataset.jvRatingsMounted = '1';
    return new Widget(el, target);
  }

  function mountAll(scope) {
    var root = scope || document;
    var nodes = root.querySelectorAll('div[data-ratings-target]');
    var made = [];
    for (var i = 0; i < nodes.length; i++) {
      var w = mount(nodes[i]);
      if (w) made.push(w);
    }
    return made;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mountAll(); });
  } else {
    mountAll();
  }

  window.JVRatings = { mount: mount, mountAll: mountAll };
})();
