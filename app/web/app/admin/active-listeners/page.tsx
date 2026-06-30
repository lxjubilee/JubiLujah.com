import type { Metadata } from 'next';
import ActiveListeners from '@/components/ActiveListeners';

export const metadata: Metadata = {
  title: 'Active Listeners — JubiLujah',
  robots: { index: false, follow: false },
};

export default function ActiveListenersPage() {
  return <ActiveListeners />;
}
