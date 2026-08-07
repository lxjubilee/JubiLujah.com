// ============================================================================
// Central CDN configuration.
//
// The site's media (audio tracks + album artwork) is served from the Cloudflare
// CDN. On the current bucket (cd.jubilujah.com) media is stored WITHOUT the
// leading `albums/` path segment that the catalog manifest carries — e.g. the
// manifest url `albums/inspire/.../track.mp3` is served at
// `<CDN>/music/inspire/.../track.mp3`. `musicUrl()` normalizes that, so the
// bundled manifest (which keeps `albums/` for the local disk fallback) and the
// CDN layout stay consistent through a single place.
//
// Override the host at build time with NEXT_PUBLIC_CDN_BASE. NEXT_PUBLIC_ vars
// are inlined into both server and client bundles, so importing CDN_BASE from
// here works in Server Components and 'use client' components alike.
// ============================================================================
export const CDN_BASE = (process.env.NEXT_PUBLIC_CDN_BASE || 'https://cd.jubilujah.com').replace(/\/$/, '');

/** Absolute CDN url for a music asset. `subpath` is a manifest-relative path
 *  such as `albums/inspire/.../track.mp3` or `albums/<path>/artwork/CODE.png`.
 *  The CDN bucket omits the `albums/` prefix, so it is stripped here. */
export function musicUrl(subpath: string): string {
  const clean = String(subpath).replace(/^\/+/, '').replace(/^albums\//, '');
  return `${CDN_BASE}/music/${clean}`;
}
