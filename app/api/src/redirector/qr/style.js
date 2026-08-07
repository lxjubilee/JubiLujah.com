'use strict';
// ============================================================================
// QR brand style profiles — software/redirector.md §10.5.
//
// Each domain ships a `qr.style.json`. A "style" is a named brand look (colors,
// module/eye shape, center mark); it is orthogonal to the "variant" (§10.2),
// which fixes error correction and whether a logo overlays the center.
//
// §10.3 / §10.5: contrast (>= 4:1) and quiet-zone rules are enforced regardless
// of brand preference. Brand never overrides scannability. `assertScannable`
// checks BOTH the module foreground AND the eye color against the background,
// because the finder patterns must stay reliably detectable.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PATH = path.join(__dirname, '..', 'profiles', 'qr.style.json');

let cached = null;
export function loadProfile() {
  if (!cached) cached = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  return cached;
}
export function getStyle(key = 'default') {
  const p = loadProfile();
  return p.styles.find((s) => s.key === key) || p.styles[0];
}

// ---- WCAG relative luminance + contrast ratio -----------------------------
export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}
function srgbToLinear(c) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

export const MIN_CONTRAST = 4; // §10.3

// Throws if any scan-critical color pair falls below the contrast floor.
export function assertScannable(style) {
  const bg = style.background;
  const modCr = contrastRatio(style.foreground, bg);
  if (modCr < MIN_CONTRAST) {
    throw new Error(`qr style '${style.key}': module contrast ${modCr.toFixed(2)}:1 < ${MIN_CONTRAST}:1`);
  }
  const eyeCr = contrastRatio(style.eye_color || style.foreground, bg);
  if (eyeCr < MIN_CONTRAST) {
    throw new Error(`qr style '${style.key}': eye contrast ${eyeCr.toFixed(2)}:1 < ${MIN_CONTRAST}:1`);
  }
  return { moduleContrast: modCr, eyeContrast: eyeCr };
}
