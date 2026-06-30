/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Serve cover art DIRECTLY from the CDN (Cloudflare-cached), bypassing the
    // Next.js image optimizer. The optimizer's on-the-fly PNG→AVIF encoding is
    // CPU-bound and slow on this box: on a cache MISS it can hang >30s, and every
    // rebuild wipes `.next/cache`, so after each deploy a burst of un-cached covers
    // times out and renders broken. The CDN PNGs are already size-optimized
    // (~163MB total) and edge-cached, so direct serving is fast AND reliable.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.jubileeverse.com' },
    ],
  },
  async rewrites() {
    // Proxy /api/* to the Node backend in dev so the browser stays same-origin
    // (cookies + CSRF work without cross-site config). In production the API is
    // typically served under the same domain via the platform's routing.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${apiBase}/api/:path*` }];
  },
};

export default nextConfig;
