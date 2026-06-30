import { config } from '../../config.js';
import { logger } from '../../logger.js';

// ============================================================================
// Stripe payment provider (the production gateway).
//
// PCI posture: we never touch card data. Checkout is Stripe-hosted (SAQ-A), and
// we persist only opaque references (customer / subscription / invoice ids) plus
// amounts. Activation is driven by signed webhooks, not the browser redirect, so
// a user can't self-activate by hitting the success URL.
//
// The `stripe` SDK is lazy-imported so the API boots/builds without the dep when
// PAYMENT_PROVIDER != stripe (mirrors the SendGrid lazy-load pattern).
// ============================================================================
let stripeClient = null;

async function getStripe() {
  if (stripeClient) return stripeClient;
  if (!config.payments.stripe.secretKey) {
    const err = new Error('Stripe is selected but STRIPE_SECRET_KEY is not configured');
    err.code = 'STRIPE_UNCONFIGURED';
    throw err;
  }
  const mod = await import('stripe');               // lazy — optional dependency
  const Stripe = mod.default || mod;
  stripeClient = new Stripe(config.payments.stripe.secretKey, { apiVersion: '2024-06-20' });
  return stripeClient;
}

export function createStripeProvider() {
  return {
    id: 'stripe',
    autoActivates: false,                            // activation arrives via webhook
    isConfigured: () => !!config.payments.stripe.secretKey,

    async createCheckoutSession({ user, plan, successUrl, cancelUrl, customerId }) {
      const stripe = await getStripe();
      const priceId = resolvePriceId(plan);
      if (!priceId) {
        const err = new Error(`No Stripe price configured for plan "${plan.code}"`);
        err.code = 'STRIPE_NO_PRICE';
        throw err;
      }
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        customer: customerId || undefined,
        customer_email: customerId ? undefined : user.email,
        client_reference_id: user.id,
        // Echoed back on the webhook so we can bind the subscription to our user/plan.
        subscription_data: { metadata: { user_id: user.id, plan_code: plan.code } },
        metadata: { user_id: user.id, plan_code: plan.code },
        allow_promotion_codes: true,
      });
      logger.info({ user: user.id, plan: plan.code, session: session.id }, '[payments:stripe] checkout session created');
      return { provider: 'stripe', url: session.url, sessionId: session.id, customerId: session.customer || customerId || null };
    },

    // Retrieve a completed Checkout Session for success-page verification, with
    // the subscription + invoice expanded so we can activate without waiting on
    // the async webhook (belt-and-suspenders; both paths are idempotent).
    async retrieveCheckoutSession(sessionId) {
      const stripe = await getStripe();
      return stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['subscription', 'invoice', 'subscription.latest_invoice'],
      });
    },

    async cancelSubscription({ providerSubscriptionId, atPeriodEnd = true }) {
      const stripe = await getStripe();
      if (atPeriodEnd) {
        await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true });
      } else {
        await stripe.subscriptions.cancel(providerSubscriptionId);
      }
      return { ok: true, atPeriodEnd };
    },

    async reactivateSubscription({ providerSubscriptionId }) {
      const stripe = await getStripe();
      await stripe.subscriptions.update(providerSubscriptionId, { cancel_at_period_end: false });
      return { ok: true };
    },

    async changeSubscription({ providerSubscriptionId, newPlan }) {
      const stripe = await getStripe();
      const priceId = resolvePriceId(newPlan);
      if (!priceId) {
        const err = new Error(`No Stripe price configured for plan "${newPlan.code}"`);
        err.code = 'STRIPE_NO_PRICE';
        throw err;
      }
      const sub = await stripe.subscriptions.retrieve(providerSubscriptionId);
      const itemId = sub.items.data[0]?.id;
      await stripe.subscriptions.update(providerSubscriptionId, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'create_prorations',
        metadata: { plan_code: newPlan.code },
      });
      return { ok: true };
    },

    async createRefund({ providerPaymentIntentId, amountCents }) {
      const stripe = await getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: providerPaymentIntentId,
        amount: amountCents || undefined,            // omit => full refund
      });
      return { ok: true, refundId: refund.id, amountCents: refund.amount };
    },

    async getBillingPortalUrl({ customerId, returnUrl }) {
      const stripe = await getStripe();
      const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return portal.url;
    },

    // Verify the Stripe-Signature header against the raw request body. Throws on
    // a bad signature so the route can answer 400 (never trust an unsigned event).
    async verifyWebhook({ rawBody, signature }) {
      const stripe = await getStripe();
      const secret = config.payments.stripe.webhookSecret;
      if (!secret) {
        const err = new Error('STRIPE_WEBHOOK_SECRET not configured');
        err.code = 'STRIPE_NO_WEBHOOK_SECRET';
        throw err;
      }
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    },
  };
}

// Prefer an explicit env override, else the price stored on the plan row.
function resolvePriceId(plan) {
  const env = config.payments.stripe;
  if (plan.code === 'individual' && env.priceIndividual) return env.priceIndividual;
  if (plan.code === 'family' && env.priceFamily) return env.priceFamily;
  return plan.provider_price_id || null;
}
