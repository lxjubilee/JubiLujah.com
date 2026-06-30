import { Router } from 'express';
import { z } from 'zod';
import { ah } from '../util/async.js';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { HttpError, requireAuth } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import { getPaymentProvider } from '../services/payments/index.js';
import { notify, nameParts } from '../services/notifications.js';
import {
  listPlans, getPlanByCode, getPlanById, getEntitlement, getActiveSubscription,
  subscriptionView, activateSubscription, transition, monthFrom, findActivatedByProviderSub,
} from '../services/subscriptions.js';

// ============================================================================
// Subscription API (user-facing). All money handling is delegated to the
// configured payment provider (services/payments/*); this router owns the
// Jubilujah-side subscription lifecycle, audit and notifications.
//
//   GET  /api/subscriptions/plans          — plan catalog (public)
//   GET  /api/subscriptions/me             — my entitlement + subscription
//   POST /api/subscriptions/checkout       — start a checkout (returns gateway url)
//   POST /api/subscriptions/cancel         — cancel (at period end or immediate)
//   POST /api/subscriptions/reactivate     — undo a pending cancellation
//   POST /api/subscriptions/change         — upgrade / downgrade plan
//   GET  /api/subscriptions/billing        — payment + renewal history
//   GET  /api/subscriptions/notifications  — in-app subscription notifications
//   POST /api/subscriptions/portal         — gateway billing-portal url (Stripe)
// ============================================================================
const router = Router();

// ---- Public: plan catalog --------------------------------------------------
router.get('/plans', ah(async (req, res) => {
  res.json({ plans: await listPlans() });
}));

// ---- My subscription + entitlement ----------------------------------------
router.get('/me', requireAuth, ah(async (req, res) => {
  const userId = req.auth.user.id;
  const entitlement = await getEntitlement(userId);
  const live = await getActiveSubscription(userId);
  res.json({
    entitlement,
    subscription: live ? subscriptionView(live) : null,
  });
}));

// ---- Checkout --------------------------------------------------------------
const checkoutSchema = z.object({
  plan_code: z.string().min(1).max(40),
});

router.post('/checkout', requireAuth, validate(checkoutSchema), ah(async (req, res) => {
  const user = req.auth.user;
  const plan = await getPlanByCode(req.body.plan_code);
  if (!plan || !plan.is_active) throw new HttpError(404, 'Unknown plan');
  if (!plan.is_paid) throw new HttpError(400, 'The Free plan does not require checkout');

  // Already on this exact plan and entitled? Nothing to buy.
  const ent = await getEntitlement(user.id);
  if (ent.isPaid && ent.subscription?.plan_code === plan.code) {
    throw new HttpError(409, `You are already subscribed to the ${plan.name} plan`);
  }

  const provider = getPaymentProvider();
  if (!provider.isConfigured()) {
    throw new HttpError(503, 'Payments are not configured. Set up the payment gateway to enable checkout.');
  }

  const existing = await getActiveSubscription(user.id);
  const successUrl = `${config.webBaseUrl}${config.payments.successPath}`;
  const cancelUrl = `${config.webBaseUrl}${config.payments.cancelPath}`;

  const session = await provider.createCheckoutSession({
    user, plan, successUrl, cancelUrl,
    customerId: existing?.provider_customer_id || null,
  });

  // Record the checkout attempt (pending until the gateway confirms).
  await query(
    `INSERT INTO production.subscription_transactions
       (subscription_id, user_id, type, provider, provider_ref, amount_cents, currency, status, metadata)
     VALUES ($1,$2,'checkout',$3,$4,$5,$6,$7,$8)`,
    [existing?.id || null, user.id, provider.id, session.sessionId, plan.price_cents, plan.currency,
     provider.autoActivates ? 'succeeded' : 'pending', JSON.stringify({ plan: plan.code })],
  );

  // In-process providers (mock) have no hosted page / webhook — activate now so
  // the dev flow completes end-to-end. Stripe activates via the signed webhook.
  if (provider.autoActivates) {
    const periodStart = new Date();
    await activateSubscription({
      userId: user.id, plan, provider: provider.id,
      providerCustomerId: session.customerId, providerSubscriptionId: session.subscriptionId,
      periodStart, periodEnd: monthFrom(periodStart), status: 'active', actor: 'user',
      amountCents: plan.price_cents, currency: plan.currency,
      invoiceId: session.invoiceId, invoiceUrl: session.invoiceUrl, paymentIntentId: session.paymentIntentId,
      user,
    });
    return res.json({ url: session.url, activated: true, provider: provider.id });
  }

  res.json({ url: session.url, activated: false, provider: provider.id });
}));

