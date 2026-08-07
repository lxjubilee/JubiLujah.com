'use strict';
// ============================================================================
// Device detection + route-map application — software/redirector.md §6.4.
//
// Shared by the live resolver and the failover snapshot resolver (so a single
// code + one album insert can send iPhone -> App Store, Android -> Play, laptop
// -> web player). `default` is mandatory when a route map exists; unknown/
// spoofed agents and bots always get `default` so link previews stay correct.
//
// Phase 1 uses a lightweight UA parse; §6.4 calls for a maintained UA library,
// which should replace this here in a later pass without touching callers.
// ============================================================================
const BOT_RE = /(bot|crawl|spider|slurp|facebookexternalhit|embedly|quora|pinterest|whatsapp|telegram|discord|preview|monitor|curl|wget|headless)/i;

export function deviceClass(userAgent = '') {
  const ua = String(userAgent);
  if (!ua || BOT_RE.test(ua)) return ua ? 'bot' : 'unknown';
  const isTablet = /ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua);
  if (isTablet) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

function routeKey(dc) {
  if (dc === 'mobile') return null; // decided from OS below
  if (dc === 'tablet') return 'tablet';
  if (dc === 'desktop') return 'desktop';
  return 'default';
}
function osKey(userAgent = '') {
  if (/iphone|ipad|ipod|ios/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  return null;
}

// Pick a destination from a route map for this device class. Returns null when
// there is no map. Bots/unknown/spoofed -> default (§6.4).
export function applyDeviceRoutes(map, dc, userAgent) {
  if (!map || typeof map !== 'object') return null;
  if (dc === 'bot' || dc === 'unknown') return map.default ?? null;
  const os = dc === 'mobile' ? osKey(userAgent) : null;
  const key = os || routeKey(dc) || 'default';
  return map[key] ?? map.default ?? null;
}
