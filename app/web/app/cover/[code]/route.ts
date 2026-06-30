import fs from 'node:fs';
import path from 'node:path';
import { getAlbumByCode } from '@/lib/manifest';

// Album cover resolver.
//   1. Prefer the CDN copy at cdn.jubileeverse.com/music/<path>/artwork/<CODE>.png
//      — when present, stream those bytes through (so the cover is served from the
//      CDN). We proxy rather than redirect because Next's image optimizer rejects
//      cross-origin redirects.
//   2. Otherwise stream the file from the local J: artwork store (the CDN backing
//      drive) — the fallback for albums not yet synced to the CDN.
// The album path comes from the trusted manifest; the code is validated.
const CDN_BASE = (process.env.NEXT_PUBLIC_CDN_BASE || 'https://cdn.jubileeverse.com').replace(/\/$/, '');
const ARTWORK_BASE = process.env.ARTWORK_BASE || 'J:/music';

// Per-album-code memo of CDN availability so we don't hit the CDN on every
// request. Refreshed every 10 minutes so newly-synced covers appear.
const cdnCache = new Map<string, { ok: boolean; ts: number }>();
const TTL = 10 * 60 * 1000;

// Covers are immutable per album code, so cache hard (1 year, immutable) — this
// lets the browser, Cloudflare's edge, AND next/image's optimizer hold the bytes
// instead of re-fetching the multi-hundred-KB PNG from origin on every view.
const IMG_HEADERS = (type: string) => ({ 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' });

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const code = (params.code || '').replace(/\.png$/i, '');
  if (!/^[A-Za-z0-9]+$/.test(code)) return new Response('Bad request', { status: 400 });

  const album = getAlbumByCode(code);
  if (!album || !album.path) return new Response('Not found', { status: 404 });

  // A ?v=<version> (admin-replaced cover) is forwarded to the upstream CDN fetch
  // so we bypass the stale immutable edge copy and pull the fresh R2 object.
  const ver = new URL(_req.url).searchParams.get('v');
  const bust = ver ? `?v=${encodeURIComponent(ver)}` : '';
  // Version-keyed cache entries so a new version isn't masked by a prior result.
  const ck = code + bust;

  // 1. CDN first (skip the network call if we recently learned it's missing).
  const cdnUrl = `${CDN_BASE}/music/${album.path}/artwork/${code}.png${bust}`;
  const cached = cdnCache.get(ck);
  const knownMissing = cached && Date.now() - cached.ts < TTL && !cached.ok;
  if (!knownMissing) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(cdnUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      cdnCache.set(ck, { ok: res.ok, ts: Date.now() });
      if (res.ok && res.body) {
        return new Response(res.body, { headers: IMG_HEADERS(res.headers.get('content-type') || 'image/png') });
      }
    } catch {
      cdnCache.set(ck, { ok: false, ts: Date.now() });
    }
  }

  // 2. Fall back to the local J: artwork store.
  const file = path.join(ARTWORK_BASE, album.path, 'artwork', `${code}.png`);
  try {
    const buf = await fs.promises.readFile(file);
    return new Response(new Uint8Array(buf), { headers: IMG_HEADERS('image/png') });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
