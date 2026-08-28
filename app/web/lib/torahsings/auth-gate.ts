'use client';

import { useSyncExternalStore } from 'react';

/**
 * A GLOBAL sign-in gate, mirroring JubileePraise's useAuthGate.
 *
 * It has to be global — the hover-preview card unmounts the instant your mouse
 * leaves it, so a gate rendered inside the card would disappear before you could
 * reach its buttons. Any component calls showAuthGate(); <AuthGate/> (mounted
 * once in the layout) renders the popup, surviving whatever triggered it.
 */
let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showAuthGate() {
  if (open) return;
  open = true;
  emit();
}

export function hideAuthGate() {
  if (!open) return;
  open = false;
  emit();
}

export function useAuthGateOpen(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => open,
    () => false,
  );
}
