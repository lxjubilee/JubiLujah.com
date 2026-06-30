'use client';
import { useLang } from './useLang';
import { translate, type TKey } from './i18n';

// Client hook: returns a `t(key, vars?)` bound to the active language (resolved
// from the LangProvider seeded server-side in the root layout, so the first
// render is already in the chosen language — no English flash).
export function useT() {
  const lang = useLang();
  return (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
