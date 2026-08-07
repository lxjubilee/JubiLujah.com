import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// Admin-only trigger for regenerating a Backstage card image.
//
// The image itself is produced by the desktop "Article Image Studio" (WPF +
// WebView2), which drives an admin's own logged-in ChatGPT session — NOT an API
// key. This route is only the bridge: it drops a small request file into a queue
// folder that the running Studio watches; the Studio does the generation, saves
// /images/backstage/<slug>.webp, rebuilds backstage.json, and writes back a
// status file that this route's GET reports.
//
//   POST { slug }        -> { queued: true }        (admin only)
//   GET  ?slug=<slug>    -> { status, image?, version?, message? }   (admin only)
//
// Runs on the Node runtime for filesystem access; force-dynamic so it is never
// statically optimized.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000').replace(/\/$/, '');
// process.cwd() is app/web; the queue lives beside the WPF tool at the repo root.
const QUEUE_DIR = path.resolve(process.cwd(), '..', '..', 'tools', 'ArticleImageStudio', 'regen-queue');
const BACKSTAGE_JSON = path.join(process.cwd(), 'public', 'backstage', 'backstage.json');
const HEARTBEAT = path.join(QUEUE_DIR, '.studio-alive');

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,120}$/;
// The Studio beats every ~3s; treat it as offline if the last beat is older.
const STUDIO_STALE_MS = 15000;

/** True when the desktop Studio is running (recent heartbeat file). */
function studioOnline(): boolean {
  try {
    const ts = parseInt(fs.readFileSync(HEARTBEAT, 'utf8').trim(), 10);
    return Number.isFinite(ts) && Date.now() - ts < STUDIO_STALE_MS;
  } catch {
    return false;
  }
}

/** Verify the caller is an admin by forwarding their Bearer token to the API's
 *  /api/auth/me. Returns the roles on success, or null when not an admin. */
async function requireAdmin(request: Request): Promise<string[] | null> {
  const auth = request.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { authorization: auth },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { authenticated?: boolean; roles?: string[] };
    const roles = data.roles || [];
    return data.authenticated && roles.includes('admin') ? roles : null;
  } catch {
    return null;
  }
}

/** True when `slug` names a real Backstage piece (guards the queue against junk). */
function slugExists(slug: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(BACKSTAGE_JSON, 'utf8')) as { pieces?: { slug?: string }[] };
    return (data.pieces || []).some((p) => p.slug === slug);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  if (!slugExists(slug)) return NextResponse.json({ error: 'Unknown backstage piece' }, { status: 404 });

  try {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    // Clear any prior status so the client polls the fresh run, then enqueue.
    const statusFile = path.join(QUEUE_DIR, `${slug}.status.json`);
    if (fs.existsSync(statusFile)) fs.rmSync(statusFile, { force: true });
    fs.writeFileSync(
      path.join(QUEUE_DIR, `${slug}.json`),
      JSON.stringify({ slug, ts: Date.now() }, null, 2),
    );
    return NextResponse.json({ queued: true, studioOnline: studioOnline() });
  } catch (err) {
    return NextResponse.json(
      { error: 'Could not queue request', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!(await requireAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  const slug = new URL(request.url).searchParams.get('slug')?.trim() || '';
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });

  const requestFile = path.join(QUEUE_DIR, `${slug}.json`);
  const statusFile = path.join(QUEUE_DIR, `${slug}.status.json`);

  // A written status file is authoritative (done/error). Otherwise: pending if a
  // request is still queued, else idle (nothing in flight).
  try {
    if (fs.existsSync(statusFile)) {
      const st = JSON.parse(fs.readFileSync(statusFile, 'utf8')) as {
        status?: string;
        image?: string;
        message?: string;
        ts?: number;
      };
      return NextResponse.json({
        status: st.status || 'done',
        image: st.image || `/images/backstage/${slug}.webp`,
        version: st.ts || Date.now(),
        message: st.message || '',
        studioOnline: studioOnline(),
      });
    }
  } catch {
    /* fall through to pending/idle */
  }

  const pending = fs.existsSync(requestFile);
  return NextResponse.json({ status: pending ? 'pending' : 'idle', studioOnline: studioOnline() });
}
