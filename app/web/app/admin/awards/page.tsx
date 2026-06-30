'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Nom { id: string; rateable_type: string; rateable_id: string; nominator_name: string; reason: string; category_id: string }
interface Period { id: string; category_id: string; category_name: string; rateable_type: string; status: string }

const YEAR = 2026;

export default function AdminAwards() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [noms, setNoms] = useState<Nom[]>([]);

  useEffect(() => {
    api.get<Period[]>(`/api/awards/periods/${YEAR}`).then(setPeriods).catch(() => {});
    api.get<Nom[]>(`/api/awards/nominations?period=${YEAR}`).then(setNoms).catch(() => {});
  }, []);

  const byCategory = (catId: string) => noms.filter((n) => n.category_id === catId);

  return (
    <>
      <h2 className="section-title">Awards · Nominees Review {YEAR}</h2>
      <p className="section-sub">Admins hand-pick winners from the nominees below. Nomination count is editorial signal, not a vote.</p>
      {periods.length === 0 && <p className="notice">No award periods configured for {YEAR}.</p>}
      {periods.map((p) => {
        const list = byCategory(p.category_id);
        return (
          <div key={p.id} style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 17, marginBottom: 8 }}>{p.category_name} <span className="muted" style={{ fontSize: 12 }}>({list.length} nominees · {p.status})</span></h3>
            {list.length === 0
              ? <p className="muted" style={{ fontSize: 13 }}>No nominations yet.</p>
              : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {list.map((n) => (
                    <li key={n.id} className="notice">
                      <div style={{ fontSize: 12, color: 'var(--accent-gold)' }}>{n.rateable_type} · nominated by {n.nominator_name}</div>
                      <div style={{ marginTop: 6 }}>{n.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        );
      })}
    </>
  );
}
