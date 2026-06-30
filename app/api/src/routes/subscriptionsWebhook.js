import { Router } from 'express';
import { query } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { getPlanByCode, activateSubscription, monthFrom, findActivatedByProviderSub } from '../services/subscriptions.js';
import { notify, nameParts } from '../services/notifications.js';

// ============================================================================
// Gateway webhook (Stripe). MOUNTED WITH A RAW BODY PARSER in index.js (before
// express.json) so the signature can be verified against the exact bytes Stripe
// signed. Never trust an unsigned/unverifiable event.
//
// Handled events:
//   checkout.session.completed        -> activate the subscription
//   invoice.paid / payment_succeeded  -> record payment + extend the period (renewal)
//   invoice.payment_failed            -> mark past_due + notify
//   customer.subscription.updated     -> mirror status / cancel_at_period_end
//   customer.subscription.deleted     -> mark cancelled
// ============================================================================
const router = Router();

router.post('/', async (req, res) => {
  const provider = getPaymentProvider();
  let event;
  try {
    event = await provider.verifyWebhook({
      rawBody: req.body,                              // Buffer (express.raw)
      signature: req.get('stripe-signature'),
    });
  } catch (err) {
    logger.warn({ err: err?.message }, 'webhook signature verification failed');
    return res.status(400).json({ error: 'invalid_signature' });
  }

  try {
    await handleEvent(event);
  } catch (err) {
    // Log and 500 so the gateway retries; activation is idempotent enough to
    // tolerate replays (existing live subscription is updated in place).
    logger.error({ err, type: event?.type }, 'webhook handler error');
    return res.status(500).json({ error: 'handler_error' });
  }
  res.json({ received: true });
});

