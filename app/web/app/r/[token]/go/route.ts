import { NextResponse } from 'next/server';
import { readResumePos, writeResumeCookie } from '@/lib/resumeCookie';

// Tracked primary-action redirect — software/redirector.md §11.2.
//
//   GET /r/<TOKEN>/go?a=<action>  ->  302 to the resolved destination
//
// The landing page's primary/secondary actions link here rather than to the raw
// asset URL: this route re-resolves the token server-side (so the destination is
// never exposed in the page HTML, §9.4), records `landing_action` for the scan
// event via the resolve endpoint's ?action= param, then issues the redirect.
// Works with JavaScript disabled — it is a plain link target.

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

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const token = params.token || '';
  const url = new URL(req.url);
  const action = (url.searchParams.get('a') || 'primary').slice(0, 32);

  const fwd = {
    'x-redirector-internal': INTERNAL_KEY,
    'user-agent': req.headers.get('user-agent') || '',
    'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
  };

  // §6.6 — consuming an item advances resume progress. Forward the scanner's
  // current cookie position and mark this as a consume (radv=1).
  const cookieHeader = req.headers.get('cookie');
  const rpos = readResumePos(cookieHeader, token);
  const q = new URLSearchParams({ action, radv: '1' });
  if (rpos != null) q.set('rpos', String(rpos));

  try {
    const r = await fetch(
      `${API_BASE}/api/redirector/resolve/${encodeURIComponent(token)}?${q.toString()}`,
      { headers: fwd, cache: 'no-store' },
    );
    if (r.ok) {
      const result = (await r.json()) as { destination?: string; resumeNewPos?: number; token?: string };
      if (result.destination) {
        const headers: Record<string, string> = { ...REDIRECT_HEADERS, Location: result.destination };
        if (typeof result.resumeNewPos === 'number') {
          const secure = url.protocol === 'https:';
          headers['Set-Cookie'] = writeResumeCookie(cookieHeader, (result.token || token), result.resumeNewPos, secure);
        }
        return new NextResponse(null, { status: 302, headers });
      }
    }
  } catch {
    /* fall through */
  }
  // Could not resolve a destination — send the visitor back to the arrival page.
  return new NextResponse(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: `/r/${encodeURIComponent(token)}` } });
}
