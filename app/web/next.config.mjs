/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Build output dir. Defaults to `.next` (unchanged); override with NEXT_DIST_DIR
  // to build somewhere else — e.g. a local disk when the repo sits on a network
  // share and `.next` is unwritable.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    // Serve cover art DIRECTLY from the CDN (Cloudflare-cached), bypassing the
    // Next.js image optimizer. The optimizer's on-the-fly PNG→AVIF encoding is
    // CPU-bound and slow on this box: on a cache MISS it can hang >30s, and every
    // rebuild wipes `.next/cache`, so after each deploy a burst of un-cached covers
    // times out and renders broken. The CDN PNGs are already size-optimized
    // (~163MB total) and edge-cached, so direct serving is fast AND reliable.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'cd.jubilujah.com' },
      { protocol: 'https', hostname: 'cdn.jubileeverse.com' },
    ],
  },
  async rewrites() {
    // Proxy /api/* to the Node backend in dev so the browser stays same-origin
    // (cookies + CSRF work without cross-site config). In production the API is
    // typically served under the same domain via the platform's routing.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
    return [
      // Mobile deep-link association files at their canonical .well-known paths.
      // Served by clean app routes (dot-folders are unreliable in the app router).
      { source: '/.well-known/apple-app-site-association', destination: '/well-known/aasa' },
      { source: '/.well-known/assetlinks.json', destination: '/well-known/assetlinks' },
      // QR payloads encode an UPPERCASE path prefix (HTTPS://…/R/<token>), but the
      // routes are lowercase and case-sensitive. Map /R/ → /r/ and /RP/ → /rp/,
      // preserving the case-sensitive token, so scanned codes resolve (not a 404).
      { source: '/R/:path*', destination: '/r/:path*' },
      { source: '/RP/:path*', destination: '/rp/:path*' },
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
