import type { Metadata } from 'next';
import { Suspense } from 'react';
import SubscriptionPlans from '@/components/SubscriptionPlans';

export const metadata: Metadata = {
  title: 'Plans & Pricing',
  description:
    'Choose the perfect plan for unlimited Christian music on JubiLujah.com — worship, gospel, praise, instrumental and devotional music anytime, anywhere.',
};

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: 48 }}><p className="notice">Loading plans…</p></div>}>
      <SubscriptionPlans />
    </Suspense>
  );
}
