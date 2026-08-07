// Client-side memory of the paths visited this session. It lives at module
// scope, so it survives client-side (SPA) navigations and resets on a full
// reload — exactly the lifetime we want. `document.referrer` can't do this
// because it isn't updated on client-side navigation.
//
// Used by the article "← Backstage" button: when the previous path was the
// Backstage grid, the button goes history.back() so the grid's exact scroll
// position (the card you clicked) is restored, instead of a fresh push to the
// top of the list.

let paths: string[] = [];

export function recordPath(p: string): void {
  if (paths[paths.length - 1] === p) return; // ignore no-op re-renders
  paths.push(p);
  if (paths.length > 20) paths = paths.slice(-20); // bound the buffer
}

/** The path visited immediately before the current one (undefined if none). */
export function previousPath(): string | undefined {
  return paths[paths.length - 2];
}
