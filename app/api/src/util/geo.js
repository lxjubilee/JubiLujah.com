// Best-effort IP -> "City, Region" (or Country) lookup via ip-api.com (no key).
// Cached in-memory per process; private/loopback IPs resolve to "Local network".
// Always fails soft to "—" so the Active Listeners page never blocks on geo.
const cache = new Map(); // ip -> { loc, ts }
const TTL = 60 * 60 * 1000; // 1h

function normalize(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/i, '').replace(/\/\d+$/, '');
}
function isPrivate(ip) {
  return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd])/i.test(ip);
}

export async function geoLookup(rawIp) {
  const ip = normalize(rawIp);
  if (isPrivate(ip)) return 'Local network';
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.ts < TTL) return hit.loc;
  let loc = '—';
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, { signal: ctrl.signal });
    clearTimeout(timer);
    const d = await res.json();
    if (d && d.status === 'success') {
      loc = d.city && d.regionName ? `${d.city}, ${d.regionName}` : (d.country || '—');
    }
  } catch { /* network/timeout -> keep "—" */ }
  cache.set(ip, { loc, ts: Date.now() });
  return loc;
}
