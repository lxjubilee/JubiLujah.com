'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { ApiError } from '@/lib/api';
import {
  getMySubscription, getBilling, cancelSubscription, reactivateSubscription, changePlan, confirmCheckout,
  type SubscriptionView, type Entitlement,
} from '@/lib/subscription';

const STATUS_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Payment due', payment_failed: 'Payment failed',
  cancelled: 'Cancelled', expired: 'Expired', suspended: 'Suspended', free: 'Free',
};

function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

export default function MySubscription() {
  const { loading: authLoading, authenticated, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [sub, setSub] = useState<SubscriptionView | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const justSubscribed = params.get('checkout') === 'success';
  const sessionId = params.get('session_id');

  const load = useCallback(async () => {
    try {
      const [me, billing] = await Promise.all([getMySubscription(), getBilling().catch(() => ({ payments: [], renewals: [] }))]);
      setEntitlement(me.entitlement);
      setSub(me.subscription);
      setPayments(billing.payments || []);
    } catch {
      setErr('Could not load your subscription.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !authenticated) { router.replace('/signin?returnTo=/account/subscription'); return; }
    if (!authenticated) return;
    // On return from the gateway, verify + activate the session server-side
    // BEFORE loading, so the page shows the live subscription immediately
    // (works locally without a webhook tunnel; idempotent with the webhook).
    (async () => {
      if (sessionId) {
        try {
          const r = await confirmCheckout(sessionId);
          if (r.activated) setOk('Your subscription is active. Welcome to JubiLujah Premium!');
          else if (r.pending) setOk('Payment received — finalizing your subscription. This can take a moment.');
        } catch { /* fall through to load; webhook may still activate */ }
      } else if (justSubscribed) {
        setOk('Your subscription is active. Welcome to JubiLujah Premium!');
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authenticated]);

  const act = async (fn: () => Promise<any>, successMsg: string) => {
    setErr(null); setOk(null); setBusy(true);
    try {
      await fn();
      await load();
      setOk(successMsg);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (authLoading || loading) {
    return <div className="account-page"><div className="container acct-shell" style={{ paddingTop: 64 }}><p className="acct-msg">Loading…</p></div></div>;
  }

  const isPaid = !!entitlement?.isPaid;
  const planName = entitlement?.plan?.name || (isPaid ? sub?.plan_name : 'Free');
  const status = sub?.status || entitlement?.status || 'free';
  const willNotRenew = !!sub?.cancel_at_period_end;

  return (
    <div className="account-page">
      <section className="acct-hero">
        <div className="container acct-shell">
          <div className="acct-id">
            <div className="acct-avatar" aria-hidden="true">{(user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase()}</div>
            <div className="acct-id-text">
              <div className="acct-eyebrow">My Subscription</div>
              <h1 className="acct-h1">{planName} plan</h1>
              <p className="acct-sub"><Link className="pl-link" href="/account">← Back to account</Link></p>
            </div>
          </div>
        </div>
      </section>

      <div className="container acct-shell">
        {ok && <p className="acct-msg ok">{ok}</p>}
        {err && <p className="acct-msg err">{err}</p>}

        {!isPaid ? (
          /* ---- Free user: upsell ---- */
          <div className="acct-card">
            <div className="acct-card-head">
              <h2 className="acct-card-title">You’re on the Free plan</h2>
              <p className="acct-card-note">
                You can listen to {entitlement?.dailySongLimit ?? 36} full songs each day. Upgrade for unlimited streaming with no interruptions.
              </p>
            </div>
            <Link className="btn primary" href="/subscription">Upgrade to Unlimited Listening</Link>
          </div>
        ) : (
          <>
            {/* ---- Current plan summary ---- */}
            <div className="acct-card">
              <div className="acct-card-head">
                <h2 className="acct-card-title">Current plan</h2>
              </div>
              <div className="sub-detail-grid">
                <div><span className="sub-detail-label">Plan</span><span className="sub-detail-value">{planName}</span></div>
                <div><span className="sub-detail-label">Status</span><span className={`sub-status sub-status-${status}`}>{STATUS_LABEL[status] || status}{willNotRenew ? ' · ends at period end' : ''}</span></div>
                <div><span className="sub-detail-label">{willNotRenew ? 'Access until' : 'Renews on'}</span><span className="sub-detail-value">{fmtDate(sub?.current_period_end)}</span></div>
                <div><span className="sub-detail-label">Next billing amount</span><span className="sub-detail-value">{willNotRenew ? '—' : (sub?.next_billing_amount || '—')}</span></div>
                <div><span className="sub-detail-label">Payment method</span><span className="sub-detail-value">{sub?.provider === 'stripe' ? 'Card (Stripe)' : sub?.provider === 'mock' ? 'Test gateway' : '—'}</span></div>
                <div><span className="sub-detail-label">Member since</span><span className="sub-detail-value">{fmtDate(sub?.started_at)}</span></div>
                <div className="sub-detail-wide"><span className="sub-detail-label">Subscription reference</span><span className="sub-detail-value sub-detail-mono">{sub?.reference || sub?.id || '—'}</span></div>
              </div>

              <div className="acct-actions sub-actions">
                {/* The "UPGRADE" link relocates here once a user is on a paid plan
                    (it's removed from the category bar in Header.tsx). */}
                <Link className="btn ghost" href="/subscription">UPGRADE</Link>
                {willNotRenew ? (
                  <button className="btn primary" disabled={busy} onClick={() => act(reactivateSubscription, 'Your subscription will continue to renew.')}>Reactivate subscription</button>
                ) : (
                  <>
                    {sub?.plan_code === 'individual' && (
                      <button className="btn primary" disabled={busy} onClick={() => act(() => changePlan('family'), 'You’re now on the Family plan.')}>Upgrade to Family</button>
                    )}
                    {sub?.plan_code === 'family' && (
                      <button className="btn ghost" disabled={busy} onClick={() => act(() => changePlan('individual'), 'You’re now on the Individual plan.')}>Switch to Individual</button>
                    )}
                    <button className="btn ghost danger" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel subscription</button>
                  </>
                )}
              </div>
            </div>

            {/* ---- Billing history ---- */}
            <div className="acct-card">
              <div className="acct-card-head"><h2 className="acct-card-title">Billing history</h2></div>
              {payments.length === 0 ? (
                <p className="acct-card-note">No payments yet.</p>
              ) : (
                <table className="admin-table">
                  <thead><tr><th>Date</th><th>Description</th><th>Transaction #</th><th>Amount</th><th>Status</th><th>Invoice</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{fmtDate(p.paid_at || p.created_at)}</td>
                        <td>{p.description || 'Subscription'}</td>
                        <td className="sub-detail-mono">{p.provider_invoice_id || p.provider_payment_intent || p.id?.slice(0, 8)}</td>
                        <td>{p.amount_display}</td>
                        <td style={{ textTransform: 'capitalize' }}>{p.status}</td>
                        <td>
                          {p.invoice_url || p.invoice_pdf_url ? (
                            <span className="sub-invoice-links">
                              {p.invoice_url ? <a className="pl-link" href={p.invoice_url} target="_blank" rel="noopener noreferrer">View</a> : null}
                              {p.invoice_url && p.invoice_pdf_url ? ' · ' : null}
                              {p.invoice_pdf_url ? <a className="pl-link" href={p.invoice_pdf_url} target="_blank" rel="noopener noreferrer">Download</a> : null}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {confirmCancel && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setConfirmCancel(false); }}>
          <div className="modal-card" role="dialog" aria-modal="true">
            <h3 className="modal-title">Cancel your subscription?</h3>
            <p className="modal-body">
              Your subscription will stay active until <strong>{fmtDate(sub?.current_period_end)}</strong>, then it won’t renew.
              You’ll keep unlimited listening until then. You can reactivate anytime before it ends.
            </p>
            <div className="modal-actions">
              <button className="btn ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep subscription</button>
              <button className="btn danger" disabled={busy} onClick={() => act(() => cancelSubscription(false), 'Your subscription will not renew.')}>{busy ? 'Cancelling…' : 'Yes, cancel'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
