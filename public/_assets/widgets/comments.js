/* Jubilujah Comments Widget — Build Spec §10
 * Auto-initializes on every <div data-comments-target="TYPE:ID"></div>.
 * Vanilla JS, no framework. One level of threaded replies, @mentions,
 * own-only edit/delete (soft), optional lyric_line anchor, optimistic UI
 * via localStorage. */
(function () {
  'use strict';

  // --- Mock current user (replaced by real auth in production) ---
  var CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001';
  var CURRENT_USER_NAME = 'You';

  var MAX_LEN = 4000;
  var LS_PREFIX = 'jv:comments:';

  // --- Tiny DOM helpers ---
  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') n.className = v;
        else if (k === 'dataset') {
          for (var dk in v) n.dataset[dk] = v[dk];
        } else if (k.indexOf('on') === 0 && typeof v === 'function') {
          n.addEventListener(k.slice(2), v);
        } else if (v !== false && v != null) {
          n.setAttribute(k, v);
        }
      }
    }
    if (children != null) {
      if (!Array.isArray(children)) children = [children];
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null || c === false) continue;
        n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // --- Hash-based avatar color (deterministic per user id) ---
  function avatarColor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) | 0;
    }
    var hue = Math.abs(h) % 360;
    return 'hsl(' + hue + ', 55%, 45%)';
  }
  function initials(name) {
    if (!name) return '?';
    var parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // --- Timestamp formatting (relative) ---
  function formatTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var diff = (Date.now() - t) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
    var d = new Date(iso);
    return d.toLocaleDateString();
  }

  // --- @mention parser. Renders @username as a styled span.
  // TODO: hook up live autocomplete against /api/users/mentions?q= --- */
  var MENTION_RE = /@([A-Za-z0-9_][A-Za-z0-9_.-]{0,31})/g;
  function renderBody(text) {
    var frag = document.createDocumentFragment();
    if (!text) return frag;
    var last = 0;
    var m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text)) !== null) {
      if (m.index > last) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      frag.appendChild(el('span', { class: 'mention' }, '@' + m[1]));
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  function extractMentions(text) {
    var out = [];
    var seen = {};
    var m;
    MENTION_RE.lastIndex = 0;
    while ((m = MENTION_RE.exec(text)) !== null) {
      if (!seen[m[1]]) { seen[m[1]] = true; out.push(m[1]); }
    }
    return out;
  }

  // --- Lyric anchor detection from URL ---
  function detectLyricAnchor() {
    var path = window.location.pathname || '';
    var m = path.match(/\/music\/[^/]+\/songs\/([0-9a-fA-F-]{8,})/);
    if (!m) return null;
    var hash = window.location.hash || '';
    var lm = hash.match(/^#L(\d+)$/);
    if (!lm) return null;
    var line = parseInt(lm[1], 10);
    return isNaN(line) ? null : line;
  }

  // --- API layer (with localStorage optimistic mirror) ---
  function lsKey(type, id) { return LS_PREFIX + type + ':' + id; }
  function loadOptimistic(type, id) {
    try {
      var raw = localStorage.getItem(lsKey(type, id));
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveOptimistic(type, id, list) {
    try { localStorage.setItem(lsKey(type, id), JSON.stringify(list)); }
    catch (e) { /* quota — ignore */ }
  }

  function api(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (r.status === 204) return null;
      return r.json();
    });
  }

  // --- Merge server list with locally-pending optimistic entries ---
  function mergeOptimistic(serverList, optimistic) {
    var byId = {};
    for (var i = 0; i < serverList.length; i++) byId[serverList[i].id] = true;
    var merged = serverList.slice();
    for (var j = 0; j < optimistic.length; j++) {
      var o = optimistic[j];
      if (!byId[o.id]) merged.push(o);
    }
    return merged;
  }

  // --- Group into top-level + replies (1 level only) ---
  function buildTree(list) {
    var tops = [];
    var byParent = {};
    var topMap = {};
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.parent_id) { tops.push(c); topMap[c.id] = c; }
    }
    for (var k = 0; k < list.length; k++) {
      var r = list[k];
      if (r.parent_id) {
        // Walk up to find the top-level ancestor (collapse >1 deep).
        var anchorId = r.parent_id;
        if (!topMap[anchorId]) {
          // parent is itself a reply — anchor against grandparent if known.
          for (var m = 0; m < list.length; m++) {
            if (list[m].id === r.parent_id && list[m].parent_id) {
              anchorId = list[m].parent_id;
              break;
            }
          }
        }
        if (!byParent[anchorId]) byParent[anchorId] = [];
        byParent[anchorId].push(r);
      }
    }
    function byTime(a, b) {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    tops.sort(byTime);
    for (var pid in byParent) byParent[pid].sort(byTime);
    return { tops: tops, replies: byParent };
  }

  // ================================================================
  // Widget instance
  // ================================================================
  function Widget(host) {
    var target = host.getAttribute('data-comments-target') || '';
    var parts = target.split(':');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      host.textContent = '[comments: invalid data-comments-target]';
      return;
    }
    this.host = host;
    this.type = parts[0];
    this.id = parts[1];
    this.lyricLine = detectLyricAnchor();
    this.comments = [];
    this.optimistic = loadOptimistic(this.type, this.id);
    this.activeForm = null; // tracks open reply/edit form
    this.render();
    this.load();
  }

  Widget.prototype.endpoint = function (suffix) {
    return '/api/comments/' + encodeURIComponent(this.type) +
           '/' + encodeURIComponent(this.id) + (suffix || '');
  };

  Widget.prototype.load = function () {
    var self = this;
    this.threadHost.textContent = '';
    this.threadHost.appendChild(el('div', { class: 'jv-comments-loading' }, 'Loading comments…'));
    api('GET', this.endpoint()).then(function (data) {
      var list = Array.isArray(data) ? data : (data && data.comments) || [];
      self.comments = list;
      // Drop optimistic entries the server now knows about.
      var serverIds = {};
      for (var i = 0; i < list.length; i++) serverIds[list[i].id] = true;
      self.optimistic = self.optimistic.filter(function (o) { return !serverIds[o.id]; });
      saveOptimistic(self.type, self.id, self.optimistic);
      self.renderThread();
    }).catch(function () {
      // Network/API down — still show optimistic-only entries so user work isn't lost.
      self.comments = [];
      self.renderThread(true);
    });
  };

  Widget.prototype.render = function () {
    clear(this.host);
    this.host.classList.add('jv-comments');

    // --- Compose ---
    var ta = el('textarea', {
      placeholder: 'Add a comment… (@mention to tag editors)',
      maxlength: MAX_LEN,
      rows: 2
    });
    var count = el('span', { class: 'count' }, '0 / ' + MAX_LEN);
    var postBtn = el('button', { type: 'button', disabled: 'disabled' }, 'Post');
    var footerKids = [];
    if (this.lyricLine != null) {
      footerKids.push(el('span', { class: 'lyric-anchor' },
        'Anchored to lyric line ' + this.lyricLine));
    } else {
      footerKids.push(el('span', {}, ''));
    }
    var rightFoot = el('span', {}, [count, document.createTextNode('  '), postBtn]);
    footerKids.push(rightFoot);

    var compose = el('div', { class: 'compose' }, [
      ta,
      el('div', { class: 'footer' }, footerKids)
    ]);

    var self = this;
    function autoresize() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 280) + 'px';
    }
    function updateState() {
      var v = ta.value;
      var len = v.length;
      count.textContent = len + ' / ' + MAX_LEN;
      if (len > MAX_LEN * 0.9) count.classList.add('over');
      else count.classList.remove('over');
      postBtn.disabled = v.trim().length === 0;
      autoresize();
    }
    ta.addEventListener('input', updateState);
    postBtn.addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body) return;
      self.postComment(body, null, self.lyricLine).then(function () {
        ta.value = '';
        updateState();
      });
    });

    this.host.appendChild(compose);

    // --- Thread host ---
    this.threadHost = el('div', { class: 'thread-host' });
    this.host.appendChild(this.threadHost);
  };

  Widget.prototype.renderThread = function (apiFailed) {
    clear(this.threadHost);
    var all = mergeOptimistic(this.comments, this.optimistic);
    if (!all.length) {
      var msg = apiFailed
        ? 'Could not load comments.'
        : 'No comments yet. Be the first to add one.';
      this.threadHost.appendChild(el('div',
        { class: apiFailed ? 'jv-comments-error' : 'jv-comments-empty' }, msg));
      return;
    }
    var tree = buildTree(all);
    var ul = el('ul', { class: 'thread' });
    for (var i = 0; i < tree.tops.length; i++) {
      var top = tree.tops[i];
      var li = el('li', {}, this.renderCard(top, false));
      var replies = tree.replies[top.id] || [];
      if (replies.length) {
        var rul = el('ul', { class: 'replies' });
        for (var j = 0; j < replies.length; j++) {
          rul.appendChild(el('li', {}, this.renderCard(replies[j], true)));
        }
        li.appendChild(rul);
      }
      ul.appendChild(li);
    }
    this.threadHost.appendChild(ul);
  };

  Widget.prototype.renderCard = function (c, isReply) {
    var self = this;
    var isOwn = c.author_user_id === CURRENT_USER_ID;
    var isDeleted = !!c.deleted_at;
    var authorName = c.author_name || (isOwn ? CURRENT_USER_NAME : 'Editor');

    var classes = 'comment' + (isReply ? ' reply' : '') + (isDeleted ? ' deleted' : '');
    var card = el('div', { class: classes, dataset: { commentId: c.id } });

    // Avatar
    var av = el('div', { class: 'avatar' }, initials(authorName));
    av.style.background = avatarColor(c.author_user_id || 'anon');
    card.appendChild(av);

    // Content
    var contentEls = [];
    var metaKids = [
      el('span', { class: 'name' }, authorName),
      el('span', { class: 'time' }, formatTime(c.created_at))
    ];
    if (c.updated_at && c.created_at && c.updated_at !== c.created_at && !isDeleted) {
      metaKids.push(el('span', { class: 'edited' }, 'edited'));
    }
    if (c.lyric_line != null) {
      metaKids.push(el('span', { class: 'anchor' }, 'line ' + c.lyric_line));
    }
    contentEls.push(el('div', { class: 'meta' }, metaKids));

    var bodyDiv = el('div', { class: 'body' });
    if (isDeleted) {
      bodyDiv.textContent = '[deleted by author]';
    } else {
      bodyDiv.appendChild(renderBody(c.body || ''));
    }
    contentEls.push(bodyDiv);

    if (!isDeleted) {
      var actions = [];
      if (!isReply) {
        actions.push(el('button', {
          type: 'button',
          onclick: function () { self.openReplyForm(c, card); }
        }, 'Reply'));
      }
      if (isOwn) {
        actions.push(el('button', {
          type: 'button',
          onclick: function () { self.openEditForm(c, card); }
        }, 'Edit'));
        actions.push(el('button', {
          type: 'button',
          onclick: function () { self.deleteComment(c); }
        }, 'Delete'));
      }
      if (actions.length) contentEls.push(el('div', { class: 'actions' }, actions));
    }

    card.appendChild(el('div', { class: 'content' }, contentEls));
    return card;
  };

  // --- Inline reply form (under a top-level card) ---
  Widget.prototype.openReplyForm = function (parent, card) {
    this.closeActiveForm();
    var self = this;
    var ta = el('textarea', {
      placeholder: 'Reply to @' + (parent.author_name || 'editor') + '…',
      maxlength: MAX_LEN,
      rows: 2
    });
    var submit = el('button', { type: 'button', class: 'primary', disabled: 'disabled' }, 'Reply');
    var cancel = el('button', { type: 'button' }, 'Cancel');
    var form = el('div', { class: 'inline-form' }, [
      ta,
      el('div', { class: 'form-actions' }, [cancel, submit])
    ]);
    ta.addEventListener('input', function () {
      submit.disabled = ta.value.trim().length === 0;
    });
    cancel.addEventListener('click', function () { self.closeActiveForm(); });
    submit.addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body) return;
      self.postComment(body, parent.id, null).then(function () {
        self.closeActiveForm();
      });
    });
    card.querySelector('.content').appendChild(form);
    this.activeForm = form;
    ta.focus();
  };

  // --- Inline edit form (replaces body) ---
  Widget.prototype.openEditForm = function (c, card) {
    this.closeActiveForm();
    var self = this;
    var ta = el('textarea', { maxlength: MAX_LEN, rows: 3 });
    ta.value = c.body || '';
    var submit = el('button', { type: 'button', class: 'primary' }, 'Save');
    var cancel = el('button', { type: 'button' }, 'Cancel');
    var form = el('div', { class: 'inline-form' }, [
      ta,
      el('div', { class: 'form-actions' }, [cancel, submit])
    ]);
    ta.addEventListener('input', function () {
      submit.disabled = ta.value.trim().length === 0;
    });
    cancel.addEventListener('click', function () { self.closeActiveForm(); });
    submit.addEventListener('click', function () {
      var body = ta.value.trim();
      if (!body || body === c.body) { self.closeActiveForm(); return; }
      self.editComment(c, body).then(function () { self.closeActiveForm(); });
    });
    card.querySelector('.content').appendChild(form);
    this.activeForm = form;
    ta.focus();
  };

  Widget.prototype.closeActiveForm = function () {
    if (this.activeForm && this.activeForm.parentNode) {
      this.activeForm.parentNode.removeChild(this.activeForm);
    }
    this.activeForm = null;
  };

  // ================================================================
  // Mutations (with optimistic UI)
  // ================================================================
  Widget.prototype.postComment = function (body, parentId, lyricLine) {
    var self = this;
    var tempId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    var nowIso = new Date().toISOString();
    var optimistic = {
      id: tempId,
      rateable_type: this.type,
      rateable_id: this.id,
      author_user_id: CURRENT_USER_ID,
      author_name: CURRENT_USER_NAME,
      parent_id: parentId,
      body: body,
      lyric_line: lyricLine != null ? lyricLine : null,
      mentions: extractMentions(body),
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
      _pending: true
    };
    this.optimistic.push(optimistic);
    saveOptimistic(this.type, this.id, this.optimistic);
    this.renderThread();

    return api('POST', this.endpoint(), {
      body: body,
      parent_id: parentId,
      lyric_line: lyricLine != null ? lyricLine : null,
      mentions: optimistic.mentions
    }).then(function (created) {
      // Remove the optimistic stand-in; reload from server.
      self.optimistic = self.optimistic.filter(function (o) { return o.id !== tempId; });
      saveOptimistic(self.type, self.id, self.optimistic);
      if (created && created.id) {
        self.comments.push(created);
        self.renderThread();
      } else {
        self.load();
      }
    }).catch(function () {
      // Leave optimistic entry in place so user's text isn't lost.
      self.renderThread();
    });
  };

  Widget.prototype.editComment = function (c, body) {
    var self = this;
    var prev = c.body;
    var prevUpdated = c.updated_at;
    c.body = body;
    c.updated_at = new Date().toISOString();
    c.mentions = extractMentions(body);
    this.renderThread();
    return api('PATCH', '/api/comments/' + encodeURIComponent(c.id), {
      body: body,
      mentions: c.mentions
    }).catch(function () {
      c.body = prev;
      c.updated_at = prevUpdated;
      self.renderThread();
    });
  };

  Widget.prototype.deleteComment = function (c) {
    var self = this;
    var prev = c.deleted_at;
    c.deleted_at = new Date().toISOString();
    this.renderThread();
    return api('DELETE', '/api/comments/' + encodeURIComponent(c.id)).catch(function () {
      c.deleted_at = prev;
      self.renderThread();
    });
  };

  // ================================================================
  // Auto-init
  // ================================================================
  function initAll(root) {
    var scope = root || document;
    var hosts = scope.querySelectorAll('div[data-comments-target]');
    for (var i = 0; i < hosts.length; i++) {
      var h = hosts[i];
      if (h.__jvCommentsInit) continue;
      h.__jvCommentsInit = true;
      try { new Widget(h); }
      catch (e) {
        h.textContent = '[comments: init error]';
        if (window.console) window.console.error('[jv-comments]', e);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    initAll();
  }

  // Expose for late-injected DOM (admin panels etc).
  window.JVComments = { init: initAll };
})();
