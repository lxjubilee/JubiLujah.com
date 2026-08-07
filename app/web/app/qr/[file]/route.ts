import { NextResponse } from 'next/server';

// Public QR image front door — software/redirector.md §10.
//
//   GET /qr/<TOKEN>.svg | .png   ->  the branded QR image for that token
//
// The image is rendered and cached by the API (which owns the style profile and
// the qr_images metadata). This route is a thin proxy that forwards the format
// and any variant/size, and preserves the immutable cache headers so a printed
// code's image is served from cache effectively forever (§10.1). A QR encodes
// only the public /r/ URL, so nothing here is secret.

export const runtime = 'nodejs';

const API_BASE = (process.env.REDIRECTOR_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');

const QR_FILE_RE = /^[A-Za-z0-9]{12}\.(svg|png)$/;

export async function GET(req: Request, { params }: { params: { file: string } }) {
  const file = params.file || '';
  if (!QR_FILE_RE.test(file)) {
    return new NextResponse(null, { status: 404 });
  }
  const qs = new URL(req.url).search; // forward ?variant=&size=
  try {
    const upstream = await fetch(`${API_BASE}/api/redirector/qr/${encodeURIComponent(file)}${qs}`, {
      cache: 'no-store',
    });
    if (!upstream.ok) return new NextResponse(null, { status: upstream.status });
    const body = Buffer.from(await upstream.arrayBuffer());
    const headers: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Robots-Tag': 'noindex',
    };
    const minPrint = upstream.headers.get('x-qr-min-print');
    if (minPrint) headers['X-QR-Min-Print'] = minPrint;
    return new NextResponse(body, { status: 200, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
