// ============================================================================
// No em dashes on this website.
//
// Owner direction, 2026-09-16: "no em dashes anywhere on this website — that is
// very important." Authored copy was rewritten at the source, by hand, with the
// punctuation each sentence needed. This is for the text nobody here authors:
// album and track titles from the music drive, database rows, user reviews. It is
// applied where the catalogue is loaded (lib/manifest.ts) and, in the browser, by
// components/NoEmDash.tsx as the last line of defence for anything else.
//
// A rule, not an editor, so it is deliberately plain:
//   "— Interlude"                     → "Interlude"          (a leading dash says nothing)
//   "I Believe — Help Me Believe More" → "I Believe: Help Me Believe More"   (style 'colon', for titles)
//   "the songs — all of them"          → "the songs, all of them"            (style 'comma', for prose)
//   "—" on its own (an empty cell)     → "-"
// Pure and client-safe.
// ============================================================================

const EM = '—';

export type DashStyle = 'comma' | 'colon';

export function noEmDash(input: string, style: DashStyle = 'comma'): string {
  if (typeof input !== 'string' || input.indexOf(EM) < 0) return input;

  // A lone dash standing in for "no value".
  if (input.trim() === EM) return input.replace(EM, '-');

  const joiner = style === 'colon' ? ': ' : ', ';
  return input
    // Leading and trailing dashes carry no meaning once the dash is gone.
    .replace(/^(\s*)—\s*/, '$1')
    .replace(/\s*—(\s*)$/, '$1')
    // Everything else joins what is on either side of it. Any whitespace around
    // the dash is absorbed; an existing comma or colon before it is not doubled.
    .replace(/\s*([,:;])?\s*—\s*/g, (_m, prior) => (prior ? `${prior} ` : joiner));
}

/** True when the string still contains an em dash. */
export const hasEmDash = (s: string) => typeof s === 'string' && s.indexOf(EM) >= 0;
