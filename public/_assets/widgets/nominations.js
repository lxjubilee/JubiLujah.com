/* Jubilujah — Trophy Nominations widget
 * Build Spec §11 — Awards & Nominations
 *
 * Auto-init: scans the DOM for <div data-nominations-target="TYPE:ID"></div>
 *   TYPE ∈ {'song', 'album'} (spec §11 — only songs and albums are nominate-able)
 *   ID   = UUID of the rateable object
 *
 * Renders: 🏆 trophy button with a live nomination count badge.
 * Click  : opens a modal that lets editors nominate the object for an open award
 *          category. Requires a 250+ character justification (spec §11).
 * Submit : POST /api/awards/nominations
 *
 * Vanilla JS, zero dependencies, idempotent (safe to re-run on dynamic content).
 */
(function () {
  'use strict';

  var PERIOD_YEAR = new Date().getFullYear();
  var MIN_REASON_LEN = 250;
  var ALLOWED_TYPES = ['song', 'album'];

  /* ------------------------------------------------------------------ utils */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) node.setAttribute(k, '');
        else if (v !== false && v != null) node.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c == null) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      }
    }
    return node;
  }

  function trophySvg() {
    // Inline SVG — sized via CSS (.jv-trophy-btn .icon). 24px viewBox.
    return (
      '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/>' +
      '<path d="M17 4h3v3a3 3 0 0 1-3 3M7 4H4v3a3 3 0 0 0 3 3"/>' +
      '</svg>'
    );
  }

  function parseTarget(raw) {
    if (!raw || typeof raw !== 'string') return null;
    var parts = raw.split(':');
    if (parts.length !== 2) return null;
    var type = parts[0].trim().toLowerCase();
    var id = parts[1].trim();
    if (ALLOWED_TYPES.indexOf(type) === -1) return null;
    if (!id) return null;
    return { type: type, id: id };
  }

  function fetchJson(url, opts) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}))
      .then(function (r) {
        if (!r.ok) {
          return r.text().then(function (txt) {
            var err = new Error('HTTP ' + r.status);
            err.status = r.status;
            err.body = txt;
            throw err;
          });
        }
        return r.json();
      });
  }

  /* ------------------------------------------------------------------ toast */

  function toast(message) {
    var t = el('div', { class: 'jv-toast', role: 'status', 'aria-live': 'polite' }, [message]);
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity 0.35s';
      t.style.opacity = '0';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
    }, 3600);
  }

  /* ------------------------------------------------------------------ modal */

  function openModal(target, onSubmitted) {
    var backdrop = el('div', { class: 'jv-modal-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'jv-nom-title' });
    var modal = el('div', { class: 'jv-modal' });

    var titleRow = el('div', { class: 'jv-modal-titlerow' }, [
      el('h3', { id: 'jv-nom-title', text: 'Nominate for Award' }),
      el('button', { class: 'jv-modal-close', type: 'button', 'aria-label': 'Close', text: '×' })
    ]);

    var subtitle = el('p', {
      class: 'jv-modal-subtitle',
      text: 'Editorial signal — admins select winners. Period: ' + PERIOD_YEAR + '.'
    });

    // Category dropdown
    var catLabel = el('label', { for: 'jv-nom-category', text: 'Award Category' });
    var catSelect = el('select', { id: 'jv-nom-category', name: 'category', required: true }, [
      el('option', { value: '', text: 'Loading categories…' })
    ]);
    catSelect.disabled = true;

    // Period display (filled in after categories load)
    var periodLabel = el('label', { for: 'jv-nom-period', text: 'Period' });
    var periodInput = el('input', {
      id: 'jv-nom-period', type: 'text', readonly: true, value: 'Select a category to see open period'
    });

    // Justification
    var reasonLabel = el('label', { for: 'jv-nom-reason', text: 'Justification (250+ characters)' });
    var reasonArea = el('textarea', {
      id: 'jv-nom-reason', name: 'reason', required: true,
      placeholder: 'Why does this ' + target.type + ' deserve nomination? Be specific — the admin reads every word at year end.',
      minlength: MIN_REASON_LEN
    });

    var counterText = el('span', { class: 'jv-counter-text', text: '0 / ' + MIN_REASON_LEN + ' minimum' });
    var counterHint = el('span', { class: 'jv-counter-hint', text: 'trimmed whitespace counts' });
    var counterRow = el('div', { class: 'jv-counter' }, [counterText, counterHint]);
    var fill = el('div', { class: 'fill' });
    var bar = el('div', { class: 'jv-counter-bar' }, [fill]);

    var cancelBtn = el('button', { class: 'secondary', type: 'button', text: 'Cancel' });
    var submitBtn = el('button', { class: 'primary', type: 'submit', text: 'Submit Nomination' });
    submitBtn.disabled = true;
    var actions = el('div', { class: 'jv-modal-actions' }, [cancelBtn, submitBtn]);

    var form = el('form', { class: 'jv-nom-form', novalidate: true }, [
      catLabel, catSelect,
      periodLabel, periodInput,
      reasonLabel, reasonArea, counterRow, bar,
      actions
    ]);

    modal.appendChild(titleRow);
    modal.appendChild(subtitle);
    modal.appendChild(form);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // ------------- state -------------
    var categories = [];      // filtered to matching rateable_type
    var openPeriodByCat = {}; // category_id -> period object {id, year, closes_at}
    var selectedPeriodId = null;

    function close() {
      document.removeEventListener('keydown', onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    titleRow.querySelector('.jv-modal-close').addEventListener('click', close);
    cancelBtn.addEventListener('click', close);

    // ------------- live counter -------------
    function updateCounter() {
      var len = reasonArea.value.trim().length;
      counterText.textContent = len + ' / ' + MIN_REASON_LEN + ' minimum';
      var pct = Math.min(100, (len / MIN_REASON_LEN) * 100);
      fill.style.width = pct + '%';
      var color;
      if (len >= MIN_REASON_LEN) color = 'var(--success, #5fb371)';
      else if (len >= 200) color = 'var(--accent-gold, #feca57)';
      else color = 'var(--accent, #e94560)';
      fill.style.background = color;
      checkSubmittable();
    }
    function checkSubmittable() {
      var ok = reasonArea.value.trim().length >= MIN_REASON_LEN
        && !!catSelect.value
        && !!selectedPeriodId;
      submitBtn.disabled = !ok;
    }
    reasonArea.addEventListener('input', updateCounter);

    // ------------- load categories + periods -------------
    fetchJson('/api/awards/categories')
      .then(function (cats) {
        // Filter to matching rateable_type (spec §11)
        categories = (cats || []).filter(function (c) {
          return c && c.active !== false && c.rateable_type === target.type;
        });
        catSelect.innerHTML = '';
        if (!categories.length) {
          catSelect.appendChild(el('option', { value: '', text: 'No open categories for ' + target.type + 's' }));
          catSelect.disabled = true;
          return;
        }
        catSelect.appendChild(el('option', { value: '', text: 'Select a category…' }));
        for (var i = 0; i < categories.length; i++) {
          var c = categories[i];
          catSelect.appendChild(el('option', { value: c.id, text: c.name }));
        }
        catSelect.disabled = false;

        // Preload periods for the current year so we can show the open one per cat
        return fetchJson('/api/awards/periods/' + PERIOD_YEAR).then(function (periods) {
          (periods || []).forEach(function (p) {
            if (p && p.status === 'open' && p.category_id) {
              openPeriodByCat[p.category_id] = p;
            }
          });
        });
      })
      .catch(function (err) {
        catSelect.innerHTML = '';
        catSelect.appendChild(el('option', { value: '', text: 'Failed to load categories' }));
        catSelect.disabled = true;
        // eslint-disable-next-line no-console
        console.error('[jv-nominations] categories load failed', err);
      });

    catSelect.addEventListener('change', function () {
      var p = openPeriodByCat[catSelect.value];
      if (p) {
        selectedPeriodId = p.id;
        var closes = p.closes_at ? new Date(p.closes_at).toLocaleDateString() : 'TBD';
        periodInput.value = p.year + ' — closes ' + closes;
      } else if (catSelect.value) {
        selectedPeriodId = null;
        periodInput.value = 'No open period for this category';
      } else {
        selectedPeriodId = null;
        periodInput.value = 'Select a category to see open period';
      }
      checkSubmittable();
    });

    // ------------- submit -------------
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn.disabled) return;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';

      fetchJson('/api/awards/nominations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_id: selectedPeriodId,
          rateable_type: target.type,
          rateable_id: target.id,
          reason: reasonArea.value.trim()
        })
      })
        .then(function () {
          close();
          toast('Nomination submitted — admin will review at year end');
          if (typeof onSubmitted === 'function') onSubmitted();
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Submit Nomination';
          var msg = 'Could not submit nomination';
          if (err && err.status === 409) msg = 'You’ve already nominated this for that category';
          else if (err && err.status === 401) msg = 'Please log in to nominate';
          else if (err && err.status === 422) msg = 'Justification rejected by server (needs 250+ chars)';
          toast(msg);
          // eslint-disable-next-line no-console
          console.error('[jv-nominations] submit failed', err);
        });
    });

    updateCounter();
    // Focus the category select once it's populated, otherwise the textarea
    setTimeout(function () {
      if (!catSelect.disabled) catSelect.focus();
      else reasonArea.focus();
    }, 50);
  }

  /* ------------------------------------------------------------------ widget */

  function buildButton(target, initialCount) {
    var btn = el('button', {
      type: 'button',
      class: 'jv-trophy-btn',
      title: 'Nominate for Award (editorial signal — admin selects winners)',
      'aria-label': 'Nominate this ' + target.type + ' for an award',
      'data-jv-trophy': '1'
    });
    btn.innerHTML = trophySvg();
    var label = el('span', { class: 'label', text: 'Nominate' });
    var count = el('span', { class: 'count', text: initialCount > 0 ? String(initialCount) : '' });
    if (!(initialCount > 0)) count.style.display = 'none';
    btn.appendChild(label);
    btn.appendChild(count);
    return { button: btn, countEl: count };
  }

  function initOne(host) {
    if (host.getAttribute('data-jv-nominations-ready') === '1') return;
    var target = parseTarget(host.getAttribute('data-nominations-target'));
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn('[jv-nominations] invalid data-nominations-target (must be "song:UUID" or "album:UUID"):', host);
      return;
    }
    host.setAttribute('data-jv-nominations-ready', '1');
    host.innerHTML = '';

    var built = buildButton(target, 0);
    host.appendChild(built.button);

    function refreshCount() {
      var url = '/api/awards/nominations?period=' + encodeURIComponent(PERIOD_YEAR)
        + '&type=' + encodeURIComponent(target.type)
        + '&id=' + encodeURIComponent(target.id);
      fetchJson(url)
        .then(function (data) {
          var n = 0;
          if (typeof data === 'number') n = data;
          else if (data && typeof data.count === 'number') n = data.count;
          else if (Array.isArray(data)) n = data.length;
          else if (data && Array.isArray(data.nominations)) n = data.nominations.length;
          if (n > 0) {
            built.countEl.textContent = String(n);
            built.countEl.style.display = '';
          } else {
            built.countEl.textContent = '';
            built.countEl.style.display = 'none';
          }
        })
        .catch(function (err) {
          // Silent — count badge is a nice-to-have, not load-bearing
          // eslint-disable-next-line no-console
          console.debug('[jv-nominations] count fetch failed', err);
        });
    }

    built.button.addEventListener('click', function () {
      openModal(target, refreshCount);
    });

    refreshCount();
  }

  function initAll(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-nominations-target]');
    for (var i = 0; i < nodes.length; i++) initOne(nodes[i]);
  }

  // Public hook for dynamically-injected content
  window.JVNominations = { init: initAll, initOne: initOne };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    initAll();
  }
})();
