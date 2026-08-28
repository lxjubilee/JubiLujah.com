const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** "Album I", "Album II" — the albums are numbered like tablets. */
export function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return String(n);
  let rest = Math.floor(n);
  let out = '';
  for (const [value, numeral] of ROMAN) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out;
}

/** Seconds → "4:12". */
export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
] as const;

/** Prose counts read better as words. Falls back to digits past twelve. */
export function numberWord(n: number): string {
  return WORDS[n] ?? String(n);
}

/**
 * "Seven songs", "Nine songs" — the label follows the album's actual track
 * count. The narrative determines how many songs an album holds; the UI never
 * asserts a quota.
 */
export function songCountLabel(n: number): string {
  const word = numberWord(n);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${n === 1 ? 'song' : 'songs'}`;
}

/** Specific, not round. It reads as researched rather than arbitrary. */
export const YEARLY_PRICE = 87.95;
export const YEARLY_PRICE_LABEL = '$87.95';

/**
 * PLACEHOLDER. The brief sets the yearly plan at $87.95 but never prices the
 * book on its own. This figure follows the same "specific, not round" logic and
 * is a guess. Confirm it before launch.
 */
export const BOOK_PRICE_LABEL = '$27.95';
