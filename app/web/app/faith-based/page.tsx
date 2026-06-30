import type { Metadata } from 'next';
import CategoryRows from '@/components/CategoryRows';

export const revalidate = 3600;
export const metadata: Metadata = {
  title: 'Other Artists',
  description: 'Other artists and projects across the Jubilee roster.',
};

export default function OtherArtistsPage() {
  return <CategoryRows categoryKeys={['faith-based']} emptyText="Albums coming soon." />;
}
