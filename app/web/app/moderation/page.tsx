import type { Metadata } from 'next';
import ModerationDashboard from '@/components/ModerationDashboard';

// Admin review-moderation dashboard (§11). Access is enforced both client-side
// (the dashboard renders an access notice for non-admins) and server-side (the
// /api/admin/reviews endpoints require the admin role).
export const metadata: Metadata = {
  title: 'Review Moderation — JubiLujah',
  robots: { index: false, follow: false },
};

export default function ModerationPage() {
  return (
    <div className="rv-page-wrap">
      <ModerationDashboard />
    </div>
  );
}
