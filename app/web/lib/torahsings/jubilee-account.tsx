'use client';

/**
 * Jubilee Account — the signed-in session.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IDENTITY IS REAL. SUBSCRIPTION IS NOT — YET.
 *
 * Identity comes from torahsings-api: `GET /api/auth/me` resolves the Bearer
 * token minted at sign-in. torahsings-api is the session authority; in `ji` mode
 * it delegates the password check to JubileeInspire (the credential authority)
 * and mints its own tokens. Signing in happens on /signin, not here.
 *
 * Subscription state has no endpoint yet — the subscriptions router is not
 * mounted, and `/api/auth/me` returns only { authenticated, user, roles }. So
 * `subscription` is still SIMULATED in localStorage, which is what keeps the
 * gating surface (albums, lessons, articles, the book) exercisable. `isStub`
 * now means exactly that: your account is real, your membership is pretend.
 *
 * When the subscriptions router comes up, read it in `load()` and delete
 * `simulatedSubscription` + `subscribe`'s local branch.
 * ────────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Entitlement } from './access';
import { api } from '@/lib/api';
import { clearTokens, getRefreshToken } from '@/lib/auth';

export interface JubileeSubscription {
  status: 'active' | 'none';
  plan: 'yearly' | null;
  /** ISO date. Null when there is no active plan. */
  renewsAt: string | null;
}

export interface JubileeSession {
  userId: string;
  displayName: string;
  email: string;
  subscription: JubileeSubscription;
  /**
   * RBAC roles as `/api/auth/me` reports them, privilege-ordered upstream:
   * viewer < reviewer < content_editor < executive < admin. Empty when the API
   * sends none.
   */
  roles: string[];
}

/** The role that opens the admin surface — `requireRole('admin')` on the API. */
export const ADMIN_ROLE = 'admin';

type Status = 'loading' | 'ready';

interface JubileeContextValue {
  session: JubileeSession | null;
  status: Status;
  entitlement: Entitlement;
  /**
   * The signed-in user holds the `admin` role. Presentation only — it decides
   * what the UI offers, never what the caller may do. Every admin endpoint is
   * gated server-side by `requireRole('admin')`, which is the actual boundary.
   */
  isAdmin: boolean;
  /** True while the local stub is standing in for real SSO. */
  isStub: boolean;
  signIn: () => void;
  signOut: () => void;
  /**
   * Permanently delete THIS site's account (DELETE /api/auth/account). Local to
   * TorahSings only — it never calls JubileeInspire, so the shared Jubilee
   * Account and every other site keep working. Rejects on failure (the caller
   * surfaces it); clears the session only on success.
   */
  deleteAccount: () => Promise<void>;
  /**
   * Change the signed-in user's password (POST /api/auth/change-password). THIS
   * device stays signed in — its refresh token is passed through so only OTHER
   * devices are revoked. Rejects with ApiError on failure (wrong current
   * password → 401, JI rejection → 422/409/502); the caller surfaces the
   * message. In prod (ji mode) the API delegates the write to JubileeInspire and
   * only resolves when JI accepts it.
   */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** Begins checkout. Against real SSO this hands off to Jubilee billing. */
  subscribe: () => void;
  /** Buys the book on its own. Null when no billing endpoint is configured. */
  purchaseBook: (() => void) | null;
}

/** Simulated membership, until the subscriptions router is mounted. */
const SUB_KEY = 'torah-sings.simulated-subscription';

const JubileeContext = createContext<JubileeContextValue | null>(null);

/** GET /api/auth/me never 401s — it answers 200 either way. See docs/API.md §7.2. */
interface MeResponse {
  authenticated: boolean;
  user?: { id: string; email: string; displayName?: string | null };
  roles?: string[];
}

function simulatedSubscription(): JubileeSubscription {
  try {
    if (window.localStorage.getItem(SUB_KEY) === 'active') {
      return { status: 'active', plan: 'yearly', renewsAt: nextYearISO() };
    }
  } catch {
    /* storage unavailable */
  }
  return { status: 'none', plan: null, renewsAt: null };
}

function setSimulatedSubscription(active: boolean) {
  try {
    if (active) window.localStorage.setItem(SUB_KEY, 'active');
    else window.localStorage.removeItem(SUB_KEY);
  } catch {
    /* storage unavailable */
  }
}

function nextYearISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function JubileeAccountProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<JubileeSession | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  /** The account is real; the membership on it is simulated. */
  const isStub = true;

  const load = useCallback(async () => {
    try {
      // api.get refreshes the access token transparently when it has expired.
      const me = await api.get<MeResponse>('/api/auth/me');
      if (!me?.authenticated || !me.user) {
        setSession(null);
      } else {
        setSession({
          userId: me.user.id,
          displayName: me.user.displayName || me.user.email,
          email: me.user.email,
          subscription: simulatedSubscription(),
          roles: me.roles ?? [],
        });
      }
    } catch {
      // A network blip must not look like a sign-out; api.ts only clears tokens
      // when a refresh is definitively rejected.
      setSession(null);
    }
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Credentials are collected on /signin — send them there and come back. */
  const signIn = useCallback(() => {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/signin?returnTo=${next}`;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* signing out locally matters more than the server round-trip */
    }
    clearTokens();
    setSimulatedSubscription(false);
    setSession(null);
    window.location.assign('/');
  }, []);

  const deleteAccount = useCallback(async () => {
    // Deletes ONLY the local TorahSings account (server-side purgeUserAccount).
    // No JubileeInspire call is made, by design — the shared Jubilee Account and
    // other platforms are untouched. Unlike signOut this is NOT best-effort: if
    // the request fails we throw and keep the session, so the user isn't told
    // their account is gone when it isn't. Redirect is left to the caller.
    await api.del('/api/auth/account');
    clearTokens();
    setSimulatedSubscription(false);
    setSession(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    // Pass THIS device's refresh token so the API revokes every OTHER device but
    // keeps us signed in. On failure api.post throws ApiError carrying the
    // server's message (wrong current password, JI rejection, etc.); the caller
    // shows it. No local token/session change on success — this device stays put.
    await api.post('/api/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
      refreshToken: getRefreshToken() ?? undefined,
    });
  }, []);

  /** Simulated until the subscriptions router is mounted — see the file header. */
  const subscribe = useCallback(() => {
    setSimulatedSubscription(true);
    setSession((prev) => (prev ? { ...prev, subscription: simulatedSubscription() } : prev));
  }, []);

  /**
   * The standalone book purchase. Null while there is no billing endpoint,
   * rather than a button that quietly does nothing — the UI reads the null and
   * says so.
   */
  const purchaseBook = useMemo(() => null, []);

  const value = useMemo<JubileeContextValue>(
    () => ({
      session,
      status,
      entitlement: session?.subscription.status === 'active' ? 'member' : 'guest',
      isAdmin: session?.roles.includes(ADMIN_ROLE) ?? false,
      isStub,
      signIn,
      signOut,
      deleteAccount,
      changePassword,
      subscribe,
      purchaseBook,
    }),
    [session, status, isStub, signIn, signOut, deleteAccount, changePassword, subscribe, purchaseBook],
  );

  return <JubileeContext.Provider value={value}>{children}</JubileeContext.Provider>;
}

export function useJubileeAccount(): JubileeContextValue {
  const ctx = useContext(JubileeContext);
  if (!ctx) throw new Error('useJubileeAccount must be used inside <JubileeAccountProvider>');
  return ctx;
}
