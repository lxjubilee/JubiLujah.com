import type { Metadata } from 'next';
import PublishToProduction from '@/components/PublishToProduction';

export const metadata: Metadata = {
  title: 'Publish to Production — JubiLujah',
  robots: { index: false, follow: false },
};

export default function PublishToProductionPage() {
  return <PublishToProduction />;
}
