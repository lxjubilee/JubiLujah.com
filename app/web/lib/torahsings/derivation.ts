/**
 * The derivation engine.
 *
 * This is the disclosed layer of the Torah Sings method. It takes a Hebrew
 * source phrase, reads it symbol by symbol, and surfaces a note sequence.
 *
 * WHAT IS DISCLOSED HERE (and rendered in the Derivation tab):
 *   1. The letter table — pictographic name-sense + standard numerical value.
 *   2. The reduction — each value is folded by seven onto a degree of a
 *      seven-note mode. Seven degrees; the album's song count is set by its
 *      narrative, not by the fold.
 *   3. The mode assignment — each topic album sings in one mode.
 *
 * WHAT IS WITHHELD (per the brief — the core algorithm stays proprietary):
 *   - The ordering/interleave layer that turns a degree sequence into melody.
 *   - Rhythm, meter, and octave placement.
 *   - The voice-assignment pass that distinguishes the angelic register.
 *
 * Serious students are pointed to the downloadable resources kit.
 */

export interface HebrewLetter {
  /** Standard Hebrew letter. Rendered in Marcellus SC per the design system. */
  letter: string;
  /** Transliterated name. */
  name: string;
  /** The pictographic sense carried by the ancient form. */
  sense: string;
  /** Standard numerical value. */
  value: number;
}

/** The twenty-two. Values are standard gematria; senses are the pictographs. */
export const ALEPH_BET: readonly HebrewLetter[] = [
  { letter: 'א', name: 'Aleph', sense: 'Ox — strength, the first, the leader', value: 1 },
  { letter: 'ב', name: 'Bet', sense: 'House — tent, dwelling, family within', value: 2 },
  { letter: 'ג', name: 'Gimel', sense: 'Foot — to gather, to lift up, to walk', value: 3 },
  { letter: 'ד', name: 'Dalet', sense: 'Door — pathway, to enter, to hang', value: 4 },
  { letter: 'ה', name: 'Hey', sense: 'Behold — arms lifted, breath, revelation', value: 5 },
  { letter: 'ו', name: 'Vav', sense: 'Nail — to fasten, to join, and', value: 6 },
  { letter: 'ז', name: 'Zayin', sense: 'Mattock — to cut, to harvest, a weapon', value: 7 },
  { letter: 'ח', name: 'Chet', sense: 'Wall — to separate, to enclose, to protect', value: 8 },
  { letter: 'ט', name: 'Tet', sense: 'Basket — to surround, to contain, to store', value: 9 },
  { letter: 'י', name: 'Yod', sense: 'Hand — work, deed, that which is made', value: 10 },
  { letter: 'כ', name: 'Kaf', sense: 'Open palm — to cover, to allow, to bend', value: 20 },
  { letter: 'ל', name: 'Lamed', sense: "Shepherd's staff — to teach, to lead, authority", value: 30 },
  { letter: 'מ', name: 'Mem', sense: 'Water — the deep, chaos, the mighty', value: 40 },
  { letter: 'נ', name: 'Nun', sense: 'Seed — life, continuation, the heir', value: 50 },
  { letter: 'ס', name: 'Samech', sense: 'Prop — to support, to uphold, to turn', value: 60 },
  { letter: 'ע', name: 'Ayin', sense: 'Eye — to see, to know, to experience', value: 70 },
  { letter: 'פ', name: 'Pey', sense: 'Mouth — to speak, to open, the word', value: 80 },
  { letter: 'צ', name: 'Tsade', sense: 'Hook — to catch, to desire, the righteous one', value: 90 },
  { letter: 'ק', name: 'Qof', sense: 'Sun at the horizon — behind, the last, a circle', value: 100 },
  { letter: 'ר', name: 'Resh', sense: 'Head — the first, the highest, a person', value: 200 },
  { letter: 'ש', name: 'Shin', sense: 'Teeth — to consume, to press, the sharp', value: 300 },
  { letter: 'ת', name: 'Tav', sense: 'Mark — a sign, a covenant, the cross', value: 400 },
];

