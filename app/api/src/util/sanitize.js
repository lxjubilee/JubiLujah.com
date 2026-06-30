// ============================================================================
// Server-side sanitization for user-generated review text (§17).
//
// Reviews are stored and rendered as PLAIN TEXT (React escapes on render, and
// nothing uses dangerouslySetInnerHTML), so the defense-in-depth job here is to
// neutralize anything that could become active markup if the text were ever
// placed into an HTML context: strip tags, dangerous URI schemes, and control
// characters. We deliberately do NOT HTML-entity-encode, because the value is
// shown as text — encoding would surface a literal "&lt;" to readers.
//
// Dependency-free on purpose (matches the API's lean dependency footprint).
// ============================================================================

// Matches an actual HTML/XML tag start: "<" followed by an optional "/" and an
// ASCII letter (so casual uses like "I <3 this" or "a < b" survive).
const TAG_RE = /<\/?[a-zA-Z][^>]*>/g;
// A leftover lone "<tag" with no closing ">" (e.g. truncated input).
const OPEN_TAG_RE = /<\/?[a-zA-Z][^<>]*$/;
// Dangerous URI schemes that can execute script if linkified downstream.
const SCHEME_RE = /(?:javascript|data|vbscript)\s*:/gi;
// C0/C1 control characters, keeping tab, newline, and carriage return.
const CONTROL_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]', 'g');

/**
 * Sanitize a free-text field. Returns a trimmed plain-text string, or null for
 * empty/blank input (so optional fields collapse to NULL in the DB).
 */
export function sanitizeText(input) {
  if (input == null) return null;
  let s = String(input);
  s = s.replace(TAG_RE, '');        // strip complete tags
  s = s.replace(OPEN_TAG_RE, '');   // strip a trailing unterminated tag
  s = s.replace(SCHEME_RE, '');     // strip javascript:/data:/vbscript:
  s = s.replace(CONTROL_RE, '');    // strip control chars
  s = s.replace(/\r\n?/g, '\n');    // normalize newlines
  s = s.replace(/\n{3,}/g, '\n\n'); // collapse excessive blank lines
  s = s.trim();
  return s.length ? s : null;
}
