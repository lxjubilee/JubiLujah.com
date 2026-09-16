import type { Metadata } from 'next';
import NowPlayingView from '@/components/NowPlayingView';

// THE NOW PLAYING PAGE (owner, 2026-09-16): opened by the footer player's expand
// button, the icon right of the volume control. Like kJubilee's radio player
// page: whatever is on the bar, shown large in the middle of the screen. It is
// about this visitor's own player, so there is nothing here for a crawler.
export const metadata: Metadata = {
  title: 'Now Playing',
  robots: { index: false, follow: true },
};

export default function NowPlayingPage() {
  return <NowPlayingView />;
}
