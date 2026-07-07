'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getPlans, getMySubscription, startCheckout, type Plan, type Entitlement } from '@/lib/subscription';
import { ApiError } from '@/lib/api';

const CHECK = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const CROSS = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

// Comparison matrix (BRD §Plan Comparison Table). value: true | false | string.
const COMPARISON: { feature: string; free: boolean | string; individual: boolean | string; family: boolean | string }[] = [
  { feature: 'Full songs per day', free: '36', individual: 'Unlimited', family: 'Unlimited' },
  { feature: 'Unlimited streaming', free: false, individual: true, family: true },
  { feature: 'Unlimited albums', free: false, individual: true, family: true },
  { feature: 'Unlimited songs', free: false, individual: true, family: true },
  { feature: 'Ratings & reviews', free: true, individual: true, family: true },
  { feature: 'Listening history', free: true, individual: true, family: true },
  { feature: 'Personal playlists', free: true, individual: true, family: true },
  { feature: 'Family accounts', free: false, individual: false, family: '6 total' },
  { feature: 'Individual member profiles', free: false, individual: false, family: true },
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <svg className="sub-cmp-ok" viewBox="0 0 24 24" width="20" height="20"><path d={CHECK} /></svg>;
  if (v === false) return <svg className="sub-cmp-no" viewBox="0 0 24 24" width="20" height="20"><path d={CROSS} /></svg>;
  return <span className="sub-cmp-val">{v}</span>;
}

export default function SubscriptionPlans() {
  const { authenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cancelled = params.get('checkout') === 'cancelled';

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, me] = await Promise.all([
          getPlans(),
          authenticated ? getMySubscription().catch(() => null) : Promise.resolve(null),
        ]);
        if (!alive) return;
        setPlans(p.plans);
        setEntitlement(me?.entitlement ?? null);
      } catch {
        if (alive) setErr('Could not load plans. Please try again.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authenticated]);

  const currentCode = entitlement?.isPaid ? entitlement.subscription?.plan_code : 'free';

  const subscribe = async (plan: Plan) => {
    setErr(null);
    if (!plan.is_paid) {
      // Free plan: route guests to sign up, members already have it.
      if (!authenticated) router.push('/signup?returnTo=/subscription');
      return;
    }
    if (!authenticated) {
      router.push('/signin?returnTo=/subscription');
      return;
    }
    if (entitlement?.isPaid && currentCode !== plan.code) {
      // Already subscribed to a different paid plan → manage it (upgrade/downgrade).
      router.push('/account/subscription');
      return;
    }
    setBusy(plan.code);
    try {
      const res = await startCheckout(plan.code);
      window.location.href = res.url;       // gateway-hosted checkout (or success path for mock)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not start checkout. Please try again.');
      setBusy(null);
    }
  };

  const ctaFor = (plan: Plan) => {
    if (currentCode === plan.code) return 'Your current plan';
    if (!plan.is_paid) return authenticated ? 'Included free' : 'Get started free';
    if (entitlement?.isPaid) return plan.price_cents > (entitlement.plan?.price_cents ?? 0) ? 'Upgrade' : 'Switch plan';
    return plan.cta_label || 'Start Your Subscription';
  };

  return (
    <div className="sub-page">
      {/* ---- Hero ---- */}
      <section className="sub-hero">
        <div className="container">
          <h1 className="sub-hero-title">Choose the Perfect Plan for Unlimited Christian Music</h1>
        </div>
      </section>

      <div className="container">
        {cancelled && <p className="acct-msg" style={{ marginTop: 24 }}>Checkout was cancelled — no charge was made. You can pick a plan again whenever you’re ready.</p>}
        {err && <p className="acct-msg err" style={{ marginTop: 24 }}>{err}</p>}

        {/* ---- Pricing cards ---- */}
        <section id="plans" className="sub-cards">
          {loading || authLoading ? (
            <p className="notice">Loading plans…</p>
          ) : (
            <div className="sub-card-grid">
              {plans.map((plan) => {
                const isCurrent = currentCode === plan.code;
                return (
                  <div key={plan.code} className={`sub-card${plan.highlighted ? ' featured' : ''}${isCurrent ? ' current' : ''}`}>
                    {plan.highlighted && <div className="sub-badge">Recommended</div>}
                    {isCurrent && <div className="sub-badge current">Current plan</div>}
                    <h3 className="sub-card-name">{plan.name}</h3>
                    <p className="sub-card-tagline">{plan.tagline}</p>
                    <div className="sub-card-price">
                      <span className="sub-price-amount">{plan.price_display}</span>
                      {plan.is_paid && <span className="sub-price-period">/ month</span>}
                    </div>
                    <p className="sub-card-desc">{plan.description}</p>
                    <ul className="sub-feature-list">
                      {plan.features.map((f, i) => (
                        <li key={i}><svg viewBox="0 0 24 24" width="16" height="16"><path d={CHECK} /></svg><span>{f}</span></li>
                      ))}
                    </ul>
                    <button
                      className={`btn ${plan.highlighted ? 'primary' : 'ghost'} sub-card-cta`}
                      onClick={() => subscribe(plan)}
                      disabled={isCurrent || busy === plan.code}
                    >
                      {busy === plan.code ? 'Starting…' : ctaFor(plan)}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- Comparison table ---- */}
        <section className="sub-compare">
          <h2 className="section-title">Compare plans</h2>
          <div className="sub-cmp-scroll">
            <table className="sub-cmp-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Free</th>
                  <th className="featured">Individual</th>
                  <th>Family</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="sub-cmp-feature">{row.feature}</td>
                    <td><Cell v={row.free} /></td>
                    <td className="featured"><Cell v={row.individual} /></td>
                    <td><Cell v={row.family} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sub-fineprint">
            Plans renew automatically each month until cancelled. Manage or cancel anytime from{' '}
            <a className="pl-link" href="/account/subscription">My Subscription</a>. Prices in USD.
          </p>
        </section>
      </div>
    </div>
  );
}
