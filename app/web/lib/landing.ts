// ============================================================================
// Landing page template — software/redirector.md §11. JubileePraise-themed.
//
// Server-rendered HTML string (no client framework, inline critical CSS) so the
// arrival page renders in well under a second on 4G (§11.2 / §20.2). The PRIMARY
// action is a plain <a> to /r/<token>/go and works with JavaScript disabled; the
// go route re-resolves server-side and tracks landing_action, so the real
// destination never appears in this HTML (§9.4). Every page is noindex (§11.2).
//
// Self-contained (type-only import) so it is trivially unit-testable and cannot
// pull a heavy dependency into the render path.
// ============================================================================
import type { AppLinks } from './appLinks';

export interface LandingRelated { title: string; kind: string; cover_image_url: string | null; short_url: string | null; }
export interface LandingData {
  token: string;
  pathPrefix?: 'r' | 'rp'; // 'r' canonical (default), 'rp' ephemeral persona token
  hero: { title: string; content_kind: string; summary: string | null; cover_image_url: string | null };
  primary: { verb: string };
  deepLink?: { code: string; t: string | null } | null; // app target: album code (+ track)
  context_path: string | null;
  related: LandingRelated[];
  persona: { name: string; reason: string } | null;
  resume: { position: number; label?: string; count?: number } | null;
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderLanding(d: LandingData, appLinks?: AppLinks): string {
  const pfx = d.pathPrefix === 'rp' ? 'rp' : 'r';
  const base = `/${pfx}/${encodeURIComponent(d.token)}/go`;
  const goUrl = `${base}?a=primary`;
  const hero = d.hero;

  // §6.4/§11 — the app-vs-web gate. On mobile the OS opens the installed app
  // directly (Universal/App Links); this page is the fallback shown when the app
  // is NOT installed, or a scanner opened it in-browser. It offers an explicit
  // choice — open in app (deep-link attempt → store) vs continue on the web —
  // revealed only on mobile by the inline script (desktop never sees it).
  const appCfg = appLinks ? {
    token: d.token, pfx,
    scheme: appLinks.scheme,
    album: d.deepLink || null,   // { code, t } → deep-link to the album (+ track), not the opaque token
    ios: { store: appLinks.ios.appStoreUrl },
    android: { store: appLinks.android.playStoreUrl, pkg: appLinks.android.packageName },
  } : null;
  const appGate = appCfg ? `<div class="appgate" id="appgate" hidden>
  <div class="ag-t">Get the JubileePraise app</div>
  <div class="ag-row">
    <a class="ag-btn ag-open" id="agDownload" href="#">Download the App</a>
    <a class="ag-btn ag-web" href="${goUrl}">Continue on web</a>
  </div>
</div>` : '';
  // Mobile: AUTO-OPEN the installed app on load (no tap), deep-linking straight to
  // the album (jubileepraise://album?c=<code>[&t=<n>]). Android uses intent:// whose
  // browser_fallback_url returns here with ?noapp=1 when the app ISN'T installed —
  // then we just show the "Download the App / Continue on web" choice (no re-fire,
  // no loop). iOS fires the custom scheme. The web "primary" + "related" are hidden
  // on phones. Desktop: script returns early, primary/related stay, gate hidden.
  // NOTE: for a flawless auto-open (no page flash, no iOS error when not installed)
  // the app must register App Links / Universal Links for these URLs — the .well-
  // known files are already served; this JS is the interim best-effort.
  const appScript = appCfg ? `<script>window.__JAPP=${JSON.stringify(appCfg)};(function(){var C=window.__JAPP;var ua=navigator.userAgent||'';var iOS=/iP(hone|ad|od)/.test(ua);var A=/Android/.test(ua);if(!iOS&&!A)return;var g=document.getElementById('appgate');if(g)g.hidden=false;var pr=document.getElementById('lp-primary');if(pr)pr.style.display='none';var rl=document.getElementById('lp-related');if(rl)rl.style.display='none';var store=iOS?C.ios.store:C.android.store;var dp=C.album?('album?c='+encodeURIComponent(C.album.code)+(C.album.t?('&t='+encodeURIComponent(C.album.t)):'')):(C.pfx+'/'+C.token);function openApp(fb){if(A){location.href='intent://'+dp+'#Intent;scheme='+C.scheme+';package='+C.android.pkg+';S.browser_fallback_url='+encodeURIComponent(fb)+';end';return;}var t=Date.now();var to=setTimeout(function(){if(!document.hidden&&Date.now()-t<1600){location.href=fb;}},1200);document.addEventListener('visibilitychange',function(){if(document.hidden){clearTimeout(to);}});location.href=C.scheme+'://'+dp;}var dl=document.getElementById('agDownload');if(dl){dl.href=store;dl.addEventListener('click',function(e){e.preventDefault();openApp(store);});}if(new URLSearchParams(location.search).get('noapp')==='1')return;setTimeout(function(){openApp(location.origin+location.pathname+'?noapp=1');},60);})();</script>` : '';
  const cover = hero.cover_image_url
    ? `<img class="cover" src="${esc(hero.cover_image_url)}" alt="" width="160" height="160">`
    : `<div class="cover cover--placeholder" aria-hidden="true">♪</div>`;

  const persona = d.persona
    ? `<div class="persona"><span class="persona-name">${esc(d.persona.name)}</span>: ${esc(d.persona.reason)}</div>`
    : '';

  const resume = d.resume
    ? `<div class="resume"><span>Resuming ${esc(d.resume.label || `item ${d.resume.position}`)}</span>
         <a class="link" href="${base}?a=start_over">Start over</a></div>`
    : '';

  const related = d.related.length
    ? `<section class="related" id="lp-related"><h2>More like this</h2><div class="grid">${d.related.map((r) => `
        <a class="card" href="${esc(r.short_url || '#')}">
          ${r.cover_image_url ? `<img loading="lazy" src="${esc(r.cover_image_url)}" alt="" width="72" height="72">` : `<div class="thumb" aria-hidden="true">♪</div>`}
          <span class="card-title">${esc(r.title)}</span>
          <span class="card-kind">${esc(r.kind)}</span>
        </a>`).join('')}</div></section>`
    : '';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${esc(hero.title)} | JubileePraise.com</title><style>
:root{color-scheme:dark;--brand-accent:#3DA5FF}*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#e8e8e8;
background:radial-gradient(ellipse at top,rgba(15,52,96,.4),transparent 60%),linear-gradient(135deg,#0f0f1e,#141422,#0d0d16);
padding:24px 16px}
.wrap{max-width:520px;margin:0 auto}
.brand{font-size:15px;font-weight:800;letter-spacing:.5px;color:#cfcfcf;margin-bottom:16px}
.brand b{color:var(--brand-accent)}
.crumb{font-size:12px;color:#8f8f9f;margin-bottom:10px}
.hero{display:flex;gap:16px;align-items:center;margin-bottom:8px}
.cover{border-radius:12px;object-fit:cover;background:#1c1c2b;flex:0 0 auto}
.cover--placeholder{width:160px;height:160px;display:flex;align-items:center;justify-content:center;font-size:56px;color:var(--brand-accent)}
.kind{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--brand-accent);margin-bottom:6px}
h1{font-size:22px;font-weight:800;color:#fff;line-height:1.2}
.summary{font-size:14px;line-height:1.6;color:#b7b7b7;margin:12px 0 20px}
.primary{display:block;text-align:center;padding:16px;border-radius:12px;background:var(--brand-accent);color:#1b1b1b;
font-weight:800;font-size:17px;text-decoration:none;margin-bottom:12px}
.secondary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px}
.secondary button,.secondary a{flex:1;min-width:120px;text-align:center;padding:12px;border-radius:10px;
background:transparent;border:1px solid rgba(255,255,255,.14);color:#e8e8e8;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer}
.persona{font-size:13px;color:#d7c9a0;background:color-mix(in srgb, var(--brand-accent) 8%, transparent);border:1px solid color-mix(in srgb, var(--brand-accent) 25%, transparent);
border-radius:10px;padding:10px 12px;margin-bottom:16px}.persona-name{font-weight:800;color:var(--brand-accent)}
.resume{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#b7b7b7;
background:#161622;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;margin-bottom:16px}
.link{color:var(--brand-accent);text-decoration:none;font-weight:700}
.related h2{font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#8f8f9f;margin-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
.card{display:flex;flex-direction:column;gap:4px;text-decoration:none;color:#e8e8e8}
.card img,.thumb{width:100%;aspect-ratio:1;border-radius:10px;object-fit:cover;background:#1c1c2b}
.thumb{display:flex;align-items:center;justify-content:center;font-size:28px;color:var(--brand-accent)}
.card-title{font-size:12px;font-weight:600;line-height:1.3}.card-kind{font-size:10px;color:#8f8f9f;text-transform:uppercase}
.appgate{background:linear-gradient(135deg,color-mix(in srgb, var(--brand-accent) 14%, transparent),rgba(15,52,96,.16));border:1px solid color-mix(in srgb, var(--brand-accent) 30%, transparent);border-radius:12px;padding:14px;margin-bottom:16px}
.ag-t{font-size:12px;font-weight:800;color:var(--brand-accent);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px}
.ag-row{display:flex;gap:10px}
.ag-btn{flex:1;text-align:center;padding:12px;border-radius:10px;font-weight:800;font-size:14px;text-decoration:none;cursor:pointer;border:1px solid transparent}
.ag-open{background:var(--brand-accent);color:#1b1b1b}
.ag-web{background:transparent;border-color:rgba(255,255,255,.18);color:#e8e8e8}
.ag-get{display:block;margin-top:10px;font-size:12px;color:#cbb98a;text-decoration:none;text-align:center}
</style></head><body><div class="wrap">
<div class="brand">JubileePraise<b>.com</b></div>
${appGate}
${d.context_path ? `<div class="crumb">${esc(d.context_path)}</div>` : ''}
${persona}
<div class="hero">${cover}<div><span class="kind">${esc(hero.content_kind)}</span><h1>${esc(hero.title)}</h1></div></div>
${hero.summary ? `<p class="summary">${esc(hero.summary)}</p>` : '<div style="height:16px"></div>'}
<a class="primary" id="lp-primary" href="${goUrl}">${esc(d.primary.verb)}</a>
<div class="secondary">
  <button type="button" onclick="if(navigator.share){navigator.share({title:document.title,url:location.href})}else if(navigator.clipboard){navigator.clipboard.writeText(location.href);this.textContent='Link copied'}">Share</button>
</div>
${resume}
${related}
</div>${appScript}</body></html>`;
}
