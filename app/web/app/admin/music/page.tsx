import type { Metadata } from 'next';
import ManageMusic from '@/components/ManageMusic';

export const metadata: Metadata = {
  title: 'Manage Music — JubiLujah Admin',
  robots: { index: false, follow: false },
};

export default function ManageMusicPage() {
  return <ManageMusic />;
}
