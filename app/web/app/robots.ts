import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    // /r/ and /rp/ are opaque redirector tokens — never index them (§9.5).
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api', '/r/', '/rp/'] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
