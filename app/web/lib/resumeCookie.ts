// ============================================================================
// Anonymous resume-progress cookie — software/redirector.md §6.6 / §17.3.
//
// A single first-party, HttpOnly cookie `rdr_resume` holds a { token: position }
// map, scoped to the domain with a 2-year expiry. It is owned entirely by the web
// layer and never joined to any other dataset (§17.3). Writes only ever move a
// position FORWARD (never backward, §6.6).
// ============================================================================
const COOKIE = 'rdr_resume';
const TWO_YEARS = 63_072_000; // seconds

function parseMap(cookieHeader: string | null): Record<string, number> {
  if (!cookieHeader) return {};
  const part = cookieHeader.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!part) return {};
  try {
    const obj = JSON.parse(decodeURIComponent(part.slice(COOKIE.length + 1)));
    return obj && typeof obj === 'object' ? (obj as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function readResumePos(cookieHeader: string | null, token: string): number | null {
  const v = parseMap(cookieHeader)[token];
  return typeof v === 'number' ? v : null;
}

// Build a Set-Cookie value advancing `token` to `pos` (forward-only merge).
export function writeResumeCookie(cookieHeader: string | null, token: string, pos: number, secure: boolean): string {
  const map = parseMap(cookieHeader);
  const prev = typeof map[token] === 'number' ? map[token] : Number.NEGATIVE_INFINITY;
  map[token] = Math.max(pos, prev);
  const value = encodeURIComponent(JSON.stringify(map));
  const attrs = [`${COOKIE}=${value}`, 'Path=/', `Max-Age=${TWO_YEARS}`, 'SameSite=Lax', 'HttpOnly'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