/** Final (sofit) forms fold back onto their base letter. */
const SOFIT_TO_BASE: Readonly<Record<string, string>> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

const BY_LETTER: ReadonlyMap<string, HebrewLetter> = new Map(
  ALEPH_BET.map((l) => [l.letter, l]),
);

/**
 * Seven-note modes. Each topic album sings in one of them.
 * Degrees are 1-indexed and map directly onto the sevenfold reduction.
 */
export interface Mode {
  id: ModeId;
  /** Reader-facing name, e.g. "Ahavah Rabbah on D". */
  label: string;
  /** Seven degrees, ascending from the tonic. */
  degrees: readonly [string, string, string, string, string, string, string];
}

export type ModeId =
  | 'ahavah-rabbah-d'
  | 'mi-sheberach-d'
  | 'adonai-malach-c'
  | 'phrygian-e'
  | 'aeolian-a'
  | 'lydian-f';

export const MODES: Readonly<Record<ModeId, Mode>> = {
  'ahavah-rabbah-d': {
    id: 'ahavah-rabbah-d',
    label: 'Ahavah Rabbah on D',
    degrees: ['D', 'E♭', 'F♯', 'G', 'A', 'B♭', 'C'],
  },
  'mi-sheberach-d': {
    id: 'mi-sheberach-d',
    label: 'Mi Sheberach on D',
    degrees: ['D', 'E', 'F', 'G♯', 'A', 'B', 'C'],
  },
  'adonai-malach-c': {
    id: 'adonai-malach-c',
    label: 'Adonai Malach on C',
    degrees: ['C', 'D', 'E', 'F', 'G', 'A♭', 'B♭'],
  },
  'phrygian-e': {
    id: 'phrygian-e',
    label: 'Phrygian on E',
    degrees: ['E', 'F', 'G', 'A', 'B', 'C', 'D'],
  },
  'aeolian-a': {
    id: 'aeolian-a',
    label: 'Aeolian on A',
    degrees: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  },
  'lydian-f': {
    id: 'lydian-f',
    label: 'Lydian on F',
    degrees: ['F', 'G', 'A', 'B', 'C', 'D', 'E'],
  },
};

/**
 * The sevenfold reduction. A letter's value is folded by seven onto a degree.
 * Multiples of seven rest on the seventh — nothing falls to zero.
 */
export function degreeOf(value: number): number {
  const r = value % 7;
  return r === 0 ? 7 : r;
}

export interface DerivationRow {
  letter: string;
  name: string;
  sense: string;
  value: number;
  /** 1..7 */
  degree: number;
  /** The sounded degree within this album's mode. */
  note: string;
  /** True when the note lands on the tonic — the resting place. */
  isTonic: boolean;
}

/** Strip vowel points, cantillation, punctuation and spacing. */
function letterSequence(hebrew: string): string[] {
  const out: string[] = [];
  for (const ch of hebrew) {
    const base = SOFIT_TO_BASE[ch] ?? ch;
    if (BY_LETTER.has(base)) out.push(base);
  }
  return out;
}

/**
 * Read a Hebrew phrase symbol by symbol and surface its note sequence.
 * Deterministic: the same phrase in the same mode always sings the same.
 */
export function derive(hebrew: string, modeId: ModeId): DerivationRow[] {
  const mode = MODES[modeId];
  return letterSequence(hebrew).map((letter) => {
    const l = BY_LETTER.get(letter)!;
    const degree = degreeOf(l.value);
    return {
      letter: l.letter,
      name: l.name,
      sense: l.sense,
      value: l.value,
      degree,
      note: mode.degrees[degree - 1],
      isTonic: degree === 1,
    };
  });
}

/** The bare note line, e.g. "E♭ · G · D · B♭ · F♯ · D". */
export function noteLine(rows: DerivationRow[]): string {
  return rows.map((r) => r.note).join(' · ');
}

/** Sum of the letter values in a phrase — the phrase's own number. */
export function phraseValue(hebrew: string): number {
  return derive(hebrew, 'ahavah-rabbah-d').reduce((sum, r) => sum + r.value, 0);
}
