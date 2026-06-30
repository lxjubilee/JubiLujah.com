import { config } from '../../config.js';
import { logger } from '../../logger.js';
import { createStripeProvider } from './stripe.js';
import { createMockProvider } from './mock.js';

// ============================================================================
// Payment provider factory. The active gateway is chosen by config.payments
// .provider (env PAYMENT_PROVIDER). Adding a new gateway (PayPal, Razorpay, …)
// means dropping a new adapter file that implements the same interface and
// registering it here — no route changes required (BRD §Billing: configurable).
//
// Interface every adapter implements:
//   id: string
//   autoActivates: boolean                      // true => activate on checkout (no webhook)
//   isConfigured(): boolean
//   createCheckoutSession({ user, plan, successUrl, cancelUrl, customerId }): {url, sessionId, customerId, ...}
//   cancelSubscription({ providerSubscriptionId, atPeriodEnd }): {ok}
//   reactivateSubscription({ providerSubscriptionId }): {ok}
//   changeSubscription({ providerSubscriptionId, newPlan }): {ok}
//   createRefund({ providerPaymentIntentId, amountCents }): {ok, refundId}
//   getBillingPortalUrl({ customerId, returnUrl }): string
//   verifyWebhook({ rawBody, signature }): event
// ============================================================================
let cached = null;

export function getPaymentProvider() {
  if (cached) return cached;
  const name = config.payments.provider;
  if (name === 'stripe') {
    cached = createStripeProvider();
  } else if (name === 'mock') {
    cached = createMockProvider();
  } else {
    logger.warn({ provider: name }, 'unknown PAYMENT_PROVIDER; falling back to mock');
    cached = createMockProvider();
  }
  logger.info({ provider: cached.id, configured: cached.isConfigured() }, 'payment provider selected');
  return cached;
}
