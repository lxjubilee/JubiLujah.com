#!/usr/bin/env node
// ============================================================================
// One-time (idempotent) Stripe setup for the Jubilujah subscription plans.
//
// Creates a Stripe Product + recurring monthly Price for each paid plan and
// writes the resulting price id back onto production.subscription_plans, so the
// checkout flow can resolve plan -> Stripe price with no hard-coded ids.
//
// Usage (from app/api):
//   STRIPE_SECRET_KEY=sk_test_... DATABASE_URL=postgres://... node scripts/stripe-setup.mjs
//
// Re-running is safe: it reuses a plan's existing product/price when already set.
// Prints the price ids so you can also drop them into env if you prefer:
//   STRIPE_PRICE_INDIVIDUAL=..., STRIPE_PRICE_FAMILY=...
// ============================================================================
import 'dotenv/config';
import pg from 'pg';

const SECRET = process.env.STRIPE_SECRET_KEY;
const DB = process.env.DATABASE_URL;
if (!SECRET) { console.error('Missing STRIPE_SECRET_KEY'); process.exit(1); }
if (!DB) { console.error('Missing DATABASE_URL'); process.exit(1); }

const { default: Stripe } = await import('stripe');
const stripe = new Stripe(SECRET, { apiVersion: '2024-06-20' });
const pool = new pg.Pool({ connectionString: DB });

const PAID_CODES = ['individual', 'family'];

try {
  for (const code of PAID_CODES) {
    const { rows } = await pool.query('SELECT * FROM production.subscription_plans WHERE code=$1', [code]);
    const plan = rows[0];
    if (!plan) { console.warn(`! plan "${code}" not found — run migrations first`); continue; }
    if (plan.provider_price_id) { console.log(`= ${code}: already linked to price ${plan.provider_price_id}`); continue; }

    const product = await stripe.products.create({
      name: `Jubilujah ${plan.name}`,
      description: plan.description || undefined,
      metadata: { plan_code: code },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price_cents,
      currency: plan.currency,
      recurring: { interval: plan.billing_interval },
      metadata: { plan_code: code },
    });
    await pool.query(
      `UPDATE production.subscription_plans
          SET provider='stripe', provider_product_id=$2, provider_price_id=$3
        WHERE code=$1`,
      [code, product.id, price.id],
    );
    console.log(`+ ${code}: product ${product.id} -> price ${price.id} ($${(plan.price_cents / 100).toFixed(2)}/${plan.billing_interval})`);
  }
  console.log('\nDone. Set STRIPE_WEBHOOK_SECRET and point a Stripe webhook at /api/subscriptions/webhook for:');
  console.log('  checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted');
} catch (err) {
  console.error('stripe-setup failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