async function handleEvent(event) {
  const obj = event?.data?.object || {};
  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = obj.client_reference_id || obj.metadata?.user_id;
      const planCode = obj.metadata?.plan_code;
      if (!userId || !planCode) { logger.warn({ id: obj.id }, 'checkout.session.completed missing refs'); return; }
      const plan = await getPlanByCode(planCode);
      if (!plan) return;
      // Idempotent with the success-page confirm: skip if already activated.
      if (await findActivatedByProviderSub(userId, obj.subscription)) return;
      const periodStart = new Date();
      const user = await loadUser(userId);
      await activateSubscription({
        userId, plan, provider: 'stripe',
        providerCustomerId: obj.customer || null,
        providerSubscriptionId: obj.subscription || null,
        periodStart, periodEnd: monthFrom(periodStart), status: 'active', actor: 'webhook',
        amountCents: obj.amount_total ?? plan.price_cents, currency: obj.currency || plan.currency,
        invoiceId: obj.invoice || null, user,
      });
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      const sub = await subByProviderId(obj.subscription);
      if (!sub) return;
      const periodEnd = obj.lines?.data?.[0]?.period?.end ? new Date(obj.lines.data[0].period.end * 1000) : monthFrom(new Date());
      // Syncing the period is idempotent, so it always runs (handles retries).
      await query(
        `UPDATE production.subscriptions SET status='active', current_period_end=$2, cancel_at_period_end=cancel_at_period_end WHERE id=$1`,
        [sub.id, periodEnd],
      );
      // Idempotency guard: Stripe emits BOTH invoice.paid and
      // invoice.payment_succeeded for the same invoice (and retries on any 5xx),
      // and the very first invoice also overlaps with checkout activation. Only
      // record the payment / renewal / "renewed" email once per invoice. A prior
      // 'failed' row for the same invoice (failed-then-retried) is intentionally
      // left in place — we only dedupe the succeeded record.
      if (obj.id) {
        const already = await query(
          `SELECT 1 FROM production.payment_records WHERE provider_invoice_id=$1 AND status='succeeded' LIMIT 1`,
          [obj.id],
        );
        if (already.rowCount) { logger.info({ invoice: obj.id }, 'invoice already recorded; skipping duplicate'); return; }
      }
      const pay = await query(
        `INSERT INTO production.payment_records
           (subscription_id, user_id, provider, provider_invoice_id, provider_payment_intent, amount_cents, currency, status, description, invoice_url, invoice_pdf_url, paid_at)
         VALUES ($1,$2,'stripe',$3,$4,$5,$6,'succeeded',$7,$8,$9,NOW()) RETURNING id`,
        [sub.id, sub.user_id, obj.id, obj.payment_intent || null, obj.amount_paid ?? 0, obj.currency || 'usd', 'Subscription renewal', obj.hosted_invoice_url || null, obj.invoice_pdf || null],
      );
      await query(
        `INSERT INTO production.subscription_renewals (subscription_id, period_start, period_end, amount_cents, currency, status, payment_record_id)
         VALUES ($1,NOW(),$2,$3,$4,'succeeded',$5)`,
        [sub.id, periodEnd, obj.amount_paid ?? 0, obj.currency || 'usd', pay.rows[0].id],
      );
      await query(
        `INSERT INTO production.subscription_transactions
           (subscription_id, user_id, type, provider, provider_ref, amount_cents, currency, status, metadata)
         VALUES ($1,$2,'renewal','stripe',$3,$4,$5,'succeeded',$6)`,
        [sub.id, sub.user_id, obj.id, obj.amount_paid ?? 0, obj.currency || 'usd', JSON.stringify({ period_end: periodEnd })],
      );
      await query(
        `INSERT INTO production.subscription_history (subscription_id, user_id, event, from_status, to_status, actor)
         VALUES ($1,$2,'renewed',$3,'active','webhook')`,
        [sub.id, sub.user_id, sub.status],
      );
      const renewUser = await loadUser(sub.user_id);
      const { fullName: renewName, firstName: renewFirst } = nameParts(renewUser);
      const renewAmount = obj.amount_paid ?? 0;
      await notify({
        userId: sub.user_id, type: 'renewed', title: 'Your subscription renewed',
        body: 'Thanks for staying with Jubilujah. Your subscription has renewed.',
        metadata: { subscription_id: sub.id },
        email: renewUser?.email ? {
          to: renewUser.email,
          subject: 'Your Jubilujah subscription renewed',
          heading: renewFirst ? `Thanks, ${renewFirst} — your subscription renewed` : 'Your subscription renewed',
          intro: `${renewName ? `Hi ${renewName}, thank you` : 'Thank you'} for staying with Jubilujah.com. Your subscription has renewed and your access continues uninterrupted.`,
          rows: [
            { label: 'Amount', value: renewAmount === 0 ? '—' : `$${(renewAmount / 100).toFixed(2)}` },
            { label: 'Renewed on', value: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
            { label: 'Next renewal', value: new Date(periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
          ],
          ctaLabel: 'Manage subscription', ctaUrl: `${config.webBaseUrl}/account/subscription`,
          note: obj.hosted_invoice_url ? `View your invoice: ${obj.hosted_invoice_url}` : null,
        } : null,
      });
      return;
    }

    case 'invoice.payment_failed': {
      const sub = await subByProviderId(obj.subscription);
      if (!sub) return;
      await query(`UPDATE production.subscriptions SET status='past_due' WHERE id=$1`, [sub.id]);
      await query(
        `INSERT INTO production.payment_records (subscription_id, user_id, provider, provider_invoice_id, amount_cents, currency, status, description, invoice_url, invoice_pdf_url)
         VALUES ($1,$2,'stripe',$3,$4,$5,'failed','Failed renewal charge',$6,$7)`,
        [sub.id, sub.user_id, obj.id, obj.amount_due ?? 0, obj.currency || 'usd', obj.hosted_invoice_url || null, obj.invoice_pdf || null],
      );
      const user = await loadUser(sub.user_id);
      const { fullName: failName } = nameParts(user);
      await notify({
        userId: sub.user_id, type: 'payment_failed', title: 'Your payment failed',
        body: 'We could not process your subscription renewal. Please update your payment method.',
        metadata: { subscription_id: sub.id },
        email: user?.email ? {
          to: user.email, subject: 'Action needed: your Jubilujah payment failed',
          heading: 'Your subscription payment failed',
          intro: `${failName ? `Hi ${failName}, we` : 'We'} were unable to process your latest subscription renewal. Please update your payment method to keep your access uninterrupted.`,
          ctaLabel: 'Update payment', ctaUrl: `${config.webBaseUrl}/account/subscription`,
        } : null,
      });
      return;
    }

    case 'customer.subscription.updated': {
      const sub = await subByProviderId(obj.id);
      if (!sub) return;
      const status = mapStripeStatus(obj.status);
      const periodEnd = obj.current_period_end ? new Date(obj.current_period_end * 1000) : sub.current_period_end;
      // Honour a plan change that happened in the gateway / portal.
      let planId = sub.plan_id;
      const planCode = obj.metadata?.plan_code;
      if (planCode) { const p = await getPlanByCode(planCode); if (p) planId = p.id; }
      await query(
        `UPDATE production.subscriptions SET status=$2, plan_id=$3, current_period_end=$4, cancel_at_period_end=$5 WHERE id=$1`,
        [sub.id, status, planId, periodEnd, !!obj.cancel_at_period_end],
      );
      return;
    }

    case 'customer.subscription.deleted': {
      const sub = await subByProviderId(obj.id);
      if (!sub) return;
      await query(`UPDATE production.subscriptions SET status='cancelled', cancelled_at=NOW() WHERE id=$1`, [sub.id]);
      await notify({ userId: sub.user_id, type: 'expired', title: 'Your subscription ended', body: 'Your subscription has ended. Resubscribe anytime to keep listening.', metadata: { subscription_id: sub.id } });
      return;
    }

    default:
      logger.debug({ type: event.type }, 'unhandled webhook event');
  }
}

function mapStripeStatus(s) {
  return ({
    trialing: 'trialing', active: 'active', past_due: 'past_due',
    unpaid: 'payment_failed', canceled: 'cancelled', incomplete_expired: 'expired',
  })[s] || 'active';
}

async function subByProviderId(providerSubscriptionId) {
  if (!providerSubscriptionId) return null;
  const r = await query('SELECT * FROM production.subscriptions WHERE provider_subscription_id = $1 LIMIT 1', [providerSubscriptionId]);
  return r.rows[0] || null;
}

async function loadUser(userId) {
  const r = await query('SELECT id, email, display_name FROM identity.users WHERE id = $1', [userId]);
  return r.rows[0] ? { id: r.rows[0].id, email: r.rows[0].email, displayName: r.rows[0].display_name } : null;
}

export default router;
