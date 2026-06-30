// Supported UI/catalog languages for JubiLujah.com. An album's language is
// encoded in the last 2 letters of its code (…EN = English, …ES = Spanish, …),
// so albumLanguage() derives it from the code. The whole catalog is currently
// English; other languages populate as …<XX>-suffixed albums are added.

// `flag` is the emoji; `cc` is the flagcdn.com country code so the picker can
// render round flag images (https://flagcdn.com/w80/<cc>.png) like JubileeVerse
// / JubileeInspire.
export interface Lang { code: string; name: string; flag: string; cc: string }

// Order roughly mirrors JubileeInspire's flag bar (English first).
export const LANGUAGES: Lang[] = [
  { code: 'en', name: 'English', flag: '🇺🇸', cc: 'us' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', cc: 'es' },
  { code: 'fr', name: 'French', flag: '🇫🇷', cc: 'fr' },
  { code: 'de', name: 'German', flag: '🇩🇪', cc: 'de' },
  { code: 'it', name: 'Italian', flag: '🇮🇹', cc: 'it' },
  { code: 'pt-BR', name: 'Portuguese (Brazilian)', flag: '🇧🇷', cc: 'br' },
  { code: 'pt-PT', name: 'Portuguese (European)', flag: '🇵🇹', cc: 'pt' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱', cc: 'nl' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺', cc: 'ru' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱', cc: 'pl' },
  { code: 'zh', name: 'Mandarin Chinese', flag: '🇨🇳', cc: 'cn' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', cc: 'jp' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', cc: 'kr' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', cc: 'sa' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳', cc: 'in' },
  { code: 'th', name: 'Thai', flag: '🇹🇭', cc: 'th' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷', cc: 'tr' },
  { code: 'vi', name: 'Vietnamese', flag: '🇻🇳', cc: 'vn' },
  { code: 'tl', name: 'Tagalog / Filipino', flag: '🇵🇭', cc: 'ph' },
  { code: 'he', name: 'Hebrew', flag: '🇮🇱', cc: 'il' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪', cc: 'se' },
  { code: 'da', name: 'Danish', flag: '🇩🇰', cc: 'dk' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿', cc: 'cz' },
  { code: 'hu', name: 'Hungarian', flag: '🇭🇺', cc: 'hu' },
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬', cc: 'bg' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷', cc: 'hr' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩', cc: 'id' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴', cc: 'ro' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦', cc: 'ua' },
  // 12 additional languages. Codes are ISO 639-1 where one exists, otherwise
  // ISO 639-3 (Cantonese = 'yue', a 3-letter suffix handled by albumLanguage()).
  { code: 'el', name: 'Greek', flag: '🇬🇷', cc: 'gr' },
  { code: 'yue', name: 'Cantonese', flag: '🇭🇰', cc: 'hk' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾', cc: 'my' },
  { code: 'ur', name: 'Urdu', flag: '🇵🇰', cc: 'pk' },
  { code: 'bn', name: 'Bengali', flag: '🇧🇩', cc: 'bd' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳', cc: 'in' },
  { code: 'fa', name: 'Persian / Farsi', flag: '🇮🇷', cc: 'ir' },
  { code: 'sw', name: 'Swahili', flag: '🇹🇿', cc: 'tz' },
  { code: 'no', name: 'Norwegian', flag: '🇳🇴', cc: 'no' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮', cc: 'fi' },
  { code: 'af', name: 'Afrikaans', flag: '🇿🇦', cc: 'za' },
  { code: 'la', name: 'Latin', flag: '🇻🇦', cc: 'va' },
];

export const DEFAULT_LANG = 'en';
export const LANG_COOKIE = 'jv_lang';

// Round flag image URL (flagcdn.com) for a language code — used by the slide-out
// picker and the header trigger button. Falls back to the US flag.
export function langFlagUrl(code: string, w: 40 | 80 = 80): string {
  const cc = langByCode(code)?.cc || 'us';
  return `https://flagcdn.com/w${w}/${cc}.png`;
}

// 2-letter album-code suffix → our canonical language code. The catalog uses a
// distinct suffix per language: …BR = Brazilian Portuguese, …PT = European
// Portuguese (so they ARE told apart by the suffix).
const SUFFIX_TO_LANG: Record<string, string> = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', it: 'it', br: 'pt-BR', pt: 'pt-PT', nl: 'nl', ru: 'ru',
  pl: 'pl', zh: 'zh', ja: 'ja', ko: 'ko', ar: 'ar', hi: 'hi', th: 'th', tr: 'tr',
  vi: 'vi', tl: 'tl', he: 'he', sv: 'sv', da: 'da', cs: 'cs', hu: 'hu', bg: 'bg',
  hr: 'hr', id: 'id', ro: 'ro', uk: 'uk',
  // Round 3 additions (yue = Cantonese is a 3-letter suffix).
  el: 'el', yue: 'yue', ms: 'ms', ur: 'ur', bn: 'bn', ta: 'ta', fa: 'fa', sw: 'sw',
  no: 'no', fi: 'fi', af: 'af', la: 'la',
};

export function albumLanguage(code: string): string {
  // The language suffix follows the 4-letter prefix + 4-digit number. It is
  // usually 2 letters (…EN, …ES) but can be longer (…YUE = Cantonese), so we
  // extract the trailing letters after the numeric block rather than slice(-2).
  const m = /^[A-Za-z]{4}\d{4}([A-Za-z-]+)$/.exec(String(code || '').trim());
  const suffix = (m ? m[1] : String(code || '').slice(-2)).toLowerCase();
  return SUFFIX_TO_LANG[suffix] || 'other';
}

// BCP-47 lang tag for an album's language, for the `lang` HTML attribute on
// foreign-language text. CRITICAL for CJK: kanji/hanzi/hanja share Unicode
// codepoints (CJK unification), so without lang="ja" a Japanese title can render
// with Chinese glyph shapes on an English page. Returns undefined for en/other.
export function albumBcp47(code: string): string | undefined {
  const l = albumLanguage(code);
  if (l === 'en' || l === 'other') return undefined;
  return ({ yue: 'zh-HK' } as Record<string, string>)[l] || l;
}

// The set of recognized NON-English catalog languages — derived from EVERY
// suffix the catalog can encode (not just the UI flag bar), so an album in a
// language that isn't yet in LANGUAGES (e.g. …UK) is still kept off the default
// English site. Used by albumVisibleInLang().
const FOREIGN_LANGS = new Set(Object.values(SUFFIX_TO_LANG).filter((v) => v !== DEFAULT_LANG));

// Should an album (by its code) be shown while the UI is set to `lang`?
//  - Default English view (lang === 'en'): show English ('en') AND non-language /
//    legacy albums ('other', e.g. children's). HIDE recognized foreign-language
//    translations (…RO, …ES, …AR, …BR, …PT, …) — they belong to their own
//    per-language Home only.
//  - A selected foreign language: show ONLY that language's albums.
export function albumVisibleInLang(code: string, lang: string): boolean {
  const al = albumLanguage(code);
  if (lang === DEFAULT_LANG) return !FOREIGN_LANGS.has(al);
  return al === lang;
}
export const langByCode = (code: string): Lang | undefined => LANGUAGES.find((l) => l.code === code);
export const langName = (code: string): string => langByCode(code)?.name || code;
export const isSupportedLang = (code: string): boolean => LANGUAGES.some((l) => l.code === code);
