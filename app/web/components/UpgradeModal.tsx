'use client';
import { useRouter } from 'next/navigation';
import { useUpgradeModal } from '@/stores/upgradeModal';

// ============================================================================
// Shown when a Free-plan listener hits their daily limit and a track is paused
// at the 1-minute preview. Reuses the site's modal-overlay / modal-card chrome.
// ============================================================================
export default function UpgradeModal() {
  const router = useRouter();
  const open = useUpgradeModal((s) => s.open);
  const hide = useUpgradeModal((s) => s.hide);
  const info = useUpgradeModal((s) => s.info);

  if (!open) return null;

  const go = (path: string) => { hide(); router.push(path); };
  const limit = info?.daily_limit ?? 36;
  // Two reasons to be here, and they ask for different things: the daily cap is
  // "come back tomorrow, or subscribe"; the end of the free period is "subscribe".
  const expired = info?.mode === 'expired';
  const days = info?.free_access_days ?? 30;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) hide(); }}>
      <div className="modal-card sub-upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upg-title">
        <button type="button" className="sub-upgrade-close" onClick={hide} aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
        </button>
        <div className="sub-upgrade-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" /></svg>
        </div>
        {expired ? (
          <>
            <h3 id="upg-title" className="modal-title" style={{ textAlign: 'center' }}>Your Free {days} Days Are Complete</h3>
            <p className="modal-body" style={{ textAlign: 'center' }}>
              We hope this music has blessed you. To keep listening, start your subscription. It keeps
              the music playing for you and supports this ministry in sharing it with others.
            </p>
          </>
        ) : (
          <>
            <h3 id="upg-title" className="modal-title" style={{ textAlign: 'center' }}>Enjoy Unlimited Christian Music</h3>
            <p className="modal-body" style={{ textAlign: 'center' }}>
              You’ve reached your free daily listening limit of {limit} songs. Upgrade your subscription to enjoy
              unlimited streaming without interruptions.
              {typeof info?.free_days_left === 'number' && info.free_days_left > 0 && (
                <> Your free plan has {info.free_days_left} {info.free_days_left === 1 ? 'day' : 'days'} left.</>
              )}
            </p>
          </>
        )}
        <div className="sub-upgrade-actions">
          <button className="btn primary" onClick={() => go('/subscription#plans')}>{expired ? 'Start My Subscription' : 'Subscribe Now'}</button>
          <button className="btn ghost" onClick={() => go('/subscription')}>View Plans</button>
          <button className="gate-dismiss" type="button" onClick={hide}>Maybe Later</button>
        </div>
      </div>
    </div>
  );
}
