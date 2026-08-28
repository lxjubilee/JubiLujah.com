'use client';

import { hideAuthGate, useAuthGateOpen } from '@/lib/torahsings/auth-gate';
import { SignInGate } from './SignInGate';

/**
 * Mounted once (in the layout). Renders the sign-in gate whenever any component
 * calls showAuthGate() — see lib/auth-gate.ts for why this is global rather than
 * local to each like button.
 */
export function AuthGate() {
  const open = useAuthGateOpen();
  if (!open) return null;
  return <SignInGate onClose={hideAuthGate} />;
}
