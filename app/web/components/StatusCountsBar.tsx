import { statusCounts } from '@/lib/manifest';

// Server component — Ready/Studio rollup pills (album-status.js equivalent).
export default function StatusCountsBar({ scope = 'all' }: { scope?: string }) {
  const c = statusCounts(scope);
  return (
    <div className="album-status-bar" style={{ margin: '18px 0' }}>
      <span className="status-pill ready" style={{ marginRight: 10 }}>
        Ready {c.ready.albums} albums · {c.ready.songs.toLocaleString()} songs
      </span>
      <span className="status-pill studio">
        Studio {c.studio.albums} albums · {c.studio.songs.toLocaleString()} songs
      </span>
    </div>
  );
}
