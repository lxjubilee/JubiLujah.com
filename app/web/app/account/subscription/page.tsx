import type { Metadata } from 'next';
import { Suspense } from 'react';
import MySubscription from '@/components/MySubscription';

export const metadata: Metadata = {
  title: 'My Subscription',
  description: 'Manage your JubiLujah subscription, billing, and plan.',
};

export default function MySubscriptionPage() {
  return (
    <Suspense fallback={<div className="account-page"><div className="container acct-shell" style={{ paddingTop: 64 }}><p className="acct-msg">Loading…</p></div></div>}>
      <MySubscription />
    </Suspense>
  );
}
