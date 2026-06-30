import type { Metadata } from 'next';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { liveBestsellerAverage } from '@/lib/bestseller';

// Media Analytics Dashboard (admin only). Access is enforced client-side (the
// dashboard shows a 403 notice to non-admins) and server-side (every
// /api/analytics admin endpoint requires the admin role).
export const metadata: Metadata = {
  title: 'Media Analytics — JubiLujah',
  robots: { index: false, follow: false },
};
export const revalidate = 3600;

export default function AnalyticsPage() {
  // Computed server-side from the manifest + per-album scores (lib/bestseller).
  return <AnalyticsDashboard avgBestseller={liveBestsellerAverage()} />;
}
