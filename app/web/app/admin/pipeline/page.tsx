'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Item { rateable_type: string; rateable_id: string; current_stage: string; entered_stage_at: string }
interface Resp { items: Item[]; counts: Record<string, number> }

export default function AdminPipeline() {
  const [data, setData] = useState<Resp>({ items: [], counts: {} });

  useEffect(() => { api.get<Resp>('/api/pipeline').then(setData).catch(() => {}); }, []);

  return (
    <>
      <h2 className="section-title">Production pipeline</h2>
      <div className="kpi-row">
        {Object.entries(data.counts).map(([stage, n]) => (
          <div className="kpi" key={stage}><div className="n">{n}</div><div className="l">{stage.replace(/_/g, ' ')}</div></div>
        ))}
      </div>
      <table className="admin-table">
        <thead><tr><th>Type</th><th>ID</th><th>Stage</th><th>Entered</th></tr></thead>
        <tbody>
          {data.items.map((it) => (
            <tr key={`${it.rateable_type}:${it.rateable_id}`}>
              <td>{it.rateable_type}</td>
              <td className="muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>{it.rateable_id.slice(0, 8)}…</td>
              <td><span className="status-pill studio">{it.current_stage.replace(/_/g, ' ')}</span></td>
              <td className="muted">{new Date(it.entered_stage_at).toLocaleString()}</td>
            </tr>
          ))}
          {data.items.length === 0 && <tr><td colSpan={4} className="muted">Nothing in the pipeline. Transition a song via POST /api/pipeline/song/&#123;id&#125;/transition.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
