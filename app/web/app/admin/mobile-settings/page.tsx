import type { Metadata } from 'next';
import MobileAppSettings from '@/components/MobileAppSettings';

export const metadata: Metadata = {
  title: 'Mobile App Settings — JubileePraise Admin',
  robots: { index: false, follow: false },
};

export default function MobileAppSettingsPage() {
  return <MobileAppSettings />;
}