// ---- Confirm a completed checkout (success-page verification) ---------------
// Activates the subscription immediately after the gateway redirect, verifying
// the session server-side. Idempotent with the webhook: whichever lands first
// activates; the other is a no-op. This is what makes activation work locally
// without a webhook tunnel, and a safety net in production.
const confirmSchema = z.object({ session_id: z.string().min(1).max(200) });

router.post('/confirm', requireAuth, validate(confirmSchema), ah(async (req, res) => {
  const user = req.auth.user;
  const provider = getPaymentProvider();

  // Mock activates at checkout — just return the current live subscription.
  if (provider.autoActivates) {
    const live = await getActiveSubscription(user.id);
    return res.json({ activated: !!live, subscription: live ? subscriptionView(live) : null });
  }

  const session = await provider.retrieveCheckoutSession(req.body.session_id);
  if (!session) throw new HttpError(404, 'Checkout session not found');
  const ref = session.client_reference_id || session.metadata?.user_id;
  if (ref && ref !== user.id) throw new HttpError(403, 'This checkout belongs to a different account');

  const paid = session.payment_status === 'paid' || session.status === 'complete';
  if (!paid) return res.json({ activated: false, pending: true });

  const providerSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;

  // Idempotent: if this gateway subscription is already active for the user, done.
  const already = await findActivatedByProviderSub(user.id, providerSubscriptionId);
  if (already) {
    return res.json({ activated: true, subscription: subscriptionView(already) });
  }

  const planCode = session.metadata?.plan_code;
  const plan = planCode ? await getPlanByCode(planCode) : null;
  if (!plan) throw new HttpError(422, 'Could not resolve the plan for this checkout');

  const invoice = session.invoice && typeof session.invoice === 'object' ? session.invoice : null;
  const subObj = session.subscription && typeof session.subscription === 'object' ? session.subscription : null;
  const periodStart = subObj?.current_period_start ? new Date(subObj.current_period_start * 1000) : new Date();
  const periodEnd = subObj?.current_period_end ? new Date(subObj.current_period_end * 1000) : monthFrom(periodStart);

  await activateSubscription({
    userId: user.id, plan, provider: provider.id,
    providerCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
    providerSubscriptionId, periodStart, periodEnd, status: 'active', actor: 'user',
    amountCents: session.amount_total ?? plan.price_cents, currency: session.currency || plan.currency,
    invoiceId: (typeof session.invoice === 'string' ? session.invoice : invoice?.id) || null,
    invoiceUrl: invoice?.hosted_invoice_url || null, invoicePdfUrl: invoice?.invoice_pdf || null, user,
  });

  const live = await getActiveSubscription(user.id);
  res.json({ activated: true, subscription: live ? subscriptionView(live) : null });
}));

// ---- Cancel ----------------------------------------------------------------
const cancelSchema = z.object({ immediate: z.boolean().optional() });

router.post('/cancel', requireAuth, validate(cancelSchema), ah(async (req, res) => {
  const userId = req.auth.user.id;
  const sub = await getActiveSubscription(userId);
  if (!sub) throw new HttpError(404, 'No active subscription to cancel');
  const immediate = !!req.body.immediate;

  const provider = getPaymentProvider();
  try {
    if (sub.provider_subscription_id) {
      await provider.cancelSubscription({ providerSubscriptionId: sub.provider_subscription_id, atPeriodEnd: !immediate });
    }
  } catch (err) {
    logger.error({ err, sub: sub.id }, 'gateway cancel failed');
    throw new HttpError(502, 'Could not cancel with the payment provider. Please try again.');
  }

  const updated = await withTransaction(async (client) => {
    const r = await client.query(
      immediate
        ? `UPDATE production.subscriptions SET status='cancelled', cancel_at_period_end=FALSE, cancelled_at=NOW() WHERE id=$1 RETURNING *`
        : `UPDATE production.subscriptions SET cancel_at_period_end=TRUE, cancelled_at=NOW() WHERE id=$1 RETURNING *`,
      [sub.id],
    );
    await client.query(
      `INSERT INTO production.subscription_transactions (subscription_id, user_id, type, provider, status, metadata)
       VALUES ($1,$2,'cancellation',$3,'succeeded',$4)`,
      [sub.id, userId, sub.provider, JSON.stringify({ immediate })],
    );
    await transition(client, { subscriptionId: sub.id, userId, event: 'cancelled', fromStatus: sub.status, toStatus: immediate ? 'cancelled' : sub.status, actor: 'user', actorUserId: userId, metadata: { immediate } });
    return r.rows[0];
  });

  const { fullName: cancelName } = nameParts(req.auth.user);
  await notify({
    userId, type: 'cancelled',
    title: immediate ? 'Your subscription was cancelled' : 'Your subscription will not renew',
    body: immediate
      ? 'Your subscription has ended. You can resubscribe anytime.'
      : `Your subscription stays active until ${fmtDate(updated.current_period_end)}, then it will not renew.`,
    metadata: { subscription_id: sub.id, immediate },
    email: req.auth.user.email ? {
      to: req.auth.user.email,
      subject: 'Your Jubilujah subscription was cancelled',
      heading: immediate ? 'Your subscription has ended' : 'Your subscription will not renew',
      intro: immediate
        ? `${cancelName ? `Hi ${cancelName}, your` : 'Your'} Jubilujah subscription has been cancelled and access to premium features has ended. We hope to see you again soon.`
        : `${cancelName ? `Hi ${cancelName}, your` : 'Your'} Jubilujah subscription has been set to not renew. You'll keep full access until ${fmtDate(updated.current_period_end)}.`,
      ctaLabel: 'Resubscribe', ctaUrl: `${config.webBaseUrl}/subscription`,
    } : null,
  });

  res.json({ subscription: viewLive(updated, sub) });
}));

