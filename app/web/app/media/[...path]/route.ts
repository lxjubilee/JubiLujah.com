/**
 * Streams album audio (and any other asset) straight from the angels music
 * tree on disk, so the ~1.2 GB of masters never has to be copied into the app.
 * Supports HTTP Range requests, which the browser's <audio> element uses to
 * seek. The generated catalog stores drive-relative paths; `mediaUrl()` turns
 * them into `/media/...` URLs that land here.
 *
 * Requires the music drive to be mounted at runtime (ANGELS_ROOT, default
 * J:\music\angels) — this is a local-first app.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOT = resolve(process.env.ANGELS_ROOT || 'J:/music/angels');

const TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function contentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TYPES[ext] ?? 'application/octet-stream';
}

export async function GET(
  req: NextRequest,
  ctx: { params: { path: string[] } },
) {
  const { path: segments } = ctx.params;
  // Segments arrive URL-decoded from Next; rebuild the on-disk path.
  const full = resolve(ROOT, segments.join('/'));

  // Traversal guard: the resolved path must stay inside the music root.
  if (full !== ROOT && !full.startsWith(ROOT + sep)) {
    return new Response('Forbidden', { status: 403 });
  }

  let size: number;
  try {
    const s = await stat(full);
    if (!s.isFile()) return new Response('Not found', { status: 404 });
    size = s.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const type = contentType(full);
  const range = req.headers.get('range');
  const rangeMatch = range && /bytes=(\d*)-(\d*)/.exec(range);

  if (rangeMatch) {
    const start = rangeMatch[1] ? Number(rangeMatch[1]) : 0;
    const end = rangeMatch[2] ? Number(rangeMatch[2]) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }
    const stream = Readable.toWeb(createReadStream(full, { start, end })) as unknown as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const stream = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream;
  return new Response(stream, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
