'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Share This Story — a sidebar widget mirroring JubileeVerse's share card: a
// header with a network icon, then a row of square buttons for Facebook,
// Twitter/X, LinkedIn and a copy-link button. Sharing is client-side only, so
// the target URL is read from `window.location` at click time (canonical when
// available) — no URL needs to be threaded in from the server.
//
// The three social buttons open the platform's share dialog in a small popup;
// the copy button writes the article URL to the clipboard and flips its icon to
// a checkmark with a "Copied!" label for a couple of seconds.

function currentUrl(): string {
  if (typeof window === 'undefined') return '';
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  return canonical?.href || window.location.href;
}

/** Clipboard write with a legacy execCommand fallback for non-secure contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function BackstageShare({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const openShare = useCallback((href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer,width=600,height=520');
  }, []);

  const shareFacebook = useCallback(() => {
    openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl())}`);
  }, [openShare]);

  const shareTwitter = useCallback(() => {
    const url = encodeURIComponent(currentUrl());
    const text = encodeURIComponent(title);
    openShare(`https://twitter.com/intent/tweet?url=${url}&text=${text}`);
  }, [openShare, title]);

  const shareLinkedIn = useCallback(() => {
    openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl())}`);
  }, [openShare]);

  const copyLink = useCallback(async () => {
    const ok = await copyText(currentUrl());
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <div className="bsa-widget share-widget">
      <h2 className="widget-title">
        Share This Story
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
      </h2>

      <div className="share-buttons">
        <button
          type="button"
          className="share-btn share-facebook"
          onClick={shareFacebook}
          title="Share on Facebook"
          aria-label="Share on Facebook"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z" />
          </svg>
        </button>

        <button
          type="button"
          className="share-btn share-twitter"
          onClick={shareTwitter}
          title="Share on Twitter"
          aria-label="Share on Twitter"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23 4.98a9.06 9.06 0 0 1-2.6.72 4.53 4.53 0 0 0 1.99-2.5 9.06 9.06 0 0 1-2.87 1.1 4.52 4.52 0 0 0-7.7 4.12A12.83 12.83 0 0 1 2.5 3.75a4.52 4.52 0 0 0 1.4 6.03 4.5 4.5 0 0 1-2.05-.57v.06a4.52 4.52 0 0 0 3.63 4.43 4.53 4.53 0 0 1-2.04.08 4.52 4.52 0 0 0 4.22 3.14A9.07 9.07 0 0 1 1 19.54a12.8 12.8 0 0 0 6.92 2.03c8.3 0 12.85-6.88 12.85-12.85 0-.2 0-.39-.01-.58A9.18 9.18 0 0 0 23 4.98z" />
          </svg>
        </button>

        <button
          type="button"
          className="share-btn share-linkedin"
          onClick={shareLinkedIn}
          title="Share on LinkedIn"
          aria-label="Share on LinkedIn"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
          </svg>
        </button>

        <button
          type="button"
          className={`share-btn share-copy${copied ? ' copied' : ''}`}
          onClick={copyLink}
          title={copied ? 'Link copied' : 'Copy link'}
          aria-label={copied ? 'Link copied' : 'Copy link'}
        >
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          )}
        </button>
      </div>

      <span className={`share-copied-toast${copied ? ' show' : ''}`} role="status" aria-live="polite">
        Link copied!
      </span>
    </div>
  );
}