// ---- Reactivate (undo a pending cancellation) ------------------------------
router.post('/reactivate', requireAuth, ah(async (req, res) => {
  const userId = req.auth.user.id;
  const sub = await getActiveSubscription(userId);
  if (!sub) throw new HttpError(404, 'No subscription to reactivate');
  if (!sub.cancel_at_period_end && sub.status === 'active') {
    throw new HttpError(409, 'Subscription is already active and renewing');
  }

  const provider = getPaymentProvider();
  try {
    if (sub.provider_subscription_id) await provider.reactivateSubscription({ providerSubscriptionId: sub.provider_subscription_id });
  } catch (err) {
    logger.error({ err, sub: sub.id }, 'gateway reactivate failed');
    throw new HttpError(502, 'Could not reactivate with the payment provider.');
  }

  const updated = await withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE production.subscriptions SET status='active', cancel_at_period_end=FALSE, cancelled_at=NULL WHERE id=$1 RETURNING *`,
      [sub.id],
    );
    await transition(client, { subscriptionId: sub.id, userId, event: 'reactivated', fromStatus: sub.status, toStatus: 'active', actor: 'user', actorUserId: userId });
    return r.rows[0];
  });

  await notify({ userId, type: 'reactivated', title: 'Your subscription was reactivated', body: 'Welcome back — your subscription will continue to renew.', metadata: { subscription_id: sub.id } });
  res.json({ subscription: viewLive(updated, sub) });
}));

// ---- Change plan (upgrade / downgrade) -------------------------------------
const changeSchema = z.object({ plan_code: z.string().min(1).max(40) });

router.post('/change', requireAuth, validate(changeSchema), ah(async (req, res) => {
  const user = req.auth.user;
  const sub = await getActiveSubscription(user.id);
  if (!sub) throw new HttpError(400, 'No active subscription — use checkout to subscribe');
  const newPlan = await getPlanByCode(req.body.plan_code);
  if (!newPlan || !newPlan.is_active || !newPlan.is_paid) throw new HttpError(404, 'Unknown plan');
  if (newPlan.code === sub.plan_code) throw new HttpError(409, `Already on the ${newPlan.name} plan`);

  const provider = getPaymentProvider();
  try {
    if (sub.provider_subscription_id) {
      await provider.changeSubscription({ providerSubscriptionId: sub.provider_subscription_id, newPlan });
    }
  } catch (err) {
    logger.error({ err, sub: sub.id }, 'gateway plan change failed');
    throw new HttpError(502, 'Could not change the plan with the payment provider.');
  }

  const updated = await withTransaction(async (client) => {
    const r = await client.query(
      `UPDATE production.subscriptions SET plan_id=$2 WHERE id=$1 RETURNING *`,
      [sub.id, newPlan.id],
    );
    // Family-group bookkeeping when crossing the individual<->family boundary.
    if (newPlan.code === 'family') {
      const grp = await client.query(
        `INSERT INTO production.family_groups (subscription_id, owner_user_id, max_members)
         VALUES ($1,$2,$3) ON CONFLICT (subscription_id) DO UPDATE SET max_members=EXCLUDED.max_members RETURNING id`,
        [sub.id, user.id, newPlan.max_members],
      );
      await client.query(
        `INSERT INTO production.family_members (family_group_id, user_id, is_owner, status)
         VALUES ($1,$2,TRUE,'active') ON CONFLICT (family_group_id, user_id) DO UPDATE SET status='active', removed_at=NULL`,
        [grp.rows[0].id, user.id],
      );
    } else if (sub.plan_code === 'family') {
      // Downgrade away from family: release the linked members.
      await client.query(
        `UPDATE production.family_members fm SET status='removed', removed_at=NOW()
           FROM production.family_groups fg
          WHERE fm.family_group_id = fg.id AND fg.subscription_id = $1 AND fm.is_owner = FALSE AND fm.status='active'`,
        [sub.id],
      );
    }
    await client.query(
      `INSERT INTO production.subscription_transactions (subscription_id, user_id, type, provider, status, metadata)
       VALUES ($1,$2,'plan_change',$3,'succeeded',$4)`,
      [sub.id, user.id, sub.provider, JSON.stringify({ from: sub.plan_code, to: newPlan.code })],
    );
    await client.query(
      `INSERT INTO production.subscription_history (subscription_id, user_id, event, from_status, to_status, from_plan, to_plan, actor, actor_user_id)
       VALUES ($1,$2,'plan_changed',$3,$3,$4,$5,'user',$2)`,
      [sub.id, user.id, sub.status, sub.plan_code, newPlan.code],
    );
    return r.rows[0];
  });

  const { fullName: changeName, firstName: changeFirst } = nameParts(user);
  await notify({
    userId: user.id, type: 'plan_changed',
    title: `You're now on the ${newPlan.name} plan`,
    body: 'Your plan change is effective immediately. Billing adjusts at your next cycle.',
    metadata: { subscription_id: sub.id, from: sub.plan_code, to: newPlan.code },
    email: user.email ? {
      to: user.email,
      subject: `You're now on the Jubilujah ${newPlan.name} plan`,
      heading: changeFirst ? `Plan updated, ${changeFirst}` : 'Your plan was updated',
      intro: `${changeName ? `Hi ${changeName}, your` : 'Your'} Jubilujah plan has been changed to the ${newPlan.name} plan, effective immediately. Your billing adjusts at your next cycle.`,
      rows: [
        { label: 'New plan', value: newPlan.name },
        { label: 'Price', value: newPlan.price_cents === 0 ? 'Free' : `$${(newPlan.price_cents / 100).toFixed(2)} / ${newPlan.billing_interval}` },
        { label: 'Renews', value: new Date(updated.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) },
      ],
      ctaLabel: 'Manage subscription', ctaUrl: `${config.webBaseUrl}/account/subscription`,
    } : null,
  });

  const live = await getActiveSubscription(user.id);
  res.json({ subscription: subscriptionView(live) });
}));

