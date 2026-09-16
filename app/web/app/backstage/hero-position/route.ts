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

//
// ALBUM HEROES TOO (owner, 2026-09-16: red up/down arrows on every hero, "like
// kJubilee"). POST { key: "hero-<album code, lowercase>", y } frames an album's
// hero picture, on the home carousel and the album page alike, and is stored in
// content/hero-positions.json. GET returns that map for every visitor.
//
// 🔴 content/hero-positions.json IS WRITTEN BY THE LIVE SITE, SO A RELEASE MUST
// NEVER SHIP IT. The release tarball carries content/playlists and
// content/staff-picks.json by name (PUBLISH.md Step 2b), not the whole folder;
// keep it that way, or every deploy resets what the admins lined up.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 🔴 NOT NEXT_PUBLIC_API_BASE FIRST. That one is inlined at BUILD time, from the
// workstation's env (http://localhost:4000), so on production every admin check
// went to a port nothing listens on and every save was refused with a 403: the
// red arrows moved the picture for the admin and saved it for nobody (found
// 2026-09-16). REDIRECTOR_API_BASE is read at runtime from prod's own .env
// (http://127.0.0.1:4030), which is why the QR routes beside this one work.
const API_BASE = (process.env.REDIRECTOR_API_BASE || process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
const POS_FILE = path.join(process.cwd(), 'public', 'backstage', 'hero-positions.json');
const HERO_FILE = path.join(process.cwd(), 'content', 'hero-positions.json');
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
const HERO_KEY_RE = /^hero-[a-z0-9]{4,20}$/;

function readMap(file: string): Record<string, number> {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json(readMap(HERO_FILE), { headers: { 'cache-control': 'no-store' } });
}

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

  let body: { slug?: unknown; key?: unknown; y?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const heroKey = typeof body.key === 'string' ? body.key.trim() : '';
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const y = Number(body.y);
  if (heroKey ? !HERO_KEY_RE.test(heroKey) : !SLUG_RE.test(slug)) {
    return NextResponse.json({ error: heroKey ? 'Invalid key' : 'Invalid slug' }, { status: 400 });
  }
  if (!Number.isFinite(y) || y < 0 || y > 100) return NextResponse.json({ error: 'Invalid position' }, { status: 400 });

  try {
    const file = heroKey ? HERO_FILE : POS_FILE;
    const id = heroKey || slug;
    const map = readMap(file);
    map[id] = Math.round(y * 10) / 10; // keep one decimal
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(map, null, 2));
    return NextResponse.json({ ok: true, y: map[id] });
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not save', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
