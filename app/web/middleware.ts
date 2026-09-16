import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/* ============================================================================
 * Cross-site sign-in, handled before a byte of HTML is sent.
 *
 * One signed-in browser across the Jubilee family: a reader signed in on
 * JubileeInspire (or any of its persona domains) opens jubileepraise.com already
 * signed in, and signing in here lets those sites recognise them in turn. This is
 * JubileeInspire's src/proxy.ts, ported — same hops, same cookies, same rules.
 *
 * The sites are separate ORIGINS; nothing in a browser is shared between them.
 * The one place all of them can consult is the SSO's own origin, reached by a
 * top-level redirect so its cookie stays first-party (Safari's ITP and Firefox's
 * TCP block it the moment it is read from an iframe or a background fetch).
 *
 *   ASK     no session here → 307 to SSO /api/auth/continue, which comes back
 *           with ?t=<ticket> (the browser is signed in to the family) or with
 *           ?sso=none (it is not).
 *   REDEEM  ?t=<ticket> → spent server-side against our API, and the resulting
 *           tokens are handed to the page in a one-shot cookie, because
 *           localStorage — where lib/auth.ts keeps the session — is the one
 *           place a server cannot write.
 *   PLANT   a reader handed over by a sibling site on a link has a session here
 *           but the SSO has never seen this browser → one more hop through
 *           SSO /api/auth/plant, on the way in, so the app boots once.
 *
 * FAILS OPEN, ALWAYS. Every error leaves the reader signed out, which is exactly
 * where they were. This file must never be able to take the site down.
 * ========================================================================== */

// Only the hosts the SSO lets use the silent check (its SSO_AUTO_LOGIN_HOSTS).
// This app also serves jubilujah.com and the children's and Torah Sings tenants;
// sending any of those to /continue would strand the reader on an SSO 400.
const FAMILY_HOSTS = new Set(
  (process.env.NEXT_PUBLIC_FAMILY_SSO_HOSTS || 'jubileepraise.com')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
);
if (process.env.NODE_ENV === 'development') FAMILY_HOSTS.add('localhost');

const SSO_BASE = (process.env.NEXT_PUBLIC_SSO_BASE || 'https://sso.jubileeinspire.com').replace(/\/$/, '');

// The API over loopback. NOT NEXT_PUBLIC_API_BASE: app/web/.env.local pins that
// to :4000 and next build inlines it, while production's API listens on :4030
// (see PUBLISH.md, the redirector note).
const API = (process.env.SSO_BRIDGE_API ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : 'http://127.0.0.1:4030')).replace(/\/$/, '');

// A ticket is 32 random bytes, hex — exactly 64 characters. Anything else in
// `t` is NOT a ticket: song QR links use /album?c=<code>&t=<track number>.
const TICKET_RE = /^[0-9a-f]{64}$/;

const SIGNED_IN_COOKIE = 'ji_signed_in';   // "1" = a session exists on this origin (written by lib/auth.ts)
const BOOTSTRAP_COOKIE = 'ji_bootstrap';   // one-shot: the session, carried to the first paint
const PLANTED_COOKIE = 'ji_planted';       // one-shot: the plant question is settled for this arrival
const SIGNED_IN_TTL = 365 * 24 * 60 * 60;
const CALL_TIMEOUT_MS = 2500;
// 🔴 THE REDEEM GETS ITS OWN, LONGER DEADLINE — and 2.5s was the bug.
// Measured in production 2026-09-16: every genuine arrival from kJubilee's
// "Jubilee Praise App" button was redeemed SUCCESSFULLY by the API (six
// `login_success` writes, 15-16 Sep) — and the reader still landed signed out,
// because this middleware had already given up. One such redeem took 2,992 ms
// against a 2,500 ms abort. The chain is web → API → SSO token (when cold) →
// SSO redeem → user upsert → token issue, across two servers, and it sits right
// at 2.5s. Worse, giving up does not un-spend the ticket: the API finishes the
// sign-in for nobody and a retry can only be `invalid_ticket`.
//
// Waiting longer costs one slow first paint for a reader who deliberately came
// from a sibling site; giving up costs them the whole point of the link.
const REDEEM_TIMEOUT_MS = 10_000;

// Never ask on these. A reload mid-flow would discard a code that has already
// been emailed or a reset half-completed. /signin is NOT here, on purpose: a
// reader bounced to /signin by a stale session is exactly the one a live family
// session should rescue, and the ask fires on arrival, before anything is typed.
const QUIET_PATHS = ['/signup', '/forgot-password', '/reset-password'];

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|lighthouse|headlesschrome/;

type Pending = { name: string; value: string; maxAge: number };

