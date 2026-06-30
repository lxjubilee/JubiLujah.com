// Tiny dependency-free User-Agent classifier for analytics (device/browser/os).
// Best-effort only — good enough for engagement segmentation, not fingerprinting.

export function parseUserAgent(ua) {
  const s = String(ua || '');
  const l = s.toLowerCase();

  let device = 'desktop';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) device = 'tablet';
  else if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(s)) device = 'mobile';

  let os = 'other';
  if (/windows nt/i.test(s)) os = 'Windows';
  else if (/iphone|ipad|ipod/i.test(s)) os = 'iOS';
  else if (/mac os x/i.test(s)) os = 'macOS';
  else if (/android/i.test(s)) os = 'Android';
  else if (/linux/i.test(s)) os = 'Linux';

  let browser = 'other';
  if (/edg\//i.test(s)) browser = 'Edge';
  else if (/opr\/|opera/i.test(s)) browser = 'Opera';
  else if (/chrome|crios/i.test(l) && !/edg\//i.test(s)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(l)) browser = 'Firefox';
  else if (/safari/i.test(l) && !/chrome|crios/i.test(l)) browser = 'Safari';

  return { device, os, browser };
}
