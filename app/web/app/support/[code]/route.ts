import fs from 'node:fs';
import path from 'node:path';
import { getAlbumByCode } from '@/lib/manifest';
import { musicUrl } from '@/lib/cdn';

// ============================================================================
// Album SUPPORT image resolver — the wide 16:9 band behind the album hero.
//
// Deliberately the same shape as /cover/[code], because it has the same problem:
// the picture is produced onto the music drive by the WPF Studio and only
// reaches the CDN later, so a resolver that knew about one of those two places
// would show nothing for everything generated since the last sync.
//
//   1. Prefer the CDN copy and stream those bytes through.
//   2. Otherwise stream from the local J: artwork store (the CDN backing drive).
//
// WHY IT WALKS 1..MAX_DRAFT INSTEAD OF BEING TOLD A NUMBER.
// The Studio writes several numbered drafts per album and choosing between them
// is done by DELETING the ones you do not want, so the album's image is whichever
// survived with the lowest number — 1 normally, 3 if 1 and 2 were rejected.
// Resolving that here rather than baking a number into a url means deleting a
// draft takes effect on the next request, with nothing to regenerate.
//
// The album path comes from the trusted manifest; the code is validated.
// ============================================================================

// The music drive. NOTE the default: the catalogue lives at
// J:\jubileepraise.com\music\<category>\<artist>\… — app/.env carries an older
// `ARTWORK_BASE=J:/music`, which is one level short and resolves to nothing, so
// the default here is the real root rather than a copy of that value.
const ARTWORK_BASE = process.env.ARTWORK_BASE || 'J:/jubileepraise.com/music';

const MAX_DRAFT = 4;

// Per-code memo of what was resolved, so a hero view does not walk the CDN every
// request. Ten minutes, matching /cover/[code] — long enough to be worth having,
// short enough that a newly synced or newly deleted draft appears without a
// restart.
const memo = new Map<string, { draft: number; ts: number }>();
const TTL = 10 * 60 * 1000;

const IMG_HEADERS = (type: string) => ({
  'Content-Type': type,
  // Not `immutable`: unlike a cover, which is fixed per album code, a supporting
  // image can legitimately change when a different draft is kept. An hour is
  // enough to spare the origin and short enough that a swap is not permanent.
  'Cache-Control': 'public, max-age=3600',
});

export async function GET(req: Request, { params }: { params: { code: string } }) {
  const code = (params.code || '').replace(/\.webp$/i, '');
  if (!/^[A-Za-z0-9]+$/.test(code)) return new Response('Bad request', { status: 400 });

  const album = getAlbumByCode(code);
  if (!album || !album.path) return new Response('Not found', { status: 404 });

  const hit = memo.get(code);
  const fresh = hit && Date.now() - hit.ts < TTL;
  const order = fresh && hit!.draft > 0
    ? [hit!.draft, ...Array.from({ length: MAX_DRAFT }, (_, i) => i + 1).filter((n) => n !== hit!.draft)]
    : Array.from({ length: MAX_DRAFT }, (_, i) => i + 1);

  // 1. The CDN.
  for (const n of order) {
    const url = musicUrl(`${album.path}/artwork/${code}-support-${n}.webp`);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok && res.body) {
        memo.set(code, { draft: n, ts: Date.now() });
        return new Response(res.body, { headers: IMG_HEADERS(res.headers.get('content-type') || 'image/webp') });
      }
    } catch { /* try the next draft, then the drive */ }
  }

  // 2. The music drive. This is the half that matters on the studio machine: it
  // makes an image visible the moment the Studio writes it, with no CDN round
  // trip in between. On the VPS there is no J:, so this simply misses.
  for (const n of order) {
    const file = path.join(ARTWORK_BASE, album.path.replace(/^albums\//, ''), 'artwork', `${code}-support-${n}.webp`);
    try {
      const buf = await fs.promises.readFile(file);
      memo.set(code, { draft: n, ts: Date.now() });
      return new Response(new Uint8Array(buf), { headers: IMG_HEADERS('image/webp') });
    } catch { /* next draft */ }
  }

  memo.set(code, { draft: 0, ts: Date.now() });
  return new Response('Not found', { status: 404 });
}
