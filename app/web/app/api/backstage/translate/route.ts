import { NextResponse } from 'next/server';

// Server-side article translation for the Backstage "Translate Article" widget.
//
// POST { target: string, segments: string[] } -> { translations: string[] }
//
// The provider is deliberately isolated in `translateSegment()`. Today it uses
// Google's free (unofficial) translate endpoint, which needs no key and works
// out of the box — good enough to ship the feature. Swap that one function for
// an official Translation API / DeepL / an LLM call (as JubileeVerse does) when
// a key is available; nothing else here changes.
//
// Runs on the Node runtime so it can make outbound requests the browser's CORS
// policy would block, and so the provider/key never reaches the client.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Our language codes → the code the translate endpoint expects.
const PROVIDER_LANG: Record<string, string> = {
  'pt-BR': 'pt',
  'pt-PT': 'pt',
  zh: 'zh-CN',
  yue: 'zh-TW',
  he: 'iw',
};

const MAX_CHUNK = 1400; // keep each request's query well under URL limits

/** Split a long segment on sentence boundaries so no single request is oversized. */
function chunk(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+\s*|\S[^.!?]*$/g) || [text];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && (buf + s).length > MAX_CHUNK) {
      out.push(buf);
      buf = '';
    }
    buf += s;
    while (buf.length > MAX_CHUNK) {
      out.push(buf.slice(0, MAX_CHUNK));
      buf = buf.slice(MAX_CHUNK);
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** Translate one piece of text. THE ONE PLACE to swap the provider. */
async function translatePiece(text: string, target: string): Promise<string> {
  const tl = PROVIDER_LANG[target] || target;
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&dt=t' +
    `&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  const data = (await res.json()) as [Array<[string]>, ...unknown[]];
  // data[0] is an array of [translatedChunk, originalChunk, …]; join the parts.
  return data[0].map((seg) => seg[0]).join('');
}

/** Translate a full segment (chunking long ones, then rejoining). */
async function translateSegment(text: string, target: string): Promise<string> {
  if (!text.trim()) return text;
  const parts = chunk(text);
  const done = await Promise.all(parts.map((p) => translatePiece(p, target)));
  return done.join('');
}

/** Run tasks with a small concurrency cap so we don't hammer the provider. */
async function pooled<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: Request) {
  let body: { target?: string; segments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  const segments = Array.isArray(body.segments) ? body.segments.map((s) => String(s ?? '')) : [];
  if (!target || segments.length === 0) {
    return NextResponse.json({ error: 'target and segments are required' }, { status: 400 });
  }
  if (target === 'en') {
    // No-op: English is the source.
    return NextResponse.json({ translations: segments });
  }

  try {
    const translations = await pooled(segments, 6, (s) => translateSegment(s, target));
    return NextResponse.json({ translations });
  } catch (err) {
    return NextResponse.json(
      { error: 'Translation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
