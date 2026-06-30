import crypto from 'node:crypto';
import { logger } from '../../logger.js';

// ============================================================================
// Mock payment provider — a fully in-process gateway for local/dev/test.
//
// It implements the same interface as the Stripe adapter but performs no network
// calls and stores no card data. `autoActivates = true` tells the subscriptions
// route to activate the subscription immediately on checkout (there is no hosted
// page / webhook round-trip), so the entire subscribe → activate → manage →
// cancel flow is exercisable with zero external configuration.
// ============================================================================
export function createMockProvider() {
  return {
    id: 'mock',
    autoActivates: true,
    isConfigured: () => true,

    async createCheckoutSession({ user, plan, successUrl }) {
      const sessionId = `mock_cs_${crypto.randomBytes(10).toString('hex')}`;
      const customerId = `mock_cus_${crypto.createHash('sha1').update(user.id).digest('hex').slice(0, 16)}`;
      const subscriptionId = `mock_sub_${crypto.randomBytes(10).toString('hex')}`;
      logger.info({ user: user.id, plan: plan.code, sessionId }, '[payments:mock] checkout session created (auto-activating)');
      return {
        provider: 'mock',
        url: successUrl,                 // no hosted page — return straight to success
        sessionId,
        customerId,
        subscriptionId,
        invoiceId: `mock_in_${crypto.randomBytes(8).toString('hex')}`,
        paymentIntentId: `mock_pi_${crypto.randomBytes(8).toString('hex')}`,
        invoiceUrl: null,
      };
    },

    // Mock activates at checkout, so there is no session to re-verify.
    async retrieveCheckoutSession() { return null; },

    async cancelSubscription({ atPeriodEnd = true } = {}) {
      return { ok: true, atPeriodEnd };
    },
    async reactivateSubscription() {
      return { ok: true };
    },
    async changeSubscription() {
      return { ok: true };
    },
    async createRefund({ amountCents }) {
      return { ok: true, refundId: `mock_re_${crypto.randomBytes(8).toString('hex')}`, amountCents };
    },
    async getBillingPortalUrl({ returnUrl }) {
      return returnUrl;
    },

    // Mock has no real webhooks; accept any payload as a no-op event.
    verifyWebhook() {
      return { type: 'mock.noop', data: { object: {} } };
    },
  };
}
