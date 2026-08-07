import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// Admin-only: save the hero-image vertical framing for a Backstage article.
//
//   POST { slug, y }  ->  { ok: true, y }        (y = object-position Y %, 0..100)
//
// Lives at /backstage/hero-position (NOT under /api) on purpose: in production
// nginx routes every /api/* request to the Express backend, so a Next route
// handler under /api/backstage/* is unreachable there. /backstage/* is served
// by Next (same as /backstage/img/*), so the save endpoint works on prod too.
// The static "hero-position" segment takes precedence over the [slug] page.
//
// Persisted to public/backstage/hero-positions.json (slug -> y). lib/backstage
// reads it into piece.heroY, and the pages are force-dynamic, so a saved value
// shows for everyone on the next request. Admin is verified by forwarding the
// caller's Bearer token to the API's /api/auth/me (same as the regenerate route).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
const POS_FILE = path.join(process.cwd(), 'public', 'backstage', 'hero-positions.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;

async function isAdmin(request: Request): Promise<boolean> {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: { authorization: auth }, cache: 'no-store' });
    if (!res.ok) return false;
    const data = (await res.json()) as { authenticated?: boolean; roles?: string[] };
    return !!data.authenticated && (data.roles || []).includes('admin');
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { slug?: unknown; y?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const y = Number(body.y);
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  if (!Number.isFinite(y) || y < 0 || y > 100) return NextResponse.json({ error: 'Invalid position' }, { status: 400 });

  try {
    let map: Record<string, number> = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(POS_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') map = parsed;
    } catch {
      /* no file yet */
    }
    map[slug] = Math.round(y * 10) / 10; // keep one decimal
    fs.mkdirSync(path.dirname(POS_FILE), { recursive: true });
    fs.writeFileSync(POS_FILE, JSON.stringify(map, null, 2));
    return NextResponse.json({ ok: true, y: map[slug] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not save', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
