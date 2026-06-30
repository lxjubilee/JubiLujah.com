import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PlaylistApp from '@/components/PlaylistApp';

// A single user playlist rendered as a music page. URL: /playlist?id=<uuid>
// The playlist itself is fetched client-side (it's user-owned, Bearer-auth).
export const metadata: Metadata = {
  title: 'Playlist — JubiLujah',
  robots: { index: false, follow: false },
};

export default function PlaylistPage({ searchParams }: { searchParams: { id?: string; autoplay?: string } }) {
  const id = searchParams.id;
  if (!id) notFound();
  return (
    <div className="album-exec-wrap">
      <PlaylistApp id={id} autoplay={searchParams.autoplay === '1'} />
    </div>
  );
}
