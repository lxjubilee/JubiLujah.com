import { NextResponse } from 'next/server';

// Tracked action redirect for ephemeral persona tokens — software/redirector.md §11.2.
//   GET /rp/<TOKEN>/go?a=<action>  ->  302 to the resolved destination
// Re-resolves server-side (destination never exposed, §9.4) and records
// landing_action. Works without JavaScript.

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
  try {
    const r = await fetch(
      `${API_BASE}/api/redirector/resolve/rp/${encodeURIComponent(token)}?action=${encodeURIComponent(action)}`,
      { headers: fwd, cache: 'no-store' },
    );
    if (r.ok) {
      const result = (await r.json()) as { destination?: string };
      if (result.destination) {
        return new NextResponse(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: result.destination } });
      }
    }
  } catch {
    /* fall through */
  }
  return new NextResponse(null, { status: 302, headers: { ...REDIRECT_HEADERS, Location: `/rp/${encodeURIComponent(token)}` } });
}
