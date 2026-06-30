import { revalidatePath } from 'next/cache';
import { NextRequest } from 'next/server';

// On-demand revalidation. Called server-to-server by the API after an admin
// replaces an album cover, so the statically-rendered catalog pages re-render
// and pick up the new ?v=<version> cover URL (otherwise the old, cached cover
// keeps showing until the next scheduled ISR revalidation). Secret-gated.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  // Revalidate every route under the root layout (all catalog/browse pages).
  revalidatePath('/', 'layout');
  return Response.json({ ok: true, revalidated: true, at: Date.now() });
}
