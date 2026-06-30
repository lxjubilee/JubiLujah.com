'use client';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from './AuthProvider';

interface Period { id: string; category_name: string; rateable_type: string; status: string }
interface Nomination { id: string }

const YEAR = 2026;
const MIN = 250;

// Nominations widget (§11). Songs/albums only; 250-char justification enforced
// client-side (live counter, disabled submit) and server-side (CHECK + 422).
export default function Nominations({ type, id }: { type: 'song' | 'album'; id: string }) {
  const { authenticated, hasRole } = useAuth();
  const [open, setOpen] = useState(false);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState('');
  const [reason, setReason] = useState('');
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadCount = () =>
    api.get<Nomination[]>(`/api/awards/nominations?period=${YEAR}&type=${type}&id=${id}`)
      .then((n) => setCount(n.length)).catch(() => {});

  useEffect(() => { loadCount(); /* eslint-disable-next-line */ }, [type, id]);

  useEffect(() => {
    if (!open) return;
    api.get<Period[]>(`/api/awards/periods/${YEAR}`)
      .then((ps) => setPeriods(ps.filter((p) => p.rateable_type === type && p.status === 'open')))
      .catch(() => {});
  }, [open, type]);

  const trimmed = reason.trim().length;
  const canSubmit = !!periodId && trimmed >= MIN;

  const submit = async () => {
    setErr(null); setMsg(null);
    try {
      await api.post('/api/awards/nominations', { period_id: periodId, rateable_type: type, rateable_id: id, reason });
      setMsg('Nomination submitted for admin review.');
      setReason(''); setOpen(false);
      loadCount();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to submit nomination');
    }
  };

  const canNominate = authenticated && hasRole('content_editor');

  return (
    <div className="jv-nominations" data-nominations-target={`${type}:${id}`}>
      <button className="jv-nominate-btn" onClick={() => canNominate && setOpen(!open)} disabled={!canNominate} title="Nominate for an award">
        🏆 Nominate {count > 0 && <span className="jv-nom-count">{count}</span>}
      </button>
      {!canNominate && <span className="muted" style={{ marginLeft: 8 }}>Sign in as a content editor to nominate.</span>}
      {msg && <div style={{ color: 'var(--success)', marginTop: 6 }}>{msg}</div>}

      {open && canNominate && (
        <div className="jv-nominate-modal">
          <h4>Nominate for Award</h4>
          <p className="muted" style={{ fontSize: 12 }}>Nomination is a recommendation for admin review — not an auto-tallied vote.</p>
          <label>Category
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
              <option value="">Select a category…</option>
              {periods.map((p) => <option key={p.id} value={p.id}>{p.category_name}</option>)}
            </select>
          </label>
          <label>Justification (min {MIN} characters)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={5} placeholder="Explain why this deserves the award…" />
          </label>
          <div className={`jv-char-counter${trimmed < MIN ? ' short' : ' ok'}`}>
            {trimmed} / {MIN} {trimmed < MIN ? `(need ${MIN - trimmed} more)` : '✓'}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn" onClick={submit} disabled={!canSubmit}>Submit nomination</button>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {err && <div style={{ color: 'var(--accent-peach)', marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}
