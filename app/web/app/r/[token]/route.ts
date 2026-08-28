import { NextResponse } from 'next/server';
import { renderLanding, type LandingData } from '@/lib/landing';
import { getAppLinks } from '@/lib/appLinks';
import { readResumePos } from '@/lib/resumeCookie';

// Public redirector runtime — software/redirector.md §9.
//
//   GET /r/<TOKEN>  ->  302 to the resolved asset (opaque; never a raw path)
//
// Resolution + scan logging happen server-side in the API (which owns the DB);
// this route is the thin, fast front door: it forwards context, applies the
// mandated redirect headers, and renders branded pages for the non-redirect
// states. No error path here or in the API ever exposes a storage path,
// identifier, or stack trace (§9.4).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = (process.env.REDIRECTOR_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.REDIRECTOR_INTERNAL_KEY || 'dev-redirector-internal-key';

// §9.2 — 302 (never 301), no-store, no-referrer, noindex.
const REDIRECT_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

type Resolution = {
  outcome: 'redirect' | 'landing' | 'retired' | 'suspended' | 'notfound';
  status: number;
  destination?: string;
  token?: string;
  landing?: Omit<LandingData, 'token'>;
};

function page(title: string, message: string, statusNote?: string): string {
  // Mobile-first branded shell. No JS, no external assets, no leaked internals.
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${title} — JubileePraise.com</title><style>
:root{color-scheme:dark}*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#e8e8e8;
background:radial-gradient(ellipse at top,rgba(15,52,96,.4),transparent 60%),linear-gradient(135deg,#0f0f1e,#141422,#0d0d16)}
.card{max-width:440px;width:100%;text-align:center;background:#161622;border:1px solid rgba(255,255,255,.08);
border-radius:16px;padding:40px 28px}
.mark{font-size:22px;font-weight:800;letter-spacing:.5px;margin-bottom:20px}
.mark b{color:#E6AC00}
h1{font-size:22px;font-weight:700;color:#fff;margin-bottom:12px}
p{font-size:15px;line-height:1.6;color:#b7b7b7;margin-bottom:24px}
a.btn{display:inline-block;padding:12px 22px;border-radius:8px;background:#E6AC00;color:#1b1b1b;
font-weight:700;text-decoration:none}
</style></head><body><div class="card">
<div class="mark">JubileePraise<b>.com</b></div>
<h1>${title}</h1><p>${message}</p>
<a class="btn" href="/">Explore the music</a>
</div></body></html>`;
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token || '';
  const fwd = {
    'x-redirector-internal': INTERNAL_KEY,
    'user-agent': req.headers.get('user-agent') || '',
    'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
    referer: req.headers.get('referer') || '',
  };

  // §6.6 — forward the scanner's anonymous resume position (if any) so a resume
  // token resolves to their next unconsumed item.
  const rpos = readResumePos(req.headers.get('cookie'), token);
  const rposQuery = rpos != null ? `?rpos=${encodeURIComponent(String(rpos))}` : '';

  let result: Resolution = { outcome: 'notfound', status: 404 };
  try {
    const r = await fetch(`${API_BASE}/api/redirector/resolve/${encodeURIComponent(token)}${rposQuery}`, {
      headers: fwd,
      cache: 'no-store',
    });
    if (r.ok) result = (await r.json()) as Resolution;
  } catch {
    // API unreachable — degrade to a branded page rather than a raw error.
    result = { outcome: 'notfound', status: 404 };
  }

  if (result.outcome === 'redirect' && result.destination) {
    return new NextResponse(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: result.destination } });
  }

  const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' };

  // §11 — arrival page. The real destination is NOT emitted here; the primary
  // action links to /r/<token>/go, which re-resolves server-side and tracks the
  // action. no-store so DQR landing content and scan analytics stay fresh.
  if (result.outcome === 'landing' && result.landing && result.token) {
    const data: LandingData = { token: result.token, ...result.landing };
    return new NextResponse(renderLanding(data, getAppLinks()), {
      status: 200,
      headers: { ...htmlHeaders, 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }

  if (result.outcome === 'retired') {
    return new NextResponse(
      page('No longer available', 'This item has moved on, but there is plenty more to explore.'),
      { status: 200, headers: htmlHeaders },
    );
  }
  if (result.outcome === 'suspended') {
    return new NextResponse(
      page('Temporarily unavailable', 'This link is paused for a moment. Please check back shortly.'),
      { status: 200, headers: htmlHeaders },
    );
  }
  // notfound / malformed
  return new NextResponse(
    page('Link not found', 'That code did not match anything here. Double-check it, or browse from the home page.'),
    { status: 404, headers: htmlHeaders },
  );
}
