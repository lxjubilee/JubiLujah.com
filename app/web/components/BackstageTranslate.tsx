'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES } from '@/lib/languages';
import type { BackstageBlock } from '@/lib/backstage';

// Translate Article — a sidebar widget that translates the article's title and
// body into any of the site's supported languages. Mirrors JubileeVerse's
// widget: a searchable language dropdown, a "previously used" shortcut, a
// spinner while translating, and a restore-to-English button.
//
// Translation itself is done server-side by /api/backstage/translate (so the
// provider/key stays off the client and CORS isn't an issue). On success the
// live DOM — the .bsa-hero-title and .bsa-body — is swapped in place, and a
// `bsa:bodychanged` event tells the Read Aloud widget to re-sync so it reads
// (and highlights) the translated text. Restoring puts the originals back.

const PREV_COOKIE = 'jv_bs_translate';

type Status = 'idle' | 'loading' | 'done' | 'error';
interface PrevLang {
  code: string;
  name: string;
}

function readPrevCookie(): PrevLang | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${PREV_COOKIE}=([^;]*)`));
  if (!m) return null;
  try {
    const [code, ...rest] = decodeURIComponent(m[1]).split('|');
    if (!code || !rest.length) return null;
    return { code, name: rest.join('|') };
  } catch {
    return null;
  }
}

function writePrevCookie(p: PrevLang) {
  document.cookie = `${PREV_COOKIE}=${encodeURIComponent(`${p.code}|${p.name}`)}; path=/; max-age=${60 * 60 * 24 * 365}`;
}

/** Rebuild the body DOM from translated block texts, preserving block structure. */
function renderBlocks(body: HTMLElement, blocks: BackstageBlock[], texts: string[]) {
  const frag = document.createDocumentFragment();
  let ti = 0;
  for (const b of blocks) {
    if (b.type === 'hr') {
      const hr = document.createElement('hr');
      hr.className = 'bs-rule';
      frag.appendChild(hr);
      continue;
    }
    const tag = b.type === 'h2' ? 'h2' : b.type === 'h3' ? 'h3' : b.type === 'quote' ? 'blockquote' : 'p';
    const el = document.createElement(tag);
    el.textContent = texts[ti] ?? b.text ?? ''; // textContent → no HTML injection
    frag.appendChild(el);
    ti += 1;
  }
  // Clear the wrap flag so Read Aloud re-wraps the fresh (translated) words.
  delete body.dataset.ttsWrapped;
  body.replaceChildren(frag);
}

export default function BackstageTranslate({
  title,
  blocks,
}: {
  title: string;
  blocks: BackstageBlock[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [current, setCurrent] = useState<PrevLang | null>(null); // active translation
  const [prev, setPrev] = useState<PrevLang | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const origTitleRef = useRef<string | null>(null);
  const origBodyRef = useRef<string | null>(null);

  // Text blocks that actually carry words (hr has none), in body order.
  const textBlocks = useMemo(() => blocks.filter((b) => b.type !== 'hr'), [blocks]);

  useEffect(() => {
    setPrev(readPrevCookie());
  }, []);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = LANGUAGES.filter((l) => l.code !== 'en');
    return q ? list.filter((l) => l.name.toLowerCase().includes(q)) : list;
  }, [search]);

  async function translateTo(code: string, name: string) {
    setOpen(false);
    setSearch('');
    setStatus('loading');
    setCurrent({ code, name });
    try {
      const res = await fetch('/api/backstage/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: code, segments: [title, ...textBlocks.map((b) => b.text || '')] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { translations?: string[] } = await res.json();
      const t = data.translations || [];
      if (t.length !== textBlocks.length + 1) throw new Error('length mismatch');

      const titleEl = document.querySelector<HTMLElement>('.bsa-hero-title');
      const bodyEl = document.querySelector<HTMLElement>('.bsa-body');
      if (!titleEl || !bodyEl) throw new Error('article DOM not found');

      // Save the originals once, so Restore is always exact.
      if (origTitleRef.current === null) origTitleRef.current = titleEl.textContent || '';
      if (origBodyRef.current === null) origBodyRef.current = bodyEl.innerHTML;

      titleEl.textContent = t[0];
      renderBlocks(bodyEl, blocks, t.slice(1));
      document.documentElement.setAttribute('lang', code);
      document.dispatchEvent(new CustomEvent('bsa:bodychanged'));

      const p = { code, name };
      writePrevCookie(p);
      setPrev(p);
      setStatus('done');
    } catch {
      setStatus('error');
      setCurrent(null);
    }
  }

  function restore() {
    const titleEl = document.querySelector<HTMLElement>('.bsa-hero-title');
    const bodyEl = document.querySelector<HTMLElement>('.bsa-body');
    if (titleEl && origTitleRef.current !== null) titleEl.textContent = origTitleRef.current;
    if (bodyEl && origBodyRef.current !== null) {
      delete bodyEl.dataset.ttsWrapped;
      bodyEl.innerHTML = origBodyRef.current;
    }
    document.documentElement.setAttribute('lang', 'en');
    document.dispatchEvent(new CustomEvent('bsa:bodychanged'));
    setStatus('idle');
    setCurrent(null);
  }

  const triggerLabel = current ? current.name : 'Select language…';

  return (
    <div className="bsa-widget translate-widget" ref={rootRef}>
      <h2 className="widget-title">
        Translate Article
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 5h9" />
          <path d="M8.5 3.5v1.5" />
          <path d="M11 5c0 4-3 7-7 8.5" />
          <path d="M6 8.5c0 2 2 4 5 5" />
          <path d="M13 21l4-9 4 9" />
          <path d="M14.7 17.5h4.6" />
        </svg>
      </h2>

      <div className={`translate-dropdown${open ? ' open' : ''}`}>
        <div
          className="translate-dropdown-trigger"
          onClick={() => setOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
        >
          <span className="translate-dropdown-label">{triggerLabel}</span>
          <svg className="translate-dropdown-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div className="translate-dropdown-panel">
          <div className="translate-search-wrap">
            <input
              type="text"
              className="translate-search-input"
              placeholder="Search language…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="translate-options">
            {filtered.length === 0 ? (
              <div className="translate-no-results">No languages found</div>
            ) : (
              filtered.map((l) => (
                <div
                  key={l.code}
                  className={`translate-dropdown-option${current?.code === l.code ? ' active' : ''}`}
                  onClick={() => translateTo(l.code, l.name)}
                >
                  {l.name}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {prev && status !== 'loading' ? (
        <div className="translate-prev-lang-section">
          <div className="translate-prev-caption">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            Translate to:
          </div>
          <a onClick={() => translateTo(prev.code, prev.name)}>{prev.name} (Previously Used)</a>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="translate-status">
          <div className="translate-spinner" />
          <span>Translating…</span>
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="translate-status translate-error">
          <span>Couldn’t translate. Please try again.</span>
        </div>
      ) : null}

      {status === 'done' && current ? (
        <button type="button" className="translate-restore-btn" onClick={restore}>
          ← Restore English
        </button>
      ) : null}
    </div>
  );
}
