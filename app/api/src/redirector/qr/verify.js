'use strict';
// ============================================================================
// QR scan verification — software/redirector.md §10.5 / acceptance §20.9.
//
// "Every style must pass an automated scan verification test at minimum print
//  size before it can be saved. Render, decode programmatically, confirm the
//  payload matches. Reject the style if decoding fails."
//
// We rasterize the bit-matrix in the style's actual colors (module color + eye
// color + background) at a minimum-print module scale, then decode it with jsQR
// and assert the decoded string equals the canonical payload. For logo/branded
// variants we additionally knock out a 25%-width center square (simulating the
// overlay) to prove the error correction recovers the covered region (§10.2).
// Contrast and quiet-zone floors are checked too — brand never overrides
// scannability (§10.5).
// ============================================================================
import jsQR from 'jsqr';
import { buildMatrix, variantSpec, inFinder, QUIET_ZONE, OVERLAY_MAX } from './render.js';
import { contrastRatio, hexToRgb, MIN_CONTRAST } from './style.js';

// Minimum-print module scale. 8 px/module with a 4-module quiet zone is a faithful
// stand-in for the 2cm minimum printed size decoded by a phone camera (§20.19).
const MIN_PRINT_SCALE = 8;

// Rasterize the matrix to an RGBA buffer jsQR can decode.
export function matrixToRgba(m, scale = MIN_PRINT_SCALE, opts = {}) {
  const total = m.size + QUIET_ZONE * 2;
  const dim = total * scale;
  const fg = hexToRgb(m.style.foreground);
  const bg = hexToRgb(m.style.background);
  const eye = hexToRgb(m.style.eye_color || m.style.foreground);
  const buf = new Uint8ClampedArray(dim * dim * 4);

  let ko = null; // center knockout window in module coords
  if (opts.knockout) {
    const s = Math.floor(OVERLAY_MAX * m.size);
    const start = Math.floor((m.size - s) / 2);
    ko = { a: start, b: start + s };
  }

  for (let y = 0; y < dim; y++) {
    const mr = Math.floor(y / scale) - QUIET_ZONE;
    for (let x = 0; x < dim; x++) {
      const mc = Math.floor(x / scale) - QUIET_ZONE;
      let col = bg;
      if (mr >= 0 && mr < m.size && mc >= 0 && mc < m.size) {
        const knocked = ko && mr >= ko.a && mr < ko.b && mc >= ko.a && mc < ko.b;
        if (!knocked && m.get(mr, mc)) col = inFinder(m.size, mr, mc) ? eye : fg;
      }
      const i = (y * dim + x) * 4;
      buf[i] = col.r; buf[i + 1] = col.g; buf[i + 2] = col.b; buf[i + 3] = 255;
    }
  }
  return { data: buf, width: dim, height: dim };
}

// Verify one (token, variant, style). Returns a structured result; never throws
// for a decode failure (the caller decides how to report), but style contrast
// failures surface via buildMatrix -> assertScannable.
export function verifyToken(token, variant = 'standard', styleKey) {
  const m = buildMatrix(token, variant, styleKey);
  const spec = variantSpec(variant);
  const img = matrixToRgba(m, MIN_PRINT_SCALE, { knockout: spec.logo });
  const decoded = jsQR(img.data, img.width, img.height);
  const modContrast = contrastRatio(m.style.foreground, m.style.background);
  const eyeContrast = contrastRatio(m.style.eye_color || m.style.foreground, m.style.background);
  return {
    ok: !!decoded && decoded.data === m.payload && modContrast >= MIN_CONTRAST && eyeContrast >= MIN_CONTRAST,
    variant,
    style: m.style.key,
    payload: m.payload,
    decoded: decoded ? decoded.data : null,
    moduleContrast: Number(modContrast.toFixed(2)),
    eyeContrast: Number(eyeContrast.toFixed(2)),
    quietZone: QUIET_ZONE,
    knockout: spec.logo,
  };
}

// Verify every variant against a style. Used before a style is saved (§10.5)
// and by the standalone verification script.
export function verifyStyle(styleKey, variants) {
  const list = variants || ['standard', 'print', 'logo', 'inverted', 'branded'];
  const sample = 'K7M9P2XR4TWB';
  return list.map((v) => verifyToken(sample, v, styleKey));
}
