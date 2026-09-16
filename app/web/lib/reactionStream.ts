'use client';
// ============================================================================
// The reaction stream: hearts for a favourite, green thumbs for a like, rising
// from the button past the top of the header.
//
// PORTED FROM kJubilee.com (public/js/kj-song-reactions.js, `burst`, deployed
// 2026-09-16 by the kJubilee session), so the two family sites celebrate a song
// the same way. The owner's brief for both: like bubbles underwater — each icon
// starts small at the button and grows as it rises; they leave at different
// moments and climb at different speeds; the stream spreads into a funnel, a
// narrow point at the button widening towards the header; and every icon goes
// all the way past the top of the screen before it fades.
//
// The funnel leans towards the middle of the screen and is clamped to it: a
// button near an edge (the heart sits against the right side of a phone) would
// otherwise send half its stream off-screen where nobody sees it.
//
// Fixed-position, above the header and the footer player, pointer-events none,
// so nothing it draws can take a press. Every icon removes itself when its
// animation ends. Anyone who has asked their device for less motion gets one
// gentle pop on the button and nothing more.
// ============================================================================

export type ReactionKind = 'heart' | 'thumb';

const ICON_PATH: Record<ReactionKind, string> = {
  heart: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
  thumb: 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z',
};
const PALETTE: Record<ReactionKind, string[]> = {
  heart: ['#FF4D6D', '#FF6B8B', '#FF8FA3', '#FFB3C1', '#E0245E', '#FF2D55', '#FF7096'],
  thumb: ['#46D07A', '#2FBF63', '#7BE3A0', '#1FA34F', '#A8F0C2', '#5EDC8C', '#13994A'],
};
/** How many rise at once. The heart is the bigger moment of the two. */
const STREAM: Record<ReactionKind, number> = { heart: 42, thumb: 34 };

const STYLE_ID = 'jp-reaction-stream-css';

function injectCss() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent =
    '.jp-rise{position:fixed;z-index:100001;pointer-events:none;will-change:transform,opacity;' +
    'opacity:0;animation:jp-rise var(--dur,2.4s) cubic-bezier(.25,.1,.3,1) forwards}' +
    '.jp-rise svg{width:100%;height:100%;fill:currentColor;display:block;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}' +
    // Start small, grow as it climbs, sway once in the middle, and fade only near
    // the top so the whole climb is visible.
    '@keyframes jp-rise{' +
    '0%{transform:translate(0,0) scale(.22) rotate(0deg);opacity:0}' +
    '8%{opacity:1}' +
    '45%{transform:translate(calc(var(--dx) * .38 + var(--sway)),calc(var(--dy) * .45)) scale(calc(var(--sc) * .55)) rotate(calc(var(--rot) * .5))}' +
    '82%{opacity:1}' +
    '100%{transform:translate(var(--dx),var(--dy)) scale(var(--sc)) rotate(var(--rot));opacity:0}}' +
    '@keyframes jp-react-pop{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}' +
    '.jp-react-pop{animation:jp-react-pop .4s ease}';
  (document.head || document.documentElement).appendChild(el);
}

/** Send a stream of `kind` up from `button`. Safe to call on any element. */
export function reactionStream(button: HTMLElement, kind: ReactionKind): void {
  if (typeof window === 'undefined') return;
  injectCss();
  button.classList.remove('jp-react-pop');
  void button.offsetWidth; // restart the pop
  button.classList.add('jp-react-pop');

  let reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  if (reduce) return;

  const svg = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATH[kind]}"/></svg>`;
  const colours = PALETTE[kind];
  const r = button.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const vw = window.innerWidth || document.documentElement.clientWidth || 800;

  for (let i = 0; i < STREAM[kind]; i++) {
    const el = document.createElement('span');
    el.className = 'jp-rise';
    el.innerHTML = svg;

    // Every icon clears the top of the viewport, the header included.
    const climb = y + 60 + Math.random() * 120;
    // The funnel: sideways travel is a share of a half-width that grows with the
    // climb, leaning to the middle of the screen and kept on it.
    const halfWidth = Math.min(climb * 0.42, vw * 0.45);
    let dx = (Math.random() * 2 - 1) * halfWidth + (vw / 2 - x) * 0.4;
    dx = Math.max(16 - x, Math.min(vw - 16 - x, dx));
    // Small at the button, bigger at the top: 14-32px, finishing 1.8x to 3.2x.
    const size = 14 + Math.random() * 18;
    const grow = 1.8 + Math.random() * 1.4;

    el.style.cssText =
      `left:${x}px;top:${y}px;width:${size}px;height:${size}px;` +
      `margin:${-size / 2}px 0 0 ${-size / 2}px;color:${colours[i % colours.length]};` +
      `--dx:${Math.round(dx)}px;--dy:${Math.round(-climb)}px;` +
      `--sway:${Math.round((Math.random() * 2 - 1) * 26)}px;` +
      `--rot:${Math.round((Math.random() * 2 - 1) * 35)}deg;` +
      `--sc:${grow.toFixed(2)};` +
      // Different speeds (1.6s to 3.4s) and different departures, so it streams.
      `--dur:${(1.6 + Math.random() * 1.8).toFixed(2)}s;` +
      `animation-delay:${Math.round(Math.random() * 900)}ms`;
    el.addEventListener('animationend', () => el.remove());
    document.body.appendChild(el);
  }
}
