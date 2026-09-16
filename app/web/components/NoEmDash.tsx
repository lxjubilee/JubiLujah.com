'use client';
import { useEffect } from 'react';
import { noEmDash } from '@/lib/text';

// ============================================================================
// The last line of defence for "no em dashes anywhere on this website".
//
// Everything this site AUTHORS was rewritten at the source (2026-09-16). What it
// cannot rewrite at the source is text that arrives at runtime from somewhere
// else — track titles from the API, database rows, user reviews, admin data —
// and some of that genuinely contains em dashes (ten song titles in production
// did). This walks the rendered page once and then watches it, replacing any em
// dash in visible text and in the attributes a visitor can see.
//
// AFTER HYDRATION, BY CONSTRUCTION: useEffect runs once React has committed, so
// this never changes server-rendered text out from under hydration (which would
// throw React into a client re-render of the subtree). React later updating a
// text node it owns simply triggers the observer again.
//
// Skips what must stay byte-exact: scripts, styles, code, and anything the
// visitor is editing (inputs, textareas, contenteditable) — rewriting what
// someone is typing would move their cursor.
// ============================================================================

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'SVG']);
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

function skippable(el: Element | null): boolean {
  for (let n = el; n; n = n.parentElement) {
    if (SKIP.has(n.tagName.toUpperCase())) return true;
    if ((n as HTMLElement).isContentEditable) return true;
  }
  return false;
}

function fixText(node: Text) {
  const v = node.nodeValue;
  if (!v || v.indexOf('—') < 0 || skippable(node.parentElement)) return;
  const next = noEmDash(v);
  if (next !== v) node.nodeValue = next;
}

function fixAttrs(el: Element) {
  if (skippable(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && v.indexOf('—') >= 0) el.setAttribute(a, noEmDash(v));
  }
}

function sweep(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) { fixText(root as Text); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  fixAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) fixText(n as Text);
    else fixAttrs(n as Element);
  }
}

export default function NoEmDash() {
  useEffect(() => {
    if (document.title.indexOf('—') >= 0) document.title = noEmDash(document.title);
    sweep(document.body);

    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target as Text);
        else if (r.type === 'attributes') fixAttrs(r.target as Element);
        else r.addedNodes.forEach(sweep);
      }
      if (document.title.indexOf('—') >= 0) document.title = noEmDash(document.title);
    });
    obs.observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
    return () => obs.disconnect();
  }, []);
  return null;
}
