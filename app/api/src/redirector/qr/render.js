'use strict';
// ============================================================================
// QR rendering — software/redirector.md §10.
//
// SVG is the primary, print-ready format (§10.3): vector, infinitely scalable,
// branded (rounded modules, concentric finder "eyes", optional center mark).
// PNG is provided at 512/1024/2048 for raster contexts. The encoded payload is
// always the canonical uppercase URL (§10.4); QR images are a pure function of
// (token, variant, style) and never change once the token exists (§10.1), so
// rendering is deterministic and safely cacheable.
//
// Variants (§10.2) map to error-correction level + whether a center logo is
// present. ECC H is mandatory whenever a logo overlays the center, and the
// overlay never exceeds 25% of the code width.
// ============================================================================
import QRCode from 'qrcode';
import { tokenPayload } from './payload.js';
import { getStyle, assertScannable, hexToRgb } from './style.js';

export const QUIET_ZONE = 4;   // modules, minimum, all sides (§10.3). This is the
                               // MANDATORY QR quiet zone — do not reduce it: phone
                               // cameras rely on it to lock onto the code, and
                               // shrinking it causes real-world scan failures even
                               // though software decoders tolerate less.
export const OVERLAY_MAX = 0.25; // logo width cap vs code width (§10.2)

// §10.2 — variant → { error correction, logo overlay, default brand style }.
export const VARIANTS = {
  standard: { ecc: 'M', logo: false, style: 'default' },
  print:    { ecc: 'Q', logo: false, style: 'default' },
  logo:     { ecc: 'H', logo: true,  style: 'default' },
  inverted: { ecc: 'Q', logo: false, style: 'inverted' },
  branded:  { ecc: 'H', logo: true,  style: 'default' },
};
export function variantSpec(variant = 'standard') {
  return VARIANTS[variant] || VARIANTS.standard;
}
export function isVariant(v) {
  return Object.prototype.hasOwnProperty.call(VARIANTS, v);
}

// Build the QR bit-matrix plus resolved style/spec for a token+variant. `prefix`
// is the URL path segment: 'R' for canonical tokens, 'RP' for ephemeral persona
// tokens (§6.7).
export function buildMatrix(token, variant = 'standard', styleKey, prefix = 'R') {
  const spec = variantSpec(variant);
  const style = getStyle(styleKey || spec.style);
  assertScannable(style); // brand never overrides scannability (§10.5)
  const payload = tokenPayload(token, prefix);
  const qr = QRCode.create(payload, { errorCorrectionLevel: spec.ecc });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const get = (r, c) => (data[r * size + c] ? 1 : 0);
  return { payload, size, data, get, style, spec };
}

// A module is part of one of the three finder patterns (7x7 corners): top-left,
// top-right, bottom-left. (QR has no bottom-right finder.)
export function inFinder(size, r, c) {
  return (r < 7 && c < 7) || (r < 7 && c >= size - 7) || (r >= size - 7 && c < 7);
}

// ---- SVG (primary, §10.3) --------------------------------------------------
function roundedRect(x, y, w, h, r, fill) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${fill}"/>`;
}
function circle(cx, cy, r, fill) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

// Render a finder pattern exactly (7x7 dark, 5x5 light, 3x3 dark) as three
// concentric rounded rects in the eye color — the branded "eye" look, and more
// reliable than drawing 25 individual modules.
function finderSvg(ox, oy, style) {
  const rounded = style.eye_shape === 'rounded_square' || style.module_shape === 'rounded';
  const rOuter = rounded ? 1.6 : 0;
  const rInner = rounded ? 0.8 : 0;
  return (
    roundedRect(ox, oy, 7, 7, rOuter, style.eye_color || style.foreground) +
    roundedRect(ox + 1, oy + 1, 5, 5, rounded ? 1.1 : 0, style.background) +
    roundedRect(ox + 2, oy + 2, 3, 3, rInner, style.eye_color || style.foreground)
  );
}

