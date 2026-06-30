// ============================================================================
// UI internationalization (i18n) for the site chrome. The English strings below
// are the source of truth; per-language overrides live in lib/i18n/dictionaries.
// Missing keys fall back to English. {placeholders} are interpolated at runtime.
//
// Isomorphic: `translate(lang, key, vars)` works on the server (layout, server
// components) and the client. Client components use the `useT()` hook
// (lib/useT.ts), which resolves the active language from the LangProvider.
// ============================================================================
import { DICTIONARIES } from './i18n/dictionaries';

export const EN = {
  // Top-row media / cross-property links
  'media.articles': 'Articles',
  'media.bibleChat': 'AI Bible Chat',
  'media.admin': 'Admin',
  // Search box (header)
  'search.placeholder': 'Search...',
  'search.button': 'SEARCH',
  'search.aria': 'Search the catalog',
  // Auth / profile menu
  'auth.signIn': 'Sign In',
  'menu.account': 'Account',
  'menu.subscription': 'My subscription',
  'menu.liked': 'Liked albums',
  'menu.adminConsole': 'Admin console',
  'menu.moderation': 'Review moderation',
  'menu.signOut': 'Sign out',
  // Category nav (second row)
  'nav.home': 'HOME',
  'nav.inspire': 'INSPIRE FAMILY',
  'nav.children': 'CHILDREN MUSIC',
  'nav.family': 'FAMILY FRIENDLY',
  'nav.musicType': 'MUSIC TYPE',
  'nav.christmas': 'CHRISTMAS',
  'nav.playlists': 'PLAYLISTS',
  'nav.upgrade': 'UPGRADE',
  // Language picker panel
  'lang.title': 'Languages',
  'lang.search': 'Search languages...',
  'lang.noResults': 'No languages found',
  'lang.choose': 'Choose language',
  'lang.recentlyUsed': 'RECENTLY USED',
  'lang.allLanguages': 'ALL LANGUAGES',
  // Footer
  'footer.tagline': 'Music that celebrates, restores, and resounds',
  'footer.terms': 'Terms of Use',
  'footer.privacy': 'Privacy Policy',
  // Search results page
  'search.resultsFor': 'Results for',
  'search.title': 'Search',
  'search.filter': 'Filter',
  'search.all': 'All',
  'search.songs': 'Songs',
  'search.albums': 'Albums',
  'search.artists': 'Artists',
  'search.musicTypes': 'Music Types',
  'search.playlists': 'Playlists',
  'search.topResult': 'Top result',
  'search.yourPlaylists': 'Your Playlists',
  'search.noResults': 'No results found for “{q}”. Check the spelling or try different keywords.',
  'search.prompt': 'Type a song, album, artist, music type, or one of your playlists in the search box above.',
  // Result entity-type labels
  'kind.album': 'Album',
  'kind.song': 'Song',
  'kind.artist': 'Artist',
  'kind.musicType': 'Music Type',
  'kind.playlist': 'Playlist',
  'count.albums': '{n} albums',
  'count.albumsOne': '{n} album',
  'count.songs': '{n} songs',
  'count.songsOne': '{n} song',
  // Per-language Home (when a language has no catalog yet)
  'home.title': 'Home',
  'home.comingSoon': "No {language} music is available yet — we're adding more languages soon. Switch back to English from the flag bar above to browse the full catalog.",
} as const;

export type TKey = keyof typeof EN;

// Right-to-left scripts — the layout sets <html dir="rtl"> for these.
export const RTL_LANGS = new Set(['ar', 'he', 'ur', 'fa']);
export const isRtlLang = (lang: string): boolean => RTL_LANGS.has(lang);

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

// Translate a key into `lang`, falling back to English, then the raw key.
export function translate(lang: string, key: TKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[lang];
  const base = (dict && dict[key]) || EN[key] || key;
  return interpolate(base, vars);
}
