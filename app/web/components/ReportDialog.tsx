'use client';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { reportReview, REASON_LABELS, type ReportReason } from '@/lib/reviews';

// Small modal to report a review for moderation (§10).
const REASONS = Object.keys(REASON_LABELS) as ReportReason[];

export default function ReportDialog({ reviewId, onClose }: { reviewId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await reportReview(reviewId, { reason, detail: detail.trim() || undefined });
      setDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not submit the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rv-modal-backdrop" onClick={onClose}>
      <div className="rv-modal rv-modal-sm" role="dialog" aria-modal="true" aria-label="Report review" onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <h3>Report review</h3>
          <button className="rv-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {done ? (
          <div className="rv-report-done">
            <p>Thank you. A moderator will review this report.</p>
            <div className="rv-modal-actions"><span className="rv-spacer" /><button className="rv-btn rv-btn-primary" onClick={onClose} type="button">Close</button></div>
          </div>
        ) : (
          <>
            <label className="rv-field">
              <span className="rv-field-label">Reason</span>
              <select className="rv-input" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
                {REASONS.map((r) => <option key={r} value={r}>{REASON_LABELS[r]}</option>)}
              </select>
            </label>
            <label className="rv-field">
              <span className="rv-field-label">Details <span className="rv-opt">(optional)</span></span>
              <textarea className="rv-textarea" rows={3} maxLength={1000} value={detail} onChange={(e) => setDetail(e.target.value)} />
            </label>
            {err && <div className="rv-error">{err}</div>}
            <div className="rv-modal-actions">
              <span className="rv-spacer" />
              <button className="rv-btn rv-btn-ghost" onClick={onClose} disabled={busy} type="button">Cancel</button>
              <button className="rv-btn rv-btn-primary" onClick={submit} disabled={busy} type="button">{busy ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
