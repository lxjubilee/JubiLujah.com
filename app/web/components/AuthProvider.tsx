'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { clearTokens, getRefreshToken } from '@/lib/auth';

// Mirrors the server RBAC ladder (api/src/config.js ROLE_ORDER), weakest→strongest.
const ROLE_ORDER = ['viewer', 'reviewer', 'content_editor', 'executive', 'admin'];

// Roles that may preview in-production ("studio") albums hidden from ordinary
// viewers and signed-out visitors. Checked by explicit membership rather than the
// hasRole ladder, so `reviewer` grants studio visibility WITHOUT inheriting any
// higher pipeline/admin powers. Executive + Admin are the privileged tier that
// sees studio content (and its gold "needs work" border); reviewer is the
// purpose-built studio-preview role, kept here too.
const STUDIO_ROLES = ['admin', 'executive', 'reviewer'];

interface MeResponse {
  authenticated: boolean;
  user?: { id: string; email: string; displayName: string };
  roles?: string[];
}

interface AuthCtx {
  loading: boolean;
  authenticated: boolean;
  user: MeResponse['user'] | null;
  roles: string[];
  hasRole: (min: string) => boolean;
  canSeeStudio: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  loading: true, authenticated: false, user: null, roles: [],
  hasRole: () => false, canSeeStudio: false, refresh: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MeResponse>({ authenticated: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/api/auth/me');
      setState(me);
    } catch {
      setState({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep the session warm: periodically re-validate (which transparently mints a
  // fresh access token via the refresh token) so a long-running or idle tab never
  // silently lapses, and so fire-and-forget calls (play events, now-playing
  // heartbeat) always have a usable token. Only runs while a refresh token exists.
  useEffect(() => {
    const t = setInterval(() => { if (getRefreshToken()) refresh(); }, 25 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout', { refreshToken: getRefreshToken() }); } catch { /* ignore */ }
    clearTokens();
    // Drop any persisted now-playing state so a signed-out guest doesn't resume audio.
    try { sessionStorage.removeItem('jvPlayerState'); } catch { /* ignore */ }
    setState({ authenticated: false });
    window.location.href = '/';
  }, []);

  const hasRole = useCallback((min: string) => {
    const roles = state.roles || [];
    const lvl = roles.reduce((max, r) => Math.max(max, ROLE_ORDER.indexOf(r)), -1);
    return lvl >= ROLE_ORDER.indexOf(min);
  }, [state.roles]);

  // Studio-album visibility: signed-out guests and plain viewers see READY only;
  // Admin / Executive (and the reviewer role) see everything. Defaults to false
  // during load and SSR, so the first render hides studio albums and only reveals
  // them once an authorized session resolves.
  const canSeeStudio = (state.roles || []).some((r) => STUDIO_ROLES.includes(r));

  return (
    <Ctx.Provider value={{
      loading,
      authenticated: !!state.authenticated,
      user: state.user || null,
      roles: state.roles || [],
      hasRole, canSeeStudio, refresh, logout,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
