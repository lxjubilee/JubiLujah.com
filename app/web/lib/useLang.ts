'use client';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_LANG, LANG_COOKIE } from './languages';

export function readLangCookie(): string {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  const m = document.cookie.match(new RegExp('(?:^|; )' + LANG_COOKIE + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : DEFAULT_LANG;
}
export function setLangCookie(code: string): void {
  if (typeof document !== 'undefined') document.cookie = `${LANG_COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000`;
}

// Server-seeded language context. The root layout reads the jv_lang cookie ON THE
// SERVER and provides the value here, so the FIRST render (SSR + hydration) is
// already in the selected language — no English flash before the per-language
// Home appears. (Previously useLang started at 'en' and resolved the cookie in a
// client effect, which caused the catalog to flicker from English to the chosen
// language on every load.)
const LangCtx = createContext<string | null>(null);

export function LangProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return React.createElement(LangCtx.Provider, { value }, children);
}

export function useLang(): string {
  const seeded = useContext(LangCtx);
  // Fallback for any subtree NOT under a LangProvider: resolve from the cookie on
  // the client (the old behavior). Under the provider, `seeded` is authoritative
  // and identical on server + client, so there is no hydration mismatch and no flicker.
  const [lang, setLang] = useState<string>(seeded ?? DEFAULT_LANG);
  useEffect(() => {
    if (seeded != null) return;
    const c = readLangCookie();
    setLang((prev) => (prev === c ? prev : c));
  }, [seeded]);
  return seeded ?? lang;
}
