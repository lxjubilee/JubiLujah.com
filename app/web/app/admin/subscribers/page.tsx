'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Subscriber {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  plan_code: string;
  plan_name: string;
  currency: string;
  billing_interval: 'month' | 'year';
  price_cents: number;
  monthly_cents: number;
  status: 'active' | 'past_due';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  started_at: string | null;
}

interface PlanRollup { plan: string; count: number; monthly_cents_each: number; subtotal_cents: number }

interface SubscribersResponse {
  currency: string;
  count: number;
  monthly_total_cents: number;
  by_plan: PlanRollup[];
  subscribers: Subscriber[];
}

const money = (cents: number, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((cents || 0) / 100);

export default function AdminSubscribers() {
  const [data, setData] = useState<SubscribersResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<SubscribersResponse>('/api/admin/subscribers').then(setData).catch((e) => setErr(e.message));
  }, []);

  return (
    <>
      <h2 className="section-title">Subscribers</h2>
      <p className="section-sub">
        Every paying customer with a live subscription (active or past&nbsp;due), what they pay each month, and the total monthly recurring revenue. Annual plans are shown as their monthly equivalent.
      </p>
      {err && <div className="notice" style={{ borderColor: 'var(--accent)' }}>{err}</div>}

      {data && (
        <div className="kpi-row">
          <div className="kpi">
            <div className="n">{money(data.monthly_total_cents, data.currency)}</div>
            <div className="l">Monthly total (MRR)</div>
          </div>
          <div className="kpi">
            <div className="n">{data.count}</div>
            <div className="l">Paying subscribers</div>
          </div>
          {data.by_plan.map((p) => (
            <div className="kpi" key={p.plan}>
              <div className="n">{money(p.subtotal_cents, data.currency)}</div>
              <div className="l">{p.count}× {p.plan} · {money(p.monthly_cents_each, data.currency)}/mo</div>
            </div>
          ))}
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Customer</th><th>Email</th><th>Plan</th><th>Status</th>
            <th style={{ textAlign: 'right' }}>Monthly</th><th>Renews</th><th>Since</th>
          </tr>
        </thead>
        <tbody>
          {data?.subscribers.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.display_name}</strong></td>
              <td className="muted">{s.email}</td>
              <td>
                {s.plan_name}
                {s.billing_interval === 'year' && (
                  <span className="muted" style={{ fontSize: 11 }}> (billed yearly)</span>
                )}
              </td>
              <td>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                  background: 'var(--surface-2)', border: '1px solid var(--line)',
                  color: s.status === 'active' ? 'var(--success)' : 'var(--accent)',
                }}>
                  {s.status === 'past_due' ? 'past due' : 'active'}
                </span>
                {s.cancel_at_period_end && (
                  <span className="muted" style={{ fontSize: 11 }}> · cancels at period end</span>
                )}
              </td>
              <td style={{ textAlign: 'right', fontWeight: 600 }}>{money(s.monthly_cents, s.currency)}</td>
              <td className="muted">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
              <td className="muted">{s.started_at ? new Date(s.started_at).toLocaleDateString() : '—'}</td>
            </tr>
          ))}
          {data && data.subscribers.length === 0 && (
            <tr><td colSpan={7} className="muted">No paying subscribers yet.</td></tr>
          )}
          {!data && !err && (
            <tr><td colSpan={7} className="muted">Loading…</td></tr>
          )}
        </tbody>
        {data && data.subscribers.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-gold)' }}>
                Monthly total
              </td>
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-gold)' }}>
                {money(data.monthly_total_cents, data.currency)}
              </td>
              <td colSpan={2}></td>
            </tr>
          </tfoot>
        )}
      </table>
    </>
  );
}