// `quietZone` is a DISPLAY-ONLY override for the on-screen admin thumbnails, which
// want a tighter white border. It is clamped to [0, QUIET_ZONE] so it can only ever
// SHRINK the margin, never exceed the spec. The canonical scannable/printable codes
// (SVG downloads + all PNGs) never pass it and keep the mandatory 4-module quiet zone.
export function renderSvg(token, variant = 'standard', styleKey, prefix = 'R', quietZone = QUIET_ZONE) {
  const m = buildMatrix(token, variant, styleKey, prefix);
  const { size, style, spec } = m;
  const q = Number.isFinite(quietZone) ? Math.max(0, Math.min(QUIET_ZONE, quietZone)) : QUIET_ZONE;
  const total = size + q * 2;
  // Module shape (§10.5): 'dots' draws each data module as a circle inscribed in
  // its cell (the branded dotted look); 'rounded' softens the square corners;
  // anything else is a crisp square. Finder "eyes" stay solid (drawn separately)
  // for scan reliability regardless of module shape.
  const dots = style.module_shape === 'dots';
  const rounded = style.module_shape === 'rounded';
  const modR = rounded ? 0.28 : 0;
  const dotR = 0.5; // inscribed circle: dotted appearance, orthogonal neighbors still touch

  let modules = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinder(size, r, c)) continue; // finders drawn separately as eyes
      if (!m.get(r, c)) continue;
      modules += dots
        ? circle(c + q + 0.5, r + q + 0.5, dotR, style.foreground)
        : roundedRect(c + q, r + q, 1, 1, modR, style.foreground);
    }
  }

  const finders =
    finderSvg(q, q, style) +                    // top-left
    finderSvg(size - 7 + q, q, style) +         // top-right
    finderSvg(q, size - 7 + q, style);          // bottom-left

  let mark = '';
  if (spec.logo) mark = centerMarkSvg(size, q, style);

  // crispEdges keeps square modules pixel-sharp; dots need geometricPrecision so
  // the circles anti-alias smoothly instead of being snapped to the pixel grid.
  const shapeRendering = dots ? 'geometricPrecision' : 'crispEdges';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" ` +
    `shape-rendering="${shapeRendering}" role="img" aria-label="QR code ${token}">` +
    `<rect width="${total}" height="${total}" fill="${style.background}"/>` +
    modules +
    finders +
    mark +
    `</svg>`
  );
}

// Center brand mark (logo/branded variants). A background-colored knockout keeps
// the code readable (ECC H recovers the covered modules), then a brand rounded
// square with a monogram. Width is capped at 25% of the code (§10.2).
function centerMarkSvg(size, q, style) {
  const scale = Math.min(style.center_mark_scale || 0.18, OVERLAY_MAX);
  const side = size * scale;
  const cx = q + size / 2;
  const cy = q + size / 2;
  const pad = side * 0.28;
  const knock = side + pad * 2;
  const brand = style.center_mark_color || style.eye_color || style.foreground;
  const parts = [
    roundedRect(cx - knock / 2, cy - knock / 2, knock, knock, knock * 0.22, style.background),
    roundedRect(cx - side / 2, cy - side / 2, side, side, side * 0.22, brand),
  ];
  const mono = style.center_mark_monogram;
  if (mono) {
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" ` +
        `font-family="Georgia, 'Times New Roman', serif" font-weight="700" ` +
        `font-size="${side * 0.66}" fill="${style.background}">${mono}</text>`,
    );
  }
  return parts.join('');
}

// ---- PNG (raster, §10.3) ---------------------------------------------------
// Rendered via the qrcode lib with brand colors + a 4-module quiet zone. Rounded
// modules and the center mark are SVG-primary features (§10.3 makes SVG the print
// format); PNG carries the correct payload, ECC, colors, and quiet zone at the
// requested pixel size.
export const PNG_SIZES = [512, 1024, 2048];
export async function renderPng(token, variant = 'standard', styleKey, pixelSize = 1024, prefix = 'R') {
  const spec = variantSpec(variant);
  const style = getStyle(styleKey || spec.style);
  assertScannable(style);
  const size = PNG_SIZES.includes(pixelSize) ? pixelSize : 1024;
  return QRCode.toBuffer(tokenPayload(token, prefix), {
    type: 'png',
    errorCorrectionLevel: spec.ecc,
    margin: QUIET_ZONE,
    width: size,
    color: { dark: style.foreground, light: style.background },
  });
}