function cookieOpts(host: string, maxAge: number) {
  return {
    httpOnly: false, // read (and cleared) by lib/auth.ts
    secure: host !== 'localhost' && !host.startsWith('127.'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function visitorIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    ''
  );
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}, timeoutMs = CALL_TIMEOUT_MS) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// The page the reader asked for, on the host they typed, minus our markers.
function cleanReturn(request: NextRequest, host: string): URL {
  const scheme = host === 'localhost' || host.startsWith('127.') ? 'http' : 'https';
  const publicHost = request.headers.get('host') || host;
  const u = request.nextUrl;
  const back = new URL(`${scheme}://${publicHost}${u.pathname}${u.search}`);
  if (TICKET_RE.test(back.searchParams.get('t') || '')) back.searchParams.delete('t');
  back.searchParams.delete('sso');
  return back;
}

function withCookies(res: NextResponse, host: string, cookies: Pending[]) {
  if (cookies.length === 0) return res;
  res.headers.set('Cache-Control', 'no-store');
  for (const c of cookies) res.cookies.set(c.name, c.value, cookieOpts(host, c.maxAge));
  return res;
}

export async function middleware(request: NextRequest) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (!FAMILY_HOSTS.has(host.replace(/^www\./, ''))) return NextResponse.next();

  const url = request.nextUrl;
  const rawTicket = url.searchParams.get('t') || '';

  // ── REDEEM ────────────────────────────────────────────────────────────────
  // Never on a speculative request. A ticket is single-use: a browser prefetch
  // or prerender of the arrival URL, or a Next.js router fetch of it, would spend
  // the reader's ticket on a response nobody sees, and the real navigation a
  // moment later could only be refused.
  const speculative =
    /prefetch|prerender/i.test(request.headers.get('sec-purpose') || request.headers.get('purpose') || '') ||
    request.headers.has('next-router-prefetch') ||
    request.headers.get('rsc') === '1';
  if (TICKET_RE.test(rawTicket) && !speculative) {
    // WAS THIS TICKET MINTED BECAUSE WE ASKED, OR BECAUSE THEY CAME?
    //   stamped (sso=asked) — our own silent check; the SSO already knows this
    //                         browser, and they did not ask to join anything.
    //   unstamped           — a sibling site handed them over on a link;
    //                         arriving IS the act of coming here.
    // Only the second may create an account (see api routes/ssoBridge.js).
    const fromOurOwnAsk = url.searchParams.get('sso') === 'asked';
    const pending: Pending[] = [];

    try {
      const ip = visitorIp(request);
      const r = await postJson(
        '/api/auth/sso/redeem-ticket',
        { ticket: rawTicket, provision: !fromOurOwnAsk },
        ip ? { 'x-forwarded-for': ip } : {},
        REDEEM_TIMEOUT_MS,
      );
      const tokens = r.data?.tokens;
      if (r.ok && tokens?.accessToken && tokens?.refreshToken) {
        pending.push({ name: BOOTSTRAP_COOKIE, value: JSON.stringify(tokens), maxAge: 60 });
        // SETTLED EITHER WAY: without this, the app's plantFamily() would
        // location.replace to the SSO for a cookie the browser already has.
        //
        // NAMES THE ACCOUNT, NOT JUST "1". It settles the plant question for the
        // reader THIS ticket signed in, and nobody else. As a bare flag it also
        // answered for a different person who signed in with a password inside
        // its two minutes — that plant was skipped, the SSO cookie kept naming
        // the first account, and signing the second one out signed the browser
        // straight back in as the first (seen in production 2026-09-14).
        const arrivedAs = String(r.data?.user?.id || '');
        if (arrivedAs) pending.push({ name: PLANTED_COOKIE, value: arrivedAs, maxAge: 120 });

        // No plant since 2026-09-15: a JubileePraise sign-in must not teach the
        // SSO cookie this browser, or the persona domains sign in silently.
      } else {
        // Expired, spent, refused, or no account here. The next navigation
        // asks again rather than assuming anything.
        pending.push({ name: SIGNED_IN_COOKIE, value: '0', maxAge: SIGNED_IN_TTL });
      }
    } catch {
      pending.push({ name: SIGNED_IN_COOKIE, value: '0', maxAge: SIGNED_IN_TTL });
    }

    // RENDER HERE rather than redirecting to a clean URL: the ticket is already
    // spent and inert, and lib/familySso.ts strips it with replaceState before
    // anyone could copy it — one navigation fewer on every arrival.
    return withCookies(NextResponse.next(), host, pending);
  }

  // NO SILENT ASK (owner decision 2026-09-15). Signing in here from another
  // family site happens ONLY by following a rail link, which carries a ticket
  // (REDEEM above). The persona domains’ silent sign-in is a separate feature,
  // and the SSO refuses this host on /continue.
  return NextResponse.next();
}

// Static constants only — Next analyses this at build time. Page routes only:
// no API, no Next internals, no files with an extension, and none of the public
// short-link / QR / deep-link routes, which are consumed by scanners and apps.
export const config = {
  matcher: ['/((?!api|_next|r/|R/|rp/|RP/|qr/|well-known|\\.well-known|revalidate|.*\\..*).*)'],
};