// ---- Billing history -------------------------------------------------------
router.get('/billing', requireAuth, ah(async (req, res) => {
  const userId = req.auth.user.id;
  const payments = await query(
    `SELECT id, amount_cents, currency, status, description, invoice_url, invoice_pdf_url, refunded_cents,
            provider_invoice_id, provider_payment_intent, paid_at, created_at
       FROM production.payment_records WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [userId],
  );
  const renewals = await query(
    `SELECT r.id, r.period_start, r.period_end, r.amount_cents, r.currency, r.status, r.created_at
       FROM production.subscription_renewals r
       JOIN production.subscriptions s ON s.id = r.subscription_id
      WHERE s.user_id = $1 ORDER BY r.period_end DESC LIMIT 100`,
    [userId],
  );
  res.json({
    payments: payments.rows.map((p) => ({
      ...p,
      amount_display: `$${(p.amount_cents / 100).toFixed(2)}`,
    })),
    renewals: renewals.rows,
  });
}));

// ---- In-app notifications --------------------------------------------------
router.get('/notifications', requireAuth, ah(async (req, res) => {
  const r = await query(
    `SELECT id, type, title, body, read_at, created_at FROM production.subscription_notifications
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.auth.user.id],
  );
  res.json({ notifications: r.rows });
}));

router.post('/notifications/read', requireAuth, ah(async (req, res) => {
  await query(
    `UPDATE production.subscription_notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
    [req.auth.user.id],
  );
  res.json({ ok: true });
}));

// ---- Gateway billing portal (Stripe) ---------------------------------------
router.post('/portal', requireAuth, ah(async (req, res) => {
  const sub = await getActiveSubscription(req.auth.user.id);
  if (!sub?.provider_customer_id) throw new HttpError(404, 'No billing account to manage');
  const provider = getPaymentProvider();
  const url = await provider.getBillingPortalUrl({
    customerId: sub.provider_customer_id,
    returnUrl: `${config.webBaseUrl}/account/subscription`,
  });
  res.json({ url });
}));

// Build a subscriptionView-shaped object from an UPDATE RETURNING row that lacks
// the joined plan columns (reuse the pre-update sub's plan metadata).
function viewLive(updatedRow, priorWithPlan) {
  return subscriptionView({ ...updatedRow, plan_code: priorWithPlan.plan_code, plan_name: priorWithPlan.plan_name, price_cents: priorWithPlan.price_cents });
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

export default router;
