/* Turbo-style soft navigation — keeps the sticky footer player alive.
 *
 * Why this exists:
 *   The sticky footer player (#jv-player from player.js) lives in the DOM at
 *   document.body level and plays a <audio> element. Without this script,
 *   every internal link click triggers a full page load — which destroys the
 *   audio element and the player DOM. The player gets visually re-rendered
 *   from localStorage state but playback stops.
 *
 * How it works:
 *   Intercepts every internal link click, fetches the destination HTML via
 *   fetch(), parses it, then swaps document.body.innerHTML while
 *   preserving the existing #jv-player element. The audio element is never
 *   detached from its parent, so playback continues seamlessly across nav.
 *
 *   - Updates document.title and pushes browser history with pushState
 *   - Re-executes any inline <script> tags in the new content so per-page
 *     logic (e.g. album.html's album-fetch script) still runs
 *   - Re-runs album-status decoration on the new content
 *   - Falls back to a regular full-page navigation if anything fails
 *
 * Use:  <script src="/web/_assets/turbo-nav.js" defer></script>
 *
 * Opt-out: add `data-no-turbo` to any <a> to force a full-page reload.
 */
(function () {
  'use strict';

  if (window.__jvTurboNav) return; // already initialized this session
  window.__jvTurboNav = true;

  let isNavigating = false;

  function isInternal(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.origin === window.location.origin;
    } catch (e) { return false; }
  }

  function shouldIntercept(a, ev) {
    if (ev.defaultPrevented) return false;
    if (ev.button !== 0) return false;                // only left click
    if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return false;
    if (!a.href) return false;
    if (!isInternal(a.href)) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.hasAttribute('data-no-turbo')) return false;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#')) return false;  // hash anchors
    if (href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    // Skip non-HTML assets
    const path = new URL(a.href).pathname;
    if (/\.(?:pdf|png|jpg|jpeg|gif|svg|webp|ico|woff2?|mp3|m4a|aac|wav|flac|ogg|mp4|zip|json|css|js)$/i.test(path)) return false;
    return true;
  }

  function reexecuteScripts(rootEl) {
    // Replace every <script> in rootEl with a freshly-created one so the
    // browser actually executes it. innerHTML insertion never executes scripts.
    // Snapshot the srcs of every <head> script. Those are the scripts that have
    // actually executed (or are scheduled to via defer/async) on this session.
    // We deliberately do NOT include body scripts here, because the new body's
    // <script src> tags are already in the DOM (innerHTML inserted them) but
    // have NOT executed yet — those are the ones we still need to evaluate.
    const loadedSrcs = new Set(
      Array.from(document.head.querySelectorAll('script[src]'))
           .map(s => s.getAttribute('src'))
           .filter(Boolean)
    );
    const scripts = rootEl.querySelectorAll('script');
    scripts.forEach(s => {
      const ns = document.createElement('script');
      for (let i = 0; i < s.attributes.length; i++) {
        const attr = s.attributes[i];
        ns.setAttribute(attr.name, attr.value);
      }
      if (s.src) {
        const src = s.getAttribute('src') || '';
        const isSingleton = /turbo-nav\.js|player\.js|album-status\.js|top-20\.js/.test(src);
        if (isSingleton) {
          if (loadedSrcs.has(src)) {
            // Already loaded; singleton lives across nav, don't re-run.
            return;
          }
          // First-time encounter — promote into <head> so it actually loads
          // and runs (so window.jvPlayer etc. get defined this session).
          document.head.appendChild(ns);
          loadedSrcs.add(src);
          if (s.parentNode) s.parentNode.removeChild(s);
          return;
        }
        // Other external scripts: replace so they actually load+run.
      } else {
        ns.textContent = s.textContent;
      }
      s.parentNode.replaceChild(ns, s);
    });
  }

  function setActiveNav() {
    // Update .active class on the site nav based on current path
    const path = window.location.pathname;
    document.querySelectorAll('.site-nav a').forEach(a => {
      const ah = a.getAttribute('href');
      if (!ah) return;
      try {
        const target = new URL(ah, window.location.origin).pathname;
        if (target === path || (target === '/index.html' && path === '/')) {
          a.classList.add('active');
        } else {
          a.classList.remove('active');
        }
      } catch (e) { /* ignore */ }
    });
  }

  async function navigate(url, fromPopstate) {
    if (isNavigating) return;
    isNavigating = true;

    try {
      const res = await fetch(url, { credentials: 'same-origin', headers: { 'X-JV-Turbo': '1' } });
      if (!res.ok) {
        // 404 / 5xx — fall back to normal nav so the browser shows the error page
        window.location.href = url;
        return;
      }
      const html = await res.text();
      const newDoc = new DOMParser().parseFromString(html, 'text/html');

      // Update title
      const newTitle = newDoc.title || document.title;
      document.title = newTitle;

      // Update URL (only on click, not on popstate which already changed it)
      if (!fromPopstate) {
        try { history.pushState({ jvTurbo: true, url }, '', url); } catch (e) { /* ignore */ }
      }

      // Preserve the live player element
      const player = document.getElementById('jv-player');
      if (player && player.parentNode === document.body) {
        document.body.removeChild(player);
      }

      // Remove any #jv-player from the incoming HTML (we keep our own)
      const newBody = newDoc.body;
      const incomingPlayer = newBody.querySelector('#jv-player');
      if (incomingPlayer) incomingPlayer.remove();

      // Pull <link> stylesheets from the new <head> that aren't already loaded,
      // so per-page styles (album.html has a big inline+linked style block) apply.
      const existingHrefs = new Set(
        Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
             .map(l => l.getAttribute('href'))
      );
      newDoc.head.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        const href = l.getAttribute('href');
        if (href && !existingHrefs.has(href)) {
          const nl = document.createElement('link');
          nl.rel = 'stylesheet';
          nl.href = href;
          document.head.appendChild(nl);
        }
      });
      // Inline <style> blocks from the incoming page — append (page-scoped styles)
      newDoc.head.querySelectorAll('style').forEach(st => {
        const id = st.id;
        if (id && document.head.querySelector('style#' + CSS.escape(id))) return;
        const cl = document.createElement('style');
        if (st.id) cl.id = st.id;
        cl.textContent = st.textContent;
        document.head.appendChild(cl);
      });
      // Pull in any <script src> tags from the new <head> that aren't already loaded.
      // Without this, a page that lacked (say) /web/_assets/player.js on initial load
      // would never get it — head scripts don't get auto-executed by an innerHTML swap.
      // This is the safety net so navigating from a script-light page to a script-rich
      // one actually picks up the missing scripts.
      const existingScriptSrcs = new Set(
        Array.from(document.head.querySelectorAll('script[src]'))
             .map(s => s.getAttribute('src'))
      );
      newDoc.head.querySelectorAll('script[src]').forEach(s => {
        const src = s.getAttribute('src');
        if (!src || existingScriptSrcs.has(src)) return;
        const ns = document.createElement('script');
        ns.src = src;
        if (s.hasAttribute('defer')) ns.defer = true;
        if (s.hasAttribute('async')) ns.async = true;
        document.head.appendChild(ns);
      });

      // Swap body content (scripts in this innerHTML do NOT execute)
      document.body.innerHTML = newBody.innerHTML;

      // Restore the player and its activation class
      if (player) document.body.appendChild(player);
      document.body.classList.add('jv-player-active');

      // Now manually re-execute scripts that were in the new body
      reexecuteScripts(document.body);

      // Re-run album-status decoration on the new content
      if (window.jvAlbumStatus && typeof window.jvAlbumStatus.decorate === 'function') {
        window.jvAlbumStatus.decorate();
      }
      // Re-populate top-20 sections on the new content
      if (window.jvTop20 && typeof window.jvTop20.populate === 'function') {
        window.jvTop20.populate();
      }

      // Update active nav highlight
      setActiveNav();

      // Scroll to top of new page (history-style)
      window.scrollTo(0, 0);
    } catch (err) {
      console.warn('turbo-nav: error during soft-nav, falling back', err);
      window.location.href = url;
    } finally {
      isNavigating = false;
    }
  }

  // Click delegation: intercept every same-origin link click site-wide
  document.addEventListener('click', function (ev) {
    let a = ev.target;
    while (a && a.nodeName !== 'A') a = a.parentNode;
    if (!a) return;
    if (!shouldIntercept(a, ev)) return;
    ev.preventDefault();
    navigate(a.href, false);
  }, true);

  // Browser back/forward → soft-nav to the target
  window.addEventListener('popstate', function () {
    navigate(window.location.href, true);
  });

  // Initial nav-active highlight
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setActiveNav);
  } else {
    setActiveNav();
  }
})();
