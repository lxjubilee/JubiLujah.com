import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: '*',
      allow: '/',
      disallow: [
        // /r/ and /rp/ are opaque redirector tokens — never index them (§9.5).
        '/admin', '/api', '/r/', '/rp/',
        // Signed-in-only surfaces. They render a sign-in prompt to a crawler,
        // so indexing them spends crawl budget to produce a page that says
        // nothing and ranks for nothing.
        '/account', '/liked', '/moderation', '/backstage/hero-position',
        // Search result pages: infinite URL space (one per query), thin, and
        // duplicative of the catalogue pages they link to. The SearchAction in
        // the WebSite graph still advertises the search box itself.
        '/search',
      ],
    }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Names the canonical origin for crawlers that honour it, and — more
    // usefully — makes the intended host explicit in a file people read.
    host: SITE_URL,
  };
}
