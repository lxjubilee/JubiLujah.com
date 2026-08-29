import { NextResponse } from 'next/server';
import { renderLanding, type LandingData } from '@/lib/landing';

// Ephemeral persona-token front door — software/redirector.md §6.7 / §15.2.
//
//   GET /rp/<TOKEN>  ->  a persona-framed arrival page (name + reason), or a 302
//
// Resolution happens server-side in the API (which owns the ephemeral table and
// enforces the 30-day expiry -> permanent-token fallback). This route renders the
// landing (with the persona note) or redirects. noindex; the real destination
// never appears in the HTML — the primary action links to /rp/<token>/go (§9.4).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = (process.env.REDIRECTOR_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
const INTERNAL_KEY = process.env.REDIRECTOR_INTERNAL_KEY || 'dev-redirector-internal-key';

const REDIRECT_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
};

type Resolution = {
  outcome: 'redirect' | 'landing' | 'notfound';
  status: number;
  destination?: string;
  token?: string;
  landing?: Omit<LandingData, 'token' | 'pathPrefix'>;
};

function notFoundPage(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>Link not found — JubileePraise.com</title><style>
:root{color-scheme:dark;--brand-accent:#3DA5FF}*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#e8e8e8;
background:radial-gradient(ellipse at top,rgba(15,52,96,.4),transparent 60%),linear-gradient(135deg,#0f0f1e,#141422,#0d0d16)}
.card{max-width:440px;text-align:center;background:#161622;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:40px 28px}
.mark{font-size:22px;font-weight:800;margin-bottom:20px}.mark b{color:var(--brand-accent)}
h1{font-size:22px;color:#fff;margin-bottom:12px}p{color:#b7b7b7;margin-bottom:24px;line-height:1.6}
a.btn{display:inline-block;padding:12px 22px;border-radius:8px;background:var(--brand-accent);color:#1b1b1b;font-weight:700;text-decoration:none}
</style></head><body><div class="card"><div class="mark">JubileePraise<b>.com</b></div>
<h1>Link not found</h1><p>This recommendation link is not valid. Browse from the home page instead.</p>
<a class="btn" href="/">Explore the music</a></div></body></html>`;
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token || '';
  const fwd = {
    'x-redirector-internal': INTERNAL_KEY,
    'user-agent': req.headers.get('user-agent') || '',
    'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
    referer: req.headers.get('referer') || '',
  };

  let result: Resolution = { outcome: 'notfound', status: 404 };
  try {
    const r = await fetch(`${API_BASE}/api/redirector/resolve/rp/${encodeURIComponent(token)}`, { headers: fwd, cache: 'no-store' });
    if (r.ok) result = (await r.json()) as Resolution;
  } catch {
    result = { outcome: 'notfound', status: 404 };
  }

  if (result.outcome === 'redirect' && result.destination) {
    return new NextResponse(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: result.destination } });
  }

  if (result.outcome === 'landing' && result.landing && result.token) {
    const data: LandingData = { token: result.token, pathPrefix: 'rp', ...result.landing };
    return new NextResponse(renderLanding(data), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    });
  }

  return new NextResponse(notFoundPage(), {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
