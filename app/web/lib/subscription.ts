'use client';
// ============================================================================
// Subscription client. Thin wrappers over the /api/subscriptions + /api/listening
// endpoints using the shared Bearer-auth api client (lib/api.ts).
// ============================================================================
import { api } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

export interface Plan {
  id: string;
  code: string;
  name: string;
  tagline?: string;
  description?: string;
  price_cents: number;
  price_display: string;
  currency: string;
  billing_interval: 'month' | 'year';
  max_members: number;
  daily_song_limit: number | null;   // null = unlimited
  preview_seconds: number;
  is_paid: boolean;
  highlighted: boolean;
  cta_label?: string;
  features: string[];
}

export interface SubscriptionView {
  id: string;
  status: string;
  plan_code: string;
  plan_name: string;
  provider?: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end: boolean;
  cancelled_at?: string | null;
  trial_end?: string | null;
  started_at?: string;
  next_billing_amount?: string | null;
  reference?: string | null;
}

export interface Entitlement {
  isPaid: boolean;
  status: string;
  source: 'individual' | 'family' | 'free';
  plan: Plan | null;
  subscription: SubscriptionView | null;
  dailySongLimit: number | null;
  previewSeconds: number;
}

export interface PlayIntent {
  mode: 'full' | 'limited';
  unlimited: boolean;
  plays_today: number | null;
  daily_limit: number | null;
  remaining: number | null;
  preview_seconds: number;
  status: string;
}

export const getPlans = () => api.get<{ plans: Plan[] }>('/api/subscriptions/plans');
export const getMySubscription = () => api.get<{ entitlement: Entitlement; subscription: SubscriptionView | null }>('/api/subscriptions/me');
export const startCheckout = (plan_code: string) => api.post<{ url: string; activated: boolean; provider: string }>('/api/subscriptions/checkout', { plan_code });
export const confirmCheckout = (session_id: string) => api.post<{ activated: boolean; pending?: boolean; subscription: SubscriptionView | null }>('/api/subscriptions/confirm', { session_id });
export const cancelSubscription = (immediate = false) => api.post<{ subscription: SubscriptionView }>('/api/subscriptions/cancel', { immediate });
export const reactivateSubscription = () => api.post<{ subscription: SubscriptionView }>('/api/subscriptions/reactivate');
export const changePlan = (plan_code: string) => api.post<{ subscription: SubscriptionView }>('/api/subscriptions/change', { plan_code });
export const getBilling = () => api.get<{ payments: any[]; renewals: any[] }>('/api/subscriptions/billing');
export const getBillingPortal = () => api.post<{ url: string }>('/api/subscriptions/portal');

// Free-plan listening enforcement. Called by the player on each NEW track. Fails
// open (full) if the user is signed out or the request errors, so a hiccup never
// hard-blocks playback.
export async function resolvePlayIntent(songId?: string): Promise<PlayIntent | null> {
  if (!getAccessToken()) return null;
  try {
    return await api.post<PlayIntent>('/api/listening/intent', { song_id: songId });
  } catch {
    return null;
  }
}

export const getListeningStatus = () =>
  api.get<{ unlimited: boolean; plays_today: number; daily_limit: number | null; remaining: number | null; preview_seconds: number }>('/api/listening/status');
