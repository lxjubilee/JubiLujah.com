'use client';
import { useState } from 'react';
import StarRating from './StarRating';
import { ApiError } from '@/lib/api';
import { upsertReview, deleteReview, type TargetType, type MyReview, type ReviewSummary } from '@/lib/reviews';

// ============================================================================
// Modal to create / edit / delete the caller's own rating + review for one
// target (album or song). Stars are required; title + comment are optional, so
// the same modal serves both "Rate this Album" and "Write a review".
// ============================================================================

interface Props {
  type: TargetType;
  id: string;
  targetLabel: string;          // e.g. album or song title, shown in the heading
  initial?: MyReview | null;    // existing rating to edit, if any
  onClose: () => void;
  onSaved: (summary: ReviewSummary, mine: MyReview) => void;
  onDeleted?: (summary: ReviewSummary) => void;
}

export default function ReviewComposer({ type, id, targetLabel, initial, onClose, onSaved, onDeleted }: Props) {
  const [stars, setStars] = useState(initial?.stars || 0);
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (stars < 1) { setErr('Please choose a star rating.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await upsertReview(type, id, { stars, title: title.trim() || null, body: body.trim() || null });
      onSaved(res.summary, res.review);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save your review.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await deleteReview(type, id);
      onDeleted?.(res.summary);
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not delete your review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rv-modal-backdrop" onClick={onClose}>
      <div className="rv-modal" role="dialog" aria-modal="true" aria-label="Write a review" onClick={(e) => e.stopPropagation()}>
        <div className="rv-modal-head">
          <h3>{initial ? 'Edit your review' : 'Rate'} <span className="rv-modal-target">{targetLabel}</span></h3>
          <button className="rv-modal-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label className="rv-field">
          <span className="rv-field-label">Your rating <em>*</em></span>
          <StarRating value={stars} onChange={setStars} size="lg" />
        </label>

        <label className="rv-field">
          <span className="rv-field-label">Review title <span className="rv-opt">(optional)</span></span>
          <input
            className="rv-input"
            type="text"
            maxLength={150}
            value={title}
            placeholder="Sum it up in a few words"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="rv-field">
          <span className="rv-field-label">Your review <span className="rv-opt">(optional)</span></span>
          <textarea
            className="rv-textarea"
            maxLength={5000}
            rows={5}
            value={body}
            placeholder="What did you think of it?"
            onChange={(e) => setBody(e.target.value)}
          />
          <span className="rv-charcount">{body.length}/5000</span>
        </label>

        {err && <div className="rv-error">{err}</div>}

        <div className="rv-modal-actions">
          {initial && onDeleted && (
            <button className="rv-btn rv-btn-danger" onClick={remove} disabled={busy} type="button">Delete</button>
          )}
          <span className="rv-spacer" />
          <button className="rv-btn rv-btn-ghost" onClick={onClose} disabled={busy} type="button">Cancel</button>
          <button className="rv-btn rv-btn-primary" onClick={save} disabled={busy} type="button">
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
