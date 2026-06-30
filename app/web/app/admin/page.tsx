'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Pipeline { counts: Record<string, number> }
interface Audit { id: string; action: string; target_type: string; actor: string | null; created_at: string }

const STAGES = ['concept', 'lyrics_drafting', 'lyrics_approved', 'song_generation', 'qa_review', 'engineering', 'sunil_approval', 'final_approval', 'published', 'distributed'];

export default function AdminOverview() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [audit, setAudit] = useState<Audit[]>([]);

  useEffect(() => {
    api.get<Pipeline>('/api/pipeline').then((p) => setCounts(p.counts || {})).catch(() => {});
    api.get<Audit[]>('/api/admin/audit').then(setAudit).catch(() => {});
  }, []);

  return (
    <>
      <h2 className="section-title">Pipeline at a glance</h2>
      <div className="kpi-row">
        {STAGES.filter((s) => counts[s]).map((s) => (
          <div className="kpi" key={s}><div className="n">{counts[s]}</div><div className="l">{s.replace(/_/g, ' ')}</div></div>
        ))}
        {Object.keys(counts).length === 0 && <p className="notice">No songs are in the pipeline yet.</p>}
      </div>

      <h2 className="section-title" style={{ marginTop: 28 }}>Recent activity</h2>
      <table className="admin-table">
        <thead><tr><th>When</th><th>Action</th><th>Target</th><th>Actor</th></tr></thead>
        <tbody>
          {audit.map((a) => (
            <tr key={a.id}>
              <td className="muted">{new Date(a.created_at).toLocaleString()}</td>
              <td><code>{a.action}</code></td>
              <td>{a.target_type}</td>
              <td>{a.actor || '—'}</td>
            </tr>
          ))}
          {audit.length === 0 && <tr><td colSpan={4} className="muted">No audit entries yet.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
