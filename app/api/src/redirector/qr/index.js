'use strict';
// ============================================================================
// QR image orchestration — software/redirector.md §10.1.
//
// Timing rules:
//   - On token creation: render + cache `standard` SVG and a 1024px PNG.
//   - On demand: any other variant/size, cached on first request.
//   - Never regenerate on resolution — QR images are static artifacts of the
//     token string, which never changes.
//
// QR renders are a pure, deterministic function of (token, variant, style), so
// the "cache" is a bounded in-memory map here; the rdr_qr_images rows record
// which variants exist and where a durable copy lives (file_url) if one is
// uploaded to object storage later. Rendering itself is cheap and off the
// resolve hot path, so an in-memory cache is sufficient for Phase 2.
// ============================================================================
import { query } from '../../db.js';
import { logger } from '../../logger.js';
import { renderSvg, renderPng, variantSpec, isVariant, PNG_SIZES } from './render.js';

// ---- bounded in-memory render cache ---------------------------------------
const MAX_CACHE = 500;
const cache = new Map(); // key -> { body, contentType }
function cacheKey(token, variant, format, size, prefix) {
  return `${prefix}:${token}:${variant}:${format}:${format === 'png' ? size : ''}`;
}
function cacheGet(k) {
  const hit = cache.get(k);
  if (hit) { cache.delete(k); cache.set(k, hit); } // LRU bump
  return hit || null;
}
function cachePut(k, val) {
  cache.set(k, val);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
}

/**
 * Get a rendered QR image for a token.
 * @returns {Promise<{ body: string|Buffer, contentType: string, variant: string,
 *   format: 'svg'|'png', pixelSize: number|null }>}
 */
export async function getImage(token, { variant = 'standard', format = 'svg', size = 1024, prefix = 'R' } = {}) {
  const v = isVariant(variant) ? variant : 'standard';
  const fmt = format === 'png' ? 'png' : 'svg';
  const px = fmt === 'png' ? (PNG_SIZES.includes(Number(size)) ? Number(size) : 1024) : null;
  const pfx = prefix === 'RP' ? 'RP' : 'R';

  const key = cacheKey(token, v, fmt, px, pfx);
  const cached = cacheGet(key);
  if (cached) return { ...cached, variant: v, format: fmt, pixelSize: px };

  let body;
  let contentType;
  if (fmt === 'svg') {
    body = renderSvg(token, v, undefined, pfx);
    contentType = 'image/svg+xml; charset=utf-8';
  } else {
    body = await renderPng(token, v, undefined, px, pfx);
    contentType = 'image/png';
  }
  const out = { body, contentType };
  cachePut(key, out);
  return { ...out, variant: v, format: fmt, pixelSize: px };
}

// Record a qr_images metadata row (best-effort; never blocks the caller).
function recordImage(token, { variant, format, pixelSize }) {
  const spec = variantSpec(variant);
  query(
    `INSERT INTO redirector.qr_images (token, variant, style_profile, format, pixel_size, error_correction)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [token, variant, spec.style, format, pixelSize, spec.ecc],
  ).catch(() => {});
}

// §10.1 — called right after a token is issued. Warms the two canonical renders
// and records their metadata. Fire-and-forget: a render/DB hiccup must never
// fail token creation (the images can always be produced on demand).
export function renderOnCreate(token) {
  Promise.resolve()
    .then(async () => {
      await getImage(token, { variant: 'standard', format: 'svg' });
      recordImage(token, { variant: 'standard', format: 'svg', pixelSize: null });
      await getImage(token, { variant: 'standard', format: 'png', size: 1024 });
      recordImage(token, { variant: 'standard', format: 'png', pixelSize: 1024 });
    })
    .catch((err) => logger.warn({ err, token }, 'redirector: QR warm on create failed'));
}
